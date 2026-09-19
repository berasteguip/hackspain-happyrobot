import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { DEFAULT_SCENARIO_ID, SCENARIOS, scenarioById } from './scenarios'
import type { FireScenario } from './scenario'
import { MAX_FORECAST_MIN, buildFireForecast, exposureAt, forecastGeo, routeBlocked } from './fire-model'
import type { FireSettings } from './fire-model'
import { FireControls, FireSimBar, RefugeRoutesPanel, ResponsePanel, AlertsPanel, DispatchActions } from './CopPanels'
import type { DemoNotice } from './response'
import type { RefugeRoute } from './routing'
import { planCitizenRoute } from './routing'
import type { RouteIndex } from './routing'
import { detectAlerts, initialWatch, mergeAlerts } from './alerts'
import type { AlertAction, AlertWatch, CommandAlert } from './alerts'
import { createDispatch, moveUnits, originsFrom, planUnitRoute, UNIT_EMOJI } from './units'
import type { DispatchTarget, DispatchUnit, UnitKind } from './units'
import { advanceProtocol, moveEvacuees, prepareAreaCampaign, selectAreaIds } from './simulation'
import {
  CALL_STATE_LABEL, CALL_STATE_OPEN, DispatchFailed, dispatchCircle, fetchCalls, fetchRoster,
  readOperatorKey, saveOperatorKey,
} from './crisisApi'
import type { CallRun, CallStateName, DispatchResultSkip, RosterEntry } from './crisisApi'
import type { CallArea, CallEvent, Citizen, FireSpot, LocationPing, MapLayers, SafeZone } from './types'

/**
 * El censo que sirve la API (`/api/roster`) sustituye al de `scenario.ts` en cuanto responde.
 *
 * Sin backend, Vigía sigue pintando su población de Gredos y su campaña sigue siendo local:
 * eso es lo que se enseña cuando no hay API levantada. Con backend, los puntos del mapa son
 * las personas que la API puede llamar de verdad, y rodearlas significa marcar sus teléfonos.
 */
function citizenFromRoster(row: RosterEntry, index: number): Citizen {
  return {
    id: row.id,
    name: row.name || row.id,
    phone: row.phone || '',
    lng: row.lng as number,
    lat: row.lat as number,
    locality: row.locality || row.address || 'Escenario de la API',
    resident: true,
    status: row.call_state === 'answered' ? 'informed' : 'pending',
    vulnerable: row.vulnerable,
    safeZoneId: '',
    speedKmh: 26 + (index % 7) * 4,
    callDelaySec: 1 + (index % 48) * 1.4,
    outcome: 'tracking',
    locationSource: row.location_source === 'gps' ? 'gps' : 'reference',
    callState: row.call_state ?? undefined,
    dialable: row.dialable,
  }
}

const STATUS_LABEL: Record<Citizen['status'], string> = {
  pending: 'Sin contactar', ringing: 'En llamada', no_answer: 'Sin respuesta',
  informed: 'Aviso recibido', tracking: 'Ubicación compartida', evacuating: 'En tránsito',
  safe: 'En punto de encuentro', refused: 'No comparte ubicación', assistance: 'Sin ruta', routing: 'Calculando ruta',
}
const LOCATION_LABEL = {
  reference: 'Referencia residencial', simulation: 'Ubicación compartida',
  gps: 'GPS del dispositivo', unknown: 'Origen no especificado',
}
function layerOptions(scenario: FireScenario): { key: keyof MapLayers; name: string; detail: string; symbol: string }[] {
  const hospital = scenario.centers.find(center => center.kind === 'hospital')
  const health = scenario.centers.find(center => center.kind === 'health')
  const park = scenario.centers.find(center => center.kind === 'fire')
  return [
    { key: 'perimeter', name: 'Huella térmica', detail: 'Celdas del incendio', symbol: '🔥' },
    { key: 'spread', name: 'Propagación', detail: 'Avance desde el foco', symbol: '🌬️' },
    { key: 'routes', name: 'Ruta seleccionada', detail: 'Recorrido comparado', symbol: '🛣️' },
    { key: 'hospitals', name: 'Hospitales', detail: hospital?.name ?? 'Hospital', symbol: '' },
    { key: 'healthCenters', name: 'Centros de salud', detail: health?.name ?? 'Centro de salud', symbol: '' },
    { key: 'fireStations', name: 'Bomberos', detail: park?.name ?? 'Bomberos', symbol: '' },
    { key: 'thermal', name: 'Detecciones térmicas', detail: 'Focos puntuales', symbol: '🛰️' },
    { key: 'citizens', name: 'Personas', detail: 'Contacto y ubicación', symbol: '👥' },
    { key: 'references', name: 'Referencias residenciales', detail: 'Punto de partida', symbol: '📍' },
    { key: 'zones', name: 'Puntos de encuentro', detail: 'Destinos de evacuación', symbol: '' },
    { key: 'callArea', name: 'Zona de llamadas', detail: 'Círculo de la selección', symbol: '🎯' },
    { key: 'units', name: 'Medios', detail: 'Ambulancia, patrulla, bomberos', symbol: '' },
  ]
}
const INITIAL_WIND = 225
const SHIFTED_WIND = 45
const MAX_UNITS = 12
function formatClock(date: Date) {
  return date.toLocaleTimeString('es-ES', { hour12: false })
}
function locationAge(ts: number | undefined, now: number) {
  if (!ts) return 'Sin observación reciente'
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 60) return `Hace ${seconds} s`
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`
  return `Hace ${Math.floor(seconds / 3600)} h`
}

export function CommandCenter({ token }: { token: string }) {
  const [now, setNow] = useState(() => new Date())
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID)
  const scenario = useMemo(() => scenarioById(scenarioId), [scenarioId])
  const origins = useMemo(() => originsFrom(scenario.centers, scenario.police), [scenario])
  const [citizens, setCitizens] = useState<Citizen[]>(() => scenarioById(DEFAULT_SCENARIO_ID).citizens)
  const [events, setEvents] = useState<CallEvent[]>([])
  const [protocolOn, setProtocolOn] = useState(false)
  const [callArea, setCallArea] = useState<CallArea | null>(null)
  const [areaIds, setAreaIds] = useState<string[]>([])
  const [drawingArea, setDrawingArea] = useState(false)
  const [campaignIds, setCampaignIds] = useState<string[]>([])
  // --- modo "llamadas reales": el círculo se manda a la API y ella dispara HappyRobot ---
  const [liveMode, setLiveMode] = useState(false)
  const [operatorKey, setOperatorKey] = useState(() => readOperatorKey())
  const [liveBatch, setLiveBatch] = useState<{ id: string; skipped: DispatchResultSkip[] } | null>(null)
  const [liveCalls, setLiveCalls] = useState<CallRun[]>([])
  const [dispatchError, setDispatchError] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [apiRoster, setApiRoster] = useState(false)
  const campaignRef = useRef<ReadonlySet<string>>(new Set())
  const campaignSet = useMemo(() => new Set(campaignIds), [campaignIds])
  const [planningCount, setPlanningCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | 'cop' | 'centers' | 'alerts' | null>(null)
  const [fireSettings, setFireSettings] = useState<FireSettings>({ windTowardDeg: INITIAL_WIND, windKmh: 20, spreadMPerMin: 8 })
  const [horizon, setHorizon] = useState(0)
  const [firePlaying, setFirePlaying] = useState(false)
  const horizonRef = useRef(0)
  const [showWind, setShowWind] = useState(false)
  const marginM = 150
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lng: number; lat: number; zoom?: number; bounds?: [[number, number], [number, number]] } | null>(null)
  const [mapRoute, setMapRoute] = useState<RefugeRoute | null>(null)
  const [notices, setNotices] = useState<DemoNotice[]>([])
  const forecast = useMemo(() => buildFireForecast(scenario.fireCells, fireSettings), [scenario.fireCells, fireSettings])
  const projection = useMemo(() => forecastGeo(forecast, horizon), [forecast, horizon])
  const zoneExposure = useMemo(() => Object.fromEntries(scenario.safeZones.map(zone => [zone.id, exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)])), [forecast, horizon, marginM, scenario.safeZones])
  const forecastRef = useRef({ forecast, horizon, marginM })
  useEffect(() => { forecastRef.current = { forecast, horizon, marginM } }, [forecast, horizon, marginM])
  useEffect(() => { horizonRef.current = horizon }, [horizon])
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: true, thermal: false, citizens: true, references: true, zones: true, hospitals: true, healthCenters: true, fireStations: true, routes: true, callArea: true, units: true })
  useEffect(() => {
    if (!firePlaying) return
    const origin = horizonRef.current
    const started = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.min(MAX_FORECAST_MIN, origin + (performance.now() - started) / 1000 * 8)
      horizonRef.current = next
      setHorizon(next)
      if (next >= MAX_FORECAST_MIN) setFirePlaying(false)
    }, 80)
    return () => window.clearInterval(timer)
  }, [firePlaying])
  const [alerts, setAlerts] = useState<CommandAlert[]>([])
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => new Set())
  const [units, setUnits] = useState<DispatchUnit[]>([])
  const watchRef = useRef<AlertWatch | null>(null)
  const unitsRef = useRef<DispatchUnit[]>([])
  const unitSeqRef = useRef(0)
  const unitFlightRef = useRef(new Set<string>())
  const citizensRef = useRef(citizens)
  const routesRef = useRef<RouteIndex>(new Map())
  const plannedRef = useRef(new Set<string>())
  const inFlightRef = useRef(new Set<string>())
  const updatePopulation = useCallback((change: (current: Citizen[]) => Citizen[]) => {
    const next = change(citizensRef.current)
    citizensRef.current = next
    setCitizens(next)
  }, [])
  const elapsedRef = useRef(0)
  const peopleButtonRef = useRef<HTMLButtonElement>(null)
  const layersButtonRef = useRef<HTMLButtonElement>(null)
  const copButtonRef = useRef<HTMLButtonElement>(null)
  const centersButtonRef = useRef<HTMLButtonElement>(null)
  const alertsButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { citizensRef.current = citizens }, [citizens])
  useEffect(() => { unitsRef.current = units }, [units])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (drawingArea) { setDrawingArea(false); setCallArea(null); setAreaIds([]); return }
      setSelectedId(null)
      setPanel(null)
      if (panel === 'cop') copButtonRef.current?.focus()
      else if (panel === 'centers') centersButtonRef.current?.focus()
      else if (panel === 'alerts') alertsButtonRef.current?.focus()
      else if (panel === 'layers') layersButtonRef.current?.focus()
      else peopleButtonRef.current?.focus()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [panel, drawingArea])
  useEffect(() => {
    if (!showFirms) return
    let cancelled = false
    fetchFirmsSpain().then((spots) => {
      if (cancelled) return
      setFirms(spots)
      setFirmsState(`${spots.length} detecciones en España · últimas 24 h`)
    }).catch(() => {
      if (!cancelled) setFirmsState('Fuente no disponible. No se han añadido detecciones externas.')
    })
    return () => { cancelled = true }
  }, [showFirms])
  useEffect(() => {
    if (!protocolOn) return
    const controller = new AbortController()
    const schedule = () => {
      const candidates = citizensRef.current.filter(citizen => campaignRef.current.has(citizen.id) && !citizen.live && citizen.call?.consent === 'granted' && !citizen.routeId && ['tracking', 'routing', 'assistance'].includes(citizen.status) && !plannedRef.current.has(citizen.id))
      for (const citizen of candidates.slice(0, Math.max(0, 2 - inFlightRef.current.size))) {
        plannedRef.current.add(citizen.id)
        inFlightRef.current.add(citizen.id)
        setPlanningCount(inFlightRef.current.size)
        updatePopulation(current => current.map(item => item.id === citizen.id ? { ...item, status: 'routing', routeHoldReason: 'Consultando una ruta desde su posición…' } : item))
        void planCitizenRoute(token, citizen, scenario.safeZones, forecast, marginM, controller.signal).then(plan => {
          if (controller.signal.aborted) return
          updatePopulation(current => current.map(item => {
            if (item.id !== citizen.id || item.live || item.call?.consent !== 'granted') return item
            if (plan.route) routesRef.current.set(plan.route.id, plan.route)
            return { ...item, status: plan.citizen.status, safeZoneId: plan.citizen.safeZoneId, routeId: plan.citizen.routeId, routeProgressM: plan.citizen.routeProgressM, routePhase: plan.citizen.routePhase, routeHoldReason: plan.citizen.routeHoldReason }
          }))
        }).catch(() => {
          if (!controller.signal.aborted) updatePopulation(current => current.map(item => item.id === citizen.id && !item.live ? { ...item, status: 'assistance', routeHoldReason: 'No se pudo calcular la ruta individual. Puede reintentar la consulta.' } : item))
        }).finally(() => {
          inFlightRef.current.delete(citizen.id)
          setPlanningCount(inFlightRef.current.size)
          if (controller.signal.aborted) {
            plannedRef.current.delete(citizen.id)
            updatePopulation(current => current.map(item => item.id === citizen.id && !item.live && item.status === 'routing' ? { ...item, status: 'tracking', routeHoldReason: undefined } : item))
          }
        })
      }
    }
    const timer = window.setInterval(schedule, 250)
    return () => { window.clearInterval(timer); controller.abort() }
  }, [protocolOn, token, forecast, marginM, updatePopulation, scenario.safeZones])
  useEffect(() => {
    if (!protocolOn) return
    const started = performance.now()
    const baseline = elapsedRef.current
    let previousElapsed = baseline
    const timer = window.setInterval(() => {
      const nextElapsed = baseline + (performance.now() - started) / 1000
      const dt = nextElapsed - previousElapsed
      previousElapsed = nextElapsed
      elapsedRef.current = nextElapsed
      const advanced = advanceProtocol(citizensRef.current, nextElapsed, [], campaignRef.current)
      const risk = forecastRef.current
      const ready = advanced.citizens
      const moved = moveEvacuees(ready, routesRef.current, scenario.safeZones, dt).map((next, index) => {
        const previous = ready[index]
        if (next === previous || previous.live) return next
        const zone = scenario.safeZones.find(item => item.id === next.safeZoneId)
        const road = next.routeId ? routesRef.current.get(next.routeId) : undefined
        const hasRoad = road?.zoneId === next.safeZoneId && road?.group === (next.locality ?? '')
        const throughMinute = Math.max(60, risk.horizon)
        const exposed = !zone || exposureAt(risk.forecast, zone.lng, zone.lat, throughMinute, risk.marginM + zone.radiusM).level !== 'clear'
        return !hasRoad || exposed || routeBlocked(risk.forecast, [[previous.lng, previous.lat], [next.lng, next.lat]], 0, risk.marginM) ? { ...previous, status: 'assistance' as const, routeHoldReason: 'Recorrido detenido por exposición o falta de ruta. Pendiente de revisión del mando.' } : next
      })
      citizensRef.current = moved
      setCitizens(moved)
      const awaitingPlan = moved.some(citizen => campaignRef.current.has(citizen.id) && !citizen.live && citizen.call?.consent === 'granted' && !citizen.routeId && !plannedRef.current.has(citizen.id))
      if (!inFlightRef.current.size && !awaitingPlan && moved.every(citizen => !campaignRef.current.has(citizen.id) || citizen.live || !['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))) setProtocolOn(false)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 700))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn, scenario.safeZones])
  // El censo de la API manda sobre el de `scenario.ts` en cuanto responde.
  useEffect(() => {
    let cancelled = false
    void fetchRoster().then((rows) => {
      if (cancelled || !rows || !rows.length) return
      const desdeApi = rows.map(citizenFromRoster)
      citizensRef.current = desdeApi
      setCitizens(desdeApi)
      setApiRoster(true)
      const centro = desdeApi.reduce(
        (acc, c) => ({ lng: acc.lng + c.lng / desdeApi.length, lat: acc.lat + c.lat / desdeApi.length }),
        { lng: 0, lat: 0 },
      )
      setFocusTarget({ ...centro, zoom: 14 })
    })
    return () => { cancelled = true }
  }, [])

  // El tablero de la ráfaga viva: se refresca hasta que no quede ninguna llamada abierta.
  useEffect(() => {
    if (!liveBatch) return
    let cancelled = false
    const poll = async () => {
      const rows = await fetchCalls(operatorKey, liveBatch.id)
      if (cancelled || !rows) return
      setLiveCalls(rows)
      const porPersona = new Map(rows.map((row) => [row.person_id, row]))
      updatePopulation((current) => current.map((citizen) => {
        const call = porPersona.get(citizen.id)
        if (!call || citizen.callState === call.state) return citizen
        return {
          ...citizen,
          callState: call.state,
          status: call.state === 'answered' ? 'informed'
            : call.state === 'no_answer' ? 'no_answer'
            : CALL_STATE_OPEN.includes(call.state) ? 'ringing'
            : citizen.status,
        }
      }))
      if (!rows.some((row) => CALL_STATE_OPEN.includes(row.state))) window.clearInterval(id)
    }
    const id = window.setInterval(() => void poll(), 1500)
    void poll()
    return () => { cancelled = true; window.clearInterval(id) }
  }, [liveBatch, operatorKey, updatePopulation])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/api/locations')
        if (!res.ok) return
        const pings = (await res.json()) as LocationPing[]
        if (cancelled || !Array.isArray(pings) || !pings.length) return
        setCitizens((current) => mergePings(current, pings))
      } catch {
        // demo API is local-only
      }
    }
    const id = window.setInterval(() => void poll(), 1500)
    void poll()
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])
  useEffect(() => {
    const input = { citizens, forecast, marginM, horizon, windTowardDeg: fireSettings.windTowardDeg, campaignIds: campaignRef.current, now: Date.now(), settlements: scenario.settlements, safeZones: scenario.safeZones }
    if (!watchRef.current) watchRef.current = initialWatch(input)
    const detected = detectAlerts(input, watchRef.current)
    watchRef.current = detected.watch
    if (detected.alerts.length) setAlerts(previous => mergeAlerts(previous, detected.alerts))
  }, [citizens, forecast, horizon, marginM, fireSettings.windTowardDeg, scenario.settlements, scenario.safeZones])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const pending = unitsRef.current.filter(unit => unit.status === 'requested' && !unitFlightRef.current.has(unit.id))
      for (const unit of pending) {
        unitFlightRef.current.add(unit.id)
        void planUnitRoute(token, unit).then(planned => {
          unitsRef.current = unitsRef.current.map(item => item.id === planned.id ? planned : item)
          setUnits(unitsRef.current)
        }).catch(() => {
          unitsRef.current = unitsRef.current.map(item => item.id === unit.id ? { ...item, status: 'hold', hold: 'No se pudo calcular el acceso. Puede reintentar el envío.' } : item)
          setUnits(unitsRef.current)
        }).finally(() => { unitFlightRef.current.delete(unit.id) })
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [token])
  useEffect(() => {
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const dt = (now - previous) / 1000
      previous = now
      if (!unitsRef.current.some(unit => unit.status === 'en_route')) return
      const next = moveUnits(unitsRef.current, dt)
      unitsRef.current = next
      setUnits(next)
    }, 100)
    return () => window.clearInterval(timer)
  }, [])

  const fires = useMemo(() => showFirms ? [...scenario.fires, ...firms] : scenario.fires, [showFirms, firms, scenario.fires])
  const rosterCenter = useMemo(() => {
    if (!apiRoster || !citizens.length) return null
    return {
      lng: citizens.reduce((total, citizen) => total + citizen.lng, 0) / citizens.length,
      lat: citizens.reduce((total, citizen) => total + citizen.lat, 0) / citizens.length,
    }
  }, [apiRoster, citizens])
  const placeName = useMemo(() => {
    if (!apiRoster) return scenario.incident.area
    const porLocalidad = new Map<string, number>()
    for (const citizen of citizens) {
      const clave = citizen.locality ?? ''
      if (clave) porLocalidad.set(clave, (porLocalidad.get(clave) ?? 0) + 1)
    }
    return [...porLocalidad.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Escenario de la API'
  }, [apiRoster, citizens, scenario.incident.area])
  const counts = useMemo(() => ({
    total: citizens.length,
    answered: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.call).length,
    located: citizens.filter((citizen) => citizen.locationSource === 'gps' || citizen.locationSource === 'simulation').length,
    silent: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'no_answer').length,
    moving: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'evacuating').length,
    waiting: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance').length,
  }), [citizens, campaignSet])
  const callableCount = citizens.filter(citizen => areaIds.includes(citizen.id) && !citizen.live && citizen.status === 'pending' && !campaignSet.has(citizen.id)).length
  const campaignRunning = citizens.some(citizen => campaignSet.has(citizen.id) && !citizen.live && ['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))
  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const filtered = citizens.filter((citizen) => {
    const text = `${citizen.name} ${citizen.phone} ${citizen.id} ${citizen.locality} ${STATUS_LABEL[citizen.status]}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'outside' ? citizen.resident === false : citizen.status === filter))
  })
  const updateArea = (area: CallArea | null) => {
    setCallArea(area)
    setAreaIds(selectAreaIds(citizensRef.current, area))
  }
  const finishArea = (area: CallArea) => { updateArea(area); setDrawingArea(false) }
  const beginArea = () => {
    setSelectedId(null)
    setPanel(null)
    updateArea(null)
    setDrawingArea(true)
    setLayers(previous => ({ ...previous, citizens: true, references: true }))
  }
  /** Modo real: el círculo va a la API y vuelve un tablero de llamadas de verdad. */
  const launchLiveCampaign = async () => {
    if (drawingArea || !callArea || dispatching) return
    setDispatching(true)
    setDispatchError('')
    try {
      const resultado = await dispatchCircle(operatorKey, callArea, { operator: 'puesto de mando' })
      setLiveBatch({ id: resultado.batch_id, skipped: resultado.skipped_detail })
      setLiveCalls(resultado.calls)
      setCampaignIds(resultado.calls.map((call) => call.person_id))
      campaignRef.current = new Set(resultado.calls.map((call) => call.person_id))
      if (!resultado.dispatched) {
        setDispatchError('Nadie en esta zona se puede llamar ahora mismo. Mira el detalle de abajo.')
      }
    } catch (error) {
      setDispatchError(error instanceof DispatchFailed ? error.message : 'Fallo inesperado al lanzar las llamadas.')
    } finally {
      setDispatching(false)
    }
  }

  const launchAreaCampaign = () => {
    if (liveMode) { void launchLiveCampaign(); return }
    if (drawingArea || !callArea) return
    const campaign = prepareAreaCampaign(citizensRef.current, areaIds, elapsedRef.current, campaignRef.current)
    if (!campaign.addedIds.length) return
    campaignRef.current = new Set(campaign.ids)
    citizensRef.current = campaign.citizens
    setCitizens(campaign.citizens)
    setCampaignIds(campaign.ids)
    setProtocolOn(true)
  }
  const retryRoutes = () => {
    for (const citizen of citizensRef.current) {
      if (campaignRef.current.has(citizen.id) && !citizen.live && citizen.call?.consent === 'granted' && citizen.status === 'assistance') {
        plannedRef.current.delete(citizen.id)
        if (citizen.routeId) routesRef.current.delete(citizen.routeId)
      }
    }
    updatePopulation(current => current.map(citizen => campaignRef.current.has(citizen.id) && !citizen.live && citizen.call?.consent === 'granted' && citizen.status === 'assistance' ? { ...citizen, status: 'tracking', routeId: undefined, safeZoneId: '', routeProgressM: undefined, routePhase: undefined, routeHoldReason: undefined } : citizen))
    setProtocolOn(true)
  }
  const dispatchUnit = (kind: UnitKind, target: DispatchTarget) => {
    if (unitsRef.current.length >= MAX_UNITS) return
    try {
      const unit = createDispatch(kind, target, Date.now(), unitSeqRef.current, origins)
      unitSeqRef.current += 1
      unitsRef.current = [unit, ...unitsRef.current]
      setUnits(unitsRef.current)
      setLayers(previous => ({ ...previous, units: true }))
      setFocusTarget({ lng: unit.origin.lng, lat: unit.origin.lat, bounds: [[unit.origin.lng, unit.origin.lat], [target.lng, target.lat]] })
      setPanel('alerts')
    } catch {
      // destino inválido: no se crea el medio
    }
  }
  const targetFromCitizens = (ids: string[], fallback?: { lng: number; lat: number }, label = 'zona seleccionada'): DispatchTarget | null => {
    const group = ids.map(id => citizensRef.current.find(citizen => citizen.id === id)).filter((citizen): citizen is Citizen => Boolean(citizen))
    if (group.length) {
      return { lng: group.reduce((sum, citizen) => sum + citizen.lng, 0) / group.length, lat: group.reduce((sum, citizen) => sum + citizen.lat, 0) / group.length, label: group.length === 1 ? group[0].name : `${group.length} personas · ${label}`, citizenId: group[0].id }
    }
    if (fallback) return { ...fallback, label }
    return null
  }
  const handleAlertAction = (alert: CommandAlert, action: AlertAction) => {
    if (action === 'call-area' && alert.focus) {
      finishArea({ lng: alert.focus.lng, lat: alert.focus.lat, radiusM: alert.radiusM ?? 1200 })
      setPanel(null)
      return
    }
    if (action === 'review-routes') {
      setFilter('assistance')
      setPanel('people')
      if (alert.focus) setFocusTarget(alert.focus)
      return
    }
    const kind: UnitKind | undefined = action === 'dispatch-police' ? 'police' : action === 'dispatch-ambulance' ? 'ambulance' : action === 'dispatch-fire' ? 'fire' : undefined
    const target = kind ? targetFromCitizens(alert.citizenIds, alert.focus, alert.title) : null
    if (kind && target) dispatchUnit(kind, target)
  }
  const selectUnit = (id: string) => {
    const unit = unitsRef.current.find(item => item.id === id)
    if (!unit) return
    setSelectedId(null)
    setPanel('alerts')
    setFocusTarget({ lng: unit.lng, lat: unit.lat, zoom: 14 })
  }
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const togglePanel = (next: 'people' | 'layers' | 'cop' | 'centers' | 'alerts') => {
    setSelectedId(null)
    if (next === 'alerts') setReadAlertIds(new Set(alerts.map(alert => alert.id)))
    setPanel((current) => current === next ? null : next)
  }
  const selectScenario = (id: string) => {
    if (id === scenarioId) return
    const next = scenarioById(id)
    setScenarioId(id)
    setProtocolOn(false)
    setDrawingArea(false)
    setCallArea(null)
    setAreaIds([])
    campaignRef.current = new Set()
    setCampaignIds([])
    setPlanningCount(0)
    setSelectedId(null)
    setQuery('')
    setFilter('all')
    setPanel(null)
    setHorizon(0)
    setFirePlaying(false)
    setShowWind(false)
    setFireSettings({ windTowardDeg: INITIAL_WIND, windKmh: 20, spreadMPerMin: 8 })
    setSelectedCenterId(null)
    setFocusTarget({ lng: next.incident.center[0], lat: next.incident.center[1], zoom: next.incident.zoom })
    setMapRoute(null)
    setNotices([])
    setAlerts([])
    setReadAlertIds(new Set())
    setUnits([])
    unitsRef.current = []
    unitSeqRef.current = 0
    unitFlightRef.current.clear()
    setLiveBatch(null)
    setLiveCalls([])
    setDispatchError('')
    watchRef.current = null
    routesRef.current = new Map()
    plannedRef.current.clear()
    inFlightRef.current.clear()
    elapsedRef.current = 0
    citizensRef.current = next.citizens
    setCitizens(next.citizens)
    setEvents([])
  }
  const selectCenter = (id: string) => {
    const center = scenario.centers.find(item => item.id === id)
    if (!center) return
    setSelectedId(null)
    setSelectedCenterId(id)
    setPanel('centers')
    setFocusTarget({ lng: center.lng, lat: center.lat })
    setLayers(previous => ({ ...previous, [center.kind === 'hospital' ? 'hospitals' : center.kind === 'health' ? 'healthCenters' : 'fireStations']: true }))
  }
  const panelTitle = selected ? 'Ficha de persona' : panel === 'layers' ? 'Capas' : panel === 'cop' ? 'Propagación' : panel === 'centers' ? 'Centros' : panel === 'alerts' ? 'Avisos' : 'Personas'
  const scenarioLabel = `Escenario +${Math.round(horizon)} min · viento hacia ${fireSettings.windTowardDeg}° a ${fireSettings.windKmh} km/h · avance base ${fireSettings.spreadMPerMin} m/min · margen ${marginM} m`
  const playFire = () => {
    setLayers(previous => ({ ...previous, spread: true, perimeter: true }))
    setFirePlaying(active => !active)
  }
  const shiftWind = () => {
    setFireSettings(previous => ({ ...previous, windTowardDeg: SHIFTED_WIND }))
    setShowWind(true)
    setLayers(previous => ({ ...previous, spread: true }))
  }
  const resetFire = () => {
    setFirePlaying(false)
    setHorizon(0)
    setFireSettings(previous => ({ ...previous, windTowardDeg: INITIAL_WIND }))
  }
  const toggleWind = () => setShowWind(value => !value)
  const closePanel = () => {
    if (panel === 'cop') copButtonRef.current?.focus()
    else if (panel === 'centers') centersButtonRef.current?.focus()
    else if (panel === 'alerts') alertsButtonRef.current?.focus()
    else if (panel === 'layers') layersButtonRef.current?.focus()
    else peopleButtonRef.current?.focus()
    setSelectedId(null)
    setPanel(null)
  }
  const unreadAlerts = alerts.filter(alert => !readAlertIds.has(alert.id))
  const toasts = unreadAlerts.slice(0, 3)
  const windShifted = fireSettings.windTowardDeg !== INITIAL_WIND

  return (
    <div className="map-app">
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap key={scenario.id} token={token} citizens={citizens} fires={fires} zones={scenario.safeZones} selectedId={selectedId} layers={layers} onSelect={selectCitizen} projection={projection} zoneExposure={zoneExposure} horizon={horizon} marginM={marginM} route={mapRoute} focusTarget={focusTarget} onCenterSelect={selectCenter} showWind={showWind} windDirection={fireSettings.windTowardDeg} windKmh={fireSettings.windKmh} callArea={callArea} areaIds={areaIds} drawingArea={drawingArea} onAreaChange={updateArea} onAreaComplete={finishArea} units={units} onUnitSelect={selectUnit} fireCells={scenario.fireCells} centers={scenario.centers} incident={scenario.incident} />
      </main>
      <header className="floating-brand">
        <div className="brand-row"><span className="brand-symbol" aria-hidden="true">V</span><strong>vigía</strong>{apiRoster && <span className="demo-badge">API</span>}</div>
        <nav className="incident-list" aria-label="Incendios activos">
          {SCENARIOS.map(item => (
            <button type="button" key={item.id} aria-pressed={item.id === scenario.id} onClick={() => selectScenario(item.id)}>
              <i className="incident-dot" aria-hidden="true" />
              <span><strong>{item.incident.name}</strong><small>{apiRoster && item.id === scenario.id ? placeName : item.incident.area}</small></span>
            </button>
          ))}
        </nav>
      </header>
      <nav className="floating-actions" aria-label="Herramientas del mapa">
        <button type="button" aria-label="Dibujar zona de llamadas" aria-pressed={drawingArea} className={drawingArea ? 'active' : ''} onClick={beginArea}><Icon name="zone" /><span>Zona</span></button>
        <button ref={copButtonRef} type="button" aria-label="Propagación" className={panel === 'cop' ? 'active' : ''} aria-expanded={panel === 'cop'} aria-controls="map-panel" onClick={() => togglePanel('cop')}><Icon name="fire" /><span>Propagación</span></button>
        <button ref={centersButtonRef} type="button" aria-label="Centros y coordinación" className={panel === 'centers' ? 'active' : ''} aria-expanded={panel === 'centers'} aria-controls="map-panel" onClick={() => togglePanel('centers')}><Icon name="centers" /><span>Centros</span></button>
        <button ref={alertsButtonRef} type="button" aria-label={`Avisos ${unreadAlerts.length}`} className={panel === 'alerts' ? 'active' : ''} aria-expanded={panel === 'alerts'} aria-controls="map-panel" onClick={() => togglePanel('alerts')}><Icon name="alerts" /><span>Avisos</span>{unreadAlerts.length > 0 && <small>{unreadAlerts.length}</small>}</button>
        <button ref={peopleButtonRef} type="button" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}><Icon name="people" /><span>Personas</span><small>{counts.total}</small></button>
        <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}><Icon name="layers" /><span>Capas</span></button>
      </nav>
      <div className="minimal-legend" aria-label="Leyenda"><span><i className="legend-point" />Sin respuesta</span><span><i className="legend-point answered" />Llamada respondida</span><span><span className="center-mark meeting" aria-hidden="true" />Punto de encuentro</span><span className="legend-units"><span className="unit-emoji" aria-hidden="true">{UNIT_EMOJI.ambulance}</span><span className="unit-emoji" aria-hidden="true">{UNIT_EMOJI.police}</span><span className="unit-emoji" aria-hidden="true">{UNIT_EMOJI.fire}</span>Medios</span><span><i className="legend-fire" />Huella térmica</span></div>
      {panel !== 'cop' && <section className="forecast-summary" aria-label="Propagación"><FireSimBar settings={fireSettings} horizon={horizon} playing={firePlaying} windShifted={windShifted} showWind={showWind} onPlay={playFire} onShiftWind={shiftWind} onReset={resetFire} onWind={toggleWind} /></section>}
      {toasts.length > 0 && panel !== 'alerts' && <ol className="alert-toasts" aria-live="polite">{toasts.map(alert => <li key={alert.id}><button type="button" className={`alert-toast ${alert.severity}`} onClick={() => { setFocusTarget(alert.focus ?? null); setPanel('alerts'); setReadAlertIds(new Set(alerts.map(item => item.id))) }}>{alert.title}</button></li>)}</ol>}
      {(panel || selected) && <aside id="map-panel" className="floating-panel" aria-label={panelTitle}>
        <div className="floating-panel-heading"><h2>{panelTitle}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body" key={selected?.id ?? panel}>
          {selected ? <><PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }} onDispatch={kind => dispatchUnit(kind, { lng: selected.lng, lat: selected.lat, label: selected.name, citizenId: selected.id })} unitLimit={units.length >= MAX_UNITS} zones={scenario.safeZones} /><RefugeRoutesPanel key={selected.id} citizen={selected} token={token} forecast={forecast} horizon={horizon} marginM={marginM} onRoute={setMapRoute} zones={scenario.safeZones} /></> : panel === 'cop' ? <FireControls settings={fireSettings} horizon={horizon} playing={firePlaying} onPlay={playFire} onReset={resetFire} showWind={showWind} onWind={toggleWind} onShiftWind={shiftWind} windShifted={windShifted} marginM={marginM} forecast={forecast} onFocus={point => { setFocusTarget({ lng: point.lng, lat: point.lat }); setLayers(previous => ({ ...previous, zones: true })) }} zones={scenario.safeZones} /> : panel === 'centers' ? <ResponsePanel key={scenario.id} selectedId={selectedCenterId} onSelect={selectCenter} scenario={scenarioLabel} notices={notices} onNotices={setNotices} centers={scenario.centers} settlements={scenario.settlements} /> : panel === 'alerts' ? <AlertsPanel alerts={alerts} units={units} onAction={handleAlertAction} onDispatch={(alert, kind) => handleAlertAction(alert, kind === 'police' ? 'dispatch-police' : kind === 'ambulance' ? 'dispatch-ambulance' : 'dispatch-fire')} onFocus={alert => { if (alert.focus) setFocusTarget(alert.focus) }} onFocusUnit={selectUnit} /> : panel === 'layers' ? (
            <div className="layer-content">
              {layerOptions(scenario).map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><LayerMark layer={layer.key} symbol={layer.symbol} /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">La huella y la proyección son del escenario. No delimitan un perímetro confirmado.</p>
            </div>
          ) : (
            <>
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input autoFocus className="search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{[['all', 'Todas'], ['outside', 'Fuera del núcleo'], ['no_answer', 'Sin respuesta'], ['assistance', 'Revisión de ruta']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              <div className="list-summary"><span>{filtered.length} personas</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span className={`dot ${citizen.call ? 'answered' : citizen.status}`} /><span className="person-row-copy"><strong>{citizen.name}</strong><em>{citizen.locality}</em></span><span className="person-row-meta"><small>{citizen.locationSource === 'gps' ? 'GPS' : citizen.locationSource === 'simulation' ? 'SIM' : 'REF'}</small><span>{citizen.status === 'pending' ? '' : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>No hay coincidencias</strong><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button></div>}
            </>
          )}
        </div>
      </aside>}
      <section className="simulation-dock campaign-dock" aria-label="Campaña de llamadas por zona">
        <div className="campaign-heading"><strong>{drawingArea ? 'Arrastra para dibujar un círculo' : callArea ? `${areaIds.length} personas seleccionadas · radio ${Math.round(callArea.radiusM)} m` : 'Selecciona a quién llamar'}</strong><small>{liveMode ? `HappyRobot · llamadas reales${apiRoster ? '' : ' · SIN censo de la API'}` : 'HappyRobot · simulación local'}</small></div>
        <label className="row live-toggle"><input type="checkbox" checked={liveMode} onChange={(event) => { setLiveMode(event.target.checked); setDispatchError('') }} />Llamar de verdad por HappyRobot</label>
        {liveMode && <label className="search-label"><span className="sr-only">Clave de operador</span><input className="search" type="password" autoComplete="off" placeholder="Clave de operador (HR_SHARED_SECRET)" value={operatorKey} onChange={(event) => { setOperatorKey(event.target.value); saveOperatorKey(event.target.value) }} /></label>}
        {liveMode && <p className="fine">Se manda el círculo a la API de crisis y es ella quien dispara HappyRobot. Los cerrojos <code>ALLOW_REAL_CALLS</code> y <code>CALL_ALLOWLIST</code> siguen mandando: un punto que no esté en la lista aparecerá como bloqueado.</p>}
        {drawingArea && <p className="fine">Pulsa en el centro y arrastra hasta el borde. Mínimo 50 m. Escape cancela.</p>}
        <div className="campaign-actions">
          <button type="button" className="cop-primary" onClick={callArea && !drawingArea ? launchAreaCampaign : beginArea} disabled={dispatching || Boolean(callArea && !drawingArea && (liveMode ? !areaIds.length : !callableCount))}>{!callArea || drawingArea ? 'Dibujar zona' : dispatching ? 'Lanzando llamadas…' : liveMode ? areaIds.length ? `Llamar a ${areaIds.length} seleccionados · REAL` : 'Nadie dentro del círculo' : callableCount ? `Llamar a ${callableCount} seleccionados · demo` : 'Sin contactos nuevos'}</button>
          {(callArea || drawingArea) && <button type="button" className="cop-secondary" onClick={() => { setDrawingArea(false); updateArea(null) }}>Borrar selección</button>}
          {!liveMode && campaignRunning && <button type="button" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} />{protocolOn ? 'Pausar' : 'Reanudar'}</button>}
        </div>
        {!callArea && <button type="button" className="cop-secondary" onClick={() => finishArea({ ...(rosterCenter ?? { lng: scenario.incident.center[0], lat: scenario.incident.center[1] }), radiusM: rosterCenter ? 1000 : 3000 })}>{rosterCenter ? 'Usar todo el censo · 1 km' : 'Usar entorno del incendio · 3 km'}</button>}
        {!liveMode && callArea && !callableCount && !drawingArea && <p className="fine" role="status">No hay nuevos contactos pendientes en esta selección. Puedes dibujar otra zona; las sesiones GPS quedan excluidas.</p>}
        {dispatchError && <p className="fine" role="alert">{dispatchError}</p>}
        {liveBatch && <CallBoard calls={liveCalls} skipped={liveBatch.skipped} onSelect={selectCitizen} />}
        {!liveMode && campaignIds.length > 0 && <div className="campaign-stats" role="status"><span><strong>{counts.answered}</strong>/{campaignIds.length} respondidas</span><span>{counts.moving} en movimiento</span><span>{counts.silent} sin respuesta</span>{counts.waiting > 0 && <span>{counts.waiting} sin ruta</span>}</div>}
        {!liveMode && planningCount > 0 && <p className="fine" role="status">Calculando {planningCount} rutas individuales desde la posición de los contactos…</p>}
        {!liveMode && counts.waiting > 0 && <><p className="fine" role="status">{citizens.find(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance')?.routeHoldReason}</p><button type="button" className="cop-secondary" onClick={retryRoutes}>Reintentar rutas pendientes</button></>}
        {areaIds.length > 0 && !drawingArea && <DispatchActions kinds={['ambulance', 'police', 'fire']} disabled={units.length >= MAX_UNITS} onDispatch={kind => {
          const target = targetFromCitizens(areaIds, callArea ?? undefined, `${areaIds.length} en zona`)
          if (target) dispatchUnit(kind, target)
        }} />}
      </section>
    </div>
  )
}

function CallBoard({ calls, skipped, onSelect }: { calls: CallRun[]; skipped: DispatchResultSkip[]; onSelect: (id: string) => void }) {
  const porEstado = calls.reduce<Record<string, number>>((acc, call) => ({ ...acc, [call.state]: (acc[call.state] ?? 0) + 1 }), {})
  const abiertas = calls.filter((call) => CALL_STATE_OPEN.includes(call.state)).length
  return (
    <div className="call-board">
      <div className="campaign-stats" role="status">
        <span><strong>{calls.length}</strong> llamadas lanzadas</span>
        {abiertas > 0 && <span>{abiertas} en curso</span>}
        {Object.entries(porEstado).filter(([estado]) => !CALL_STATE_OPEN.includes(estado as CallStateName)).map(([estado, total]) => (
          <span key={estado}>{total} × {CALL_STATE_LABEL[estado as CallStateName]}</span>
        ))}
      </div>
      <ul className="people">
        {calls.map((call) => (
          <li key={call.id}>
            <button type="button" onClick={() => onSelect(call.person_id)}>
              <span className={`dot ${call.state === 'answered' ? 'answered' : call.state === 'no_answer' ? 'no_answer' : 'pending'}`} />
              <span className="person-row-copy"><strong>{call.name || call.person_id}</strong><em>{call.detail || CALL_STATE_LABEL[call.state]}</em></span>
              <span className="person-row-meta"><span>{CALL_STATE_LABEL[call.state]}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <details className="source-details">
          <summary>{skipped.length} dentro del círculo sin llamar</summary>
          <ul className="people">{skipped.map((item) => <li key={item.person_id}><button type="button" onClick={() => onSelect(item.person_id)}><span className="person-row-copy"><strong>{item.name || item.person_id}</strong><em>{item.reason}</em></span></button></li>)}</ul>
        </details>
      )}
    </div>
  )
}

const ICONS = { zone: '🎯', fire: '🔥', centers: '', people: '👥', layers: '🗺️', alerts: '🚨', close: '✕', play: '▶️', pause: '⏸️' }
const LAYER_MARK: Partial<Record<keyof MapLayers, string>> = {
  hospitals: 'hospital',
  healthCenters: 'health',
  fireStations: 'fire',
  zones: 'meeting',
}

function LayerMark({ layer, symbol }: { layer: keyof MapLayers; symbol: string }) {
  if (layer === 'units') return <span className="legend-units" aria-hidden="true"><span className="unit-emoji">{UNIT_EMOJI.ambulance}</span><span className="unit-emoji">{UNIT_EMOJI.police}</span><span className="unit-emoji">{UNIT_EMOJI.fire}</span></span>
  const mark = LAYER_MARK[layer]
  if (mark) return <span className={`center-mark ${mark}`} aria-hidden="true" />
  return <span className="layer-symbol app-icon" aria-hidden="true">{symbol}</span>
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  if (name === 'centers') return <span className="center-mark hospital app-icon" aria-hidden="true" />
  return <span className="app-icon" aria-hidden="true">{ICONS[name]}</span>
}

function PersonDetail({ citizen, events, now, onClose, onDispatch, unitLimit, zones }: { citizen: Citizen; events: CallEvent[]; now: number; onClose: () => void; onDispatch: (kind: UnitKind) => void; unitLimit: boolean; zones: SafeZone[] }) {
  const locationSource = citizen.locationSource ?? 'reference'
  const reference = locationSource === 'reference' || locationSource === 'unknown'
  const stale = citizen.locationUpdatedAt !== undefined && now - citizen.locationUpdatedAt > 120_000
  return (
    <article className="person-detail">
      <button type="button" className="back-button" onClick={onClose}>‹ Todas las personas</button>
      <div className="person-title"><span className="person-avatar">{citizen.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><div><span className="eyebrow">{citizen.locality ?? citizen.id}</span><h2>{citizen.name}</h2></div></div>
      <div className="person-badges"><span className={`status-badge ${citizen.status}`}>{STATUS_LABEL[citizen.status]}</span>{citizen.resident === false && <span className="status-badge">Fuera del núcleo</span>}</div>
      {citizen.status === 'assistance' && <p className="need-note">{citizen.routeHoldReason}</p>}
      <section className="detail-section"><h3>Enviar medio</h3>
        <DispatchActions kinds={['ambulance', 'police', 'fire']} disabled={unitLimit} onDispatch={onDispatch} />
        {unitLimit && <p className="fine">Límite de {MAX_UNITS} envíos.</p>}
      </section>
      {!citizen.live && citizen.routeId && <p className="fine">Destino: {zones.find(zone => zone.id === citizen.safeZoneId)?.name}</p>}
      <section className="detail-section"><h3>Localización</h3>
        <div className={`location-card ${reference || stale ? 'uncertain' : ''}`}><strong>{LOCATION_LABEL[locationSource]}</strong><span className="coordinates">{Math.abs(citizen.lat).toFixed(5)}° {citizen.lat >= 0 ? 'N' : 'S'} / {Math.abs(citizen.lng).toFixed(5)}° {citizen.lng < 0 ? 'O' : 'E'}</span><span>{locationAge(citizen.locationUpdatedAt, now)}{stale ? ' · desactualizada' : ''}</span></div>
        <dl className="detail-fields"><div><dt>Precisión</dt><dd>{citizen.accuracyM !== undefined ? `${Math.round(citizen.accuracyM)} m` : 'No disponible'}</dd></div><div><dt>Origen</dt><dd>{citizen.live ? locationSource === 'gps' ? 'Dispositivo' : 'Sesión compartida' : 'Registro'}</dd></div></dl>
      </section>
      <section className="detail-section"><h3>Última llamada</h3>
        <div className="call-summary"><p>{citizen.call?.summary ?? 'Sin respuesta'}</p></div>
        {citizen.call?.needs.map((need) => <p className="need-note" key={need}>{need}</p>)}
        <dl className="detail-fields"><div><dt>Agente</dt><dd>{citizen.call?.agent ?? 'No asignado'}</dd></div><div><dt>Respuesta</dt><dd>{citizen.call ? formatClock(new Date(citizen.call.answeredAt)) : '—'}</dd></div><div><dt>Comparte ubicación</dt><dd>{citizen.call ? citizen.call.consent === 'granted' ? 'Sí' : 'No' : '—'}</dd></div></dl>
      </section>
      {citizen.household?.length ? <section className="detail-section"><h3>Acompañantes</h3>{citizen.household.map((member) => <div className="family-member" key={member.name}><strong>{member.name}</strong><p>{member.situation}</p></div>)}</section> : null}
      {events.length > 0 && <details className="detail-section"><summary>Registro</summary><ol className="feed">{events.map((event) => <li key={event.id}><time>{formatClock(new Date(event.ts))}</time><div><p>{event.detail}</p><small>{event.agent}</small></div></li>)}</ol></details>}
    </article>
  )
}

function mergePings(current: Citizen[], pings: LocationPing[]): Citizen[] {
  const next = [...current]
  for (const ping of pings) {
    if (!Number.isFinite(ping.lng) || !Number.isFinite(ping.lat) || Math.abs(ping.lng) > 180 || Math.abs(ping.lat) > 90 || !Number.isFinite(ping.ts)) continue
    const index = next.findIndex((citizen) => citizen.id === ping.id)
    if (index >= 0 && next[index].live && (next[index].locationUpdatedAt ?? 0) >= ping.ts) continue
    const shared = {
      lng: ping.lng, lat: ping.lat, status: 'tracking' as const, live: true,
      locationSource: ping.source === 'gps' ? 'gps' as const : ping.source === 'simulation' ? 'simulation' as const : 'unknown' as const,
      locationUpdatedAt: ping.ts, accuracyM: ping.accuracyM,
      safeZoneId: '', routeId: undefined, routeProgressM: undefined, routePhase: undefined, routeHoldReason: undefined,
    }
    if (index >= 0) {
      const previous = next[index]
      next[index] = { ...previous, ...shared, name: ping.name || previous.name, call: previous.live ? previous.call : undefined, household: previous.live ? previous.household : undefined }
    } else {
      next.unshift({ ...shared, id: ping.id, name: ping.name || 'Ciudadano', phone: '', vulnerable: false, safeZoneId: '', speedKmh: 0, callDelaySec: 0, outcome: 'tracking' })
    }
  }
  return next
}
