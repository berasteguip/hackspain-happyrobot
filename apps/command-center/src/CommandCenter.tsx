import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { DEFAULT_SCENARIO_ID, SCENARIOS, scenarioById } from './scenarios'
import type { FireScenario } from './scenario'
import { MAX_FORECAST_MIN, buildFireForecast, exposureAt, forecastGeo, routeBlocked } from './fire-model'
import type { FireSettings } from './fire-model'
import { FireControls, RefugeRoutesPanel, ResponsePanel, AlertsPanel, DispatchActions, CopStrip, PlanDiffBanner, SilentHouses } from './CopPanels'
import type { DemoNotice } from './response'
import { SITE_EMOJI } from './response'
import type { RefugeRoute } from './routing'
import { planCitizenRoute } from './routing'
import type { RouteIndex } from './routing'
import { detectAlerts, initialWatch, mergeAlerts } from './alerts'
import type { AlertAction, AlertWatch, CommandAlert } from './alerts'
import { createDispatch, moveUnits, originsFrom, planUnitRoute } from './units'
import type { DispatchTarget, DispatchUnit, UnitKind } from './units'
import { advanceProtocol, moveEvacuees, prepareAreaCampaign, selectAreaIds } from './simulation'
import {
  CALL_STATE_LABEL, CALL_STATE_OPEN, DispatchFailed, dispatchCircle, fetchCalls, fetchRoster,
  readOperatorKey, saveOperatorKey,
} from './crisisApi'
import type { CallRun, CallStateName, DispatchResultSkip, RosterEntry } from './crisisApi'
import type { CallArea, CallEvent, Citizen, FireSpot, LocationPing, MapLayers, SafeZone } from './types'
import { aerialSectors, formConvoys, formatFrontEta, imminentCount, planDiff, rankCitizens, silentHouses } from './priority'
import type { PlanDiff } from './priority'
import { markTourSeen, startDemoTour, stopDemoTour, TOUR_INTRO } from './demoTour'
import { TourIntro } from './TourIntro'
import { liveExerciseScenario, exerciseFireEvent, publishExerciseFire } from './liveExercise'

/** Convierte el censo de la API exclusivamente para la pestaña Operación real. */
function citizenFromRoster(row: RosterEntry, index: number): Citizen {
  return {
    id: row.id,
    name: row.name || row.id,
    phone: row.phone || '',
    lng: row.lng as number,
    lat: row.lat as number,
    locality: row.locality || row.address || 'Escenario de la API',
    resident: true,
    live: true,
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
function layerOptions(scenario: FireScenario): { key: keyof MapLayers; name: string; detail: string; symbol: keyof typeof ICONS }[] {
  const hospital = scenario.centers.find(center => center.kind === 'hospital')
  const health = scenario.centers.find(center => center.kind === 'health')
  const park = scenario.centers.find(center => center.kind === 'fire')
  return [
    { key: 'perimeter', name: 'Huella térmica', detail: 'Celdas del incendio', symbol: 'fire' },
    { key: 'spread', name: 'Propagación', detail: 'Avance desde el foco', symbol: 'wind' },
    { key: 'routes', name: 'Ruta seleccionada', detail: 'Recorrido comparado', symbol: 'routes' },
    { key: 'hospitals', name: 'Hospitales', detail: hospital?.name ?? 'Hospital', symbol: 'centers' },
    { key: 'healthCenters', name: 'Centros de salud', detail: health?.name ?? 'Centro de salud', symbol: 'centers' },
    { key: 'fireStations', name: 'Bomberos', detail: park?.name ?? 'Bomberos', symbol: 'fire' },
    { key: 'thermal', name: 'Detecciones térmicas', detail: 'Focos puntuales', symbol: 'thermal' },
    { key: 'citizens', name: 'Personas', detail: 'Contacto y ubicación', symbol: 'people' },
    { key: 'references', name: 'Referencias residenciales', detail: 'Punto de partida', symbol: 'pin' },
    { key: 'zones', name: 'Puntos de encuentro', detail: 'Destinos de evacuación', symbol: 'pin' },
    { key: 'callArea', name: 'Zona de llamadas', detail: 'Círculo de la selección', symbol: 'zone' },
    { key: 'units', name: 'Medios', detail: 'Ambulancia, patrulla, bomberos', symbol: 'units' },
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
  const [mode, setMode] = useState<'simulation' | 'live'>('simulation')
  const [liveVisited, setLiveVisited] = useState(false)
  const switchMode = (next: 'simulation' | 'live') => {
    stopDemoTour()
    if (next === 'live') setLiveVisited(true)
    setMode(next)
  }
  return <div className="mode-shell">
    <div className="mode-tabs" role="tablist" aria-label="Modo de trabajo" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 'simulation' : event.key === 'End' ? 'live' : mode === 'live' ? 'simulation' : 'live'
      switchMode(next)
      document.getElementById(`tab-${next}`)?.focus()
    }}>
      <button type="button" role="tab" id="tab-simulation" aria-selected={mode === 'simulation'} aria-controls="mode-simulation" tabIndex={mode === 'simulation' ? 0 : -1} onClick={() => switchMode('simulation')}>Simulación</button>
      <button type="button" role="tab" id="tab-live" aria-selected={mode === 'live'} aria-controls="mode-live" tabIndex={mode === 'live' ? 0 : -1} onClick={() => switchMode('live')}>Operación real</button>
    </div>
    <section id="mode-simulation" className="mode-pane" role="tabpanel" aria-labelledby="tab-simulation" hidden={mode !== 'simulation'}><CommandWorkspace token={token} liveMode={false} active={mode === 'simulation'} /></section>
    <section id="mode-live" className="mode-pane" role="tabpanel" aria-labelledby="tab-live" hidden={mode !== 'live'}>{liveVisited && <CommandWorkspace token={token} liveMode active={mode === 'live'} />}</section>
  </div>
}

export function CommandWorkspace({ token, liveMode, active }: { token: string; liveMode: boolean; active: boolean }) {
  const panelId = liveMode ? 'live-map-panel' : 'map-panel'
  const sidebarId = liveMode ? 'live-workspace-sidebar' : 'workspace-sidebar'
  const [now, setNow] = useState(() => new Date())
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID)
  const [exerciseAnchor, setExerciseAnchor] = useState<{ lng: number; lat: number } | null>(null)
  const [publishedExercise, setPublishedExercise] = useState('')
  const [publishingExercise, setPublishingExercise] = useState(false)
  const [exerciseError, setExerciseError] = useState('')
  const scenario = useMemo(() => liveMode ? liveExerciseScenario(scenarioById(scenarioId), exerciseAnchor) : scenarioById(scenarioId), [scenarioId, liveMode, exerciseAnchor])
  const mapScenario = scenario
  const origins = useMemo(() => { const base = scenarioById(scenarioId); return originsFrom(base.centers, base.police) }, [scenarioId])
  const [citizens, setCitizens] = useState<Citizen[]>(() => liveMode ? [] : scenarioById(DEFAULT_SCENARIO_ID).citizens)
  const [events, setEvents] = useState<CallEvent[]>([])
  const [protocolOn, setProtocolOn] = useState(false)
  const [callArea, setCallArea] = useState<CallArea | null>(null)
  const [areaIds, setAreaIds] = useState<string[]>([])
  const [drawingArea, setDrawingArea] = useState(false)
  const [campaignIds, setCampaignIds] = useState<string[]>([])
  // --- modo "llamadas reales": el círculo se manda a la API y ella dispara HappyRobot ---
  const [operatorKey, setOperatorKey] = useState(() => readOperatorKey())
  const [liveBatch, setLiveBatch] = useState<{ id: string; skipped: DispatchResultSkip[] } | null>(null)
  const [liveCalls, setLiveCalls] = useState<CallRun[]>([])
  const [dispatchError, setDispatchError] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [forceRecall, setForceRecall] = useState(false)
  const [apiRoster, setApiRoster] = useState(false)
  const [rosterStatus, setRosterStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rosterAttempt, setRosterAttempt] = useState(0)
  const [tourIntroOpen, setTourIntroOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const campaignRef = useRef<ReadonlySet<string>>(new Set())
  const campaignSet = useMemo(() => new Set(campaignIds), [campaignIds])
  const [planningCount, setPlanningCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | 'cop' | 'centers' | 'alerts' | 'campaign' | 'incidents' | null>(null)
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
  const forecast = useMemo(() => buildFireForecast(mapScenario.fireCells, fireSettings), [mapScenario.fireCells, fireSettings])
  const projection = useMemo(() => forecastGeo(forecast, horizon), [forecast, horizon])
  const zoneExposure = useMemo(() => Object.fromEntries(scenario.safeZones.map(zone => [zone.id, exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)])), [forecast, horizon, marginM, scenario.safeZones])
  const forecastRef = useRef({ forecast, horizon, marginM })
  useEffect(() => { forecastRef.current = { forecast, horizon, marginM } }, [forecast, horizon, marginM])
  useEffect(() => { horizonRef.current = horizon }, [horizon])
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: true, thermal: false, citizens: true, references: true, zones: !liveMode, hospitals: !liveMode, healthCenters: !liveMode, fireStations: !liveMode, routes: !liveMode, callArea: true, units: !liveMode })
  useEffect(() => {
    if (!active || !firePlaying) return
    const origin = horizonRef.current
    const started = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.min(MAX_FORECAST_MIN, origin + (performance.now() - started) / 1000 * 8)
      horizonRef.current = next
      setHorizon(next)
      if (next >= MAX_FORECAST_MIN) setFirePlaying(false)
    }, 80)
    return () => window.clearInterval(timer)
  }, [firePlaying, active, liveMode])
  const [planChange, setPlanChange] = useState<PlanDiff | null>(null)
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
  const campaignButtonRef = useRef<HTMLButtonElement>(null)
  const incidentButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { citizensRef.current = citizens }, [citizens])
  useEffect(() => { unitsRef.current = units }, [units])

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  useEffect(() => {
    if (!active) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.body.classList.contains('driver-active')) return
      if (workspaceOpen && window.matchMedia('(max-width: 900px)').matches) { setWorkspaceOpen(false); return }
      if (drawingArea) { setDrawingArea(false); setCallArea(null); setAreaIds([]); return }
      setSelectedId(null)
      setPanel(null)
      if (panel === 'campaign') campaignButtonRef.current?.focus()
      else if (panel === 'incidents') incidentButtonRef.current?.focus()
      else if (panel === 'cop') copButtonRef.current?.focus()
      else if (panel === 'centers') centersButtonRef.current?.focus()
      else if (panel === 'alerts') alertsButtonRef.current?.focus()
      else if (panel === 'layers') layersButtonRef.current?.focus()
      else peopleButtonRef.current?.focus()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [panel, drawingArea, workspaceOpen, active])
  useEffect(() => {
    if (!active || !showFirms) return
    let cancelled = false
    fetchFirmsSpain().then((spots) => {
      if (cancelled) return
      setFirms(spots)
      setFirmsState(`${spots.length} detecciones en España · últimas 24 h`)
    }).catch(() => {
      if (!cancelled) setFirmsState('Fuente no disponible. No se han añadido detecciones externas.')
    })
    return () => { cancelled = true }
  }, [showFirms, active])
  useEffect(() => {
    if (!active || liveMode || !protocolOn) return
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
  }, [protocolOn, token, forecast, marginM, updatePopulation, scenario.safeZones, active, liveMode])
  useEffect(() => {
    if (!active || liveMode || !protocolOn) return
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
  }, [protocolOn, scenario.safeZones, active, liveMode])
  // Solo Operación real consume el censo; nunca sustituye los datos de simulación.
  useEffect(() => {
    if (!liveMode || !active) return
    let cancelled = false
    void fetchRoster().then(rows => {
      if (cancelled) return
      if (!rows) { setRosterStatus('error'); setApiRoster(false); return }
      setRosterStatus('ready')
      setApiRoster(true)
      const roster = rows.map(citizenFromRoster)
      // Conserva posiciones y estados recibidos durante la sesión.
      updatePopulation(current => {
        const previous = new Map(current.map(person => [person.id, person]))
        return roster.map(person => previous.get(person.id) ?? person)
      })
      if (rows.length) {
        const centro = roster.reduce((acc, row) => ({ lng: acc.lng + row.lng / roster.length, lat: acc.lat + row.lat / roster.length }), { lng: 0, lat: 0 })
        setExerciseAnchor(previous => previous ?? centro)
        setFocusTarget({ ...centro, zoom: 14 })
      }
    })
    return () => { cancelled = true }
  }, [liveMode, active, rosterAttempt, updatePopulation])

  // El tablero de la ráfaga viva: se refresca hasta que no quede ninguna llamada abierta.
  useEffect(() => {
    if (!active || !liveMode || !liveBatch) return
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
  }, [liveBatch, operatorKey, updatePopulation, active, liveMode])

  useEffect(() => {
    if (!active || !liveMode) return
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
  }, [active, liveMode])
  useEffect(() => {
    if (!active || liveMode) return
    const input = { citizens, forecast, marginM, horizon, windTowardDeg: fireSettings.windTowardDeg, campaignIds: campaignRef.current, now: Date.now(), settlements: scenario.settlements, safeZones: scenario.safeZones }
    if (!watchRef.current) watchRef.current = initialWatch(input)
    const detected = detectAlerts(input, watchRef.current)
    watchRef.current = detected.watch
    if (detected.alerts.length) setAlerts(previous => mergeAlerts(previous, detected.alerts))
  }, [citizens, forecast, horizon, marginM, fireSettings.windTowardDeg, scenario.settlements, scenario.safeZones, active, liveMode])
  useEffect(() => {
    if (!active || liveMode) return
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
  }, [token, active, liveMode])
  useEffect(() => {
    if (!active || liveMode) return
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
  }, [active, liveMode])

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
  const ranked = useMemo(() => rankCitizens(citizens, forecast, marginM), [citizens, forecast, marginM])
  const silent = useMemo(() => silentHouses(ranked), [ranked])
  const convoys = useMemo(() => formConvoys(ranked), [ranked])
  const sectors = useMemo(() => aerialSectors(ranked, scenario.settlements), [ranked, scenario.settlements])
  const counts = useMemo(() => ({
    total: citizens.length,
    answered: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.call).length,
    located: citizens.filter((citizen) => citizen.locationSource === 'gps' || citizen.locationSource === 'simulation').length,
    silent: silent.length,
    safe: citizens.filter(citizen => citizen.status === 'safe').length,
    moving: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'evacuating').length,
    waiting: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance').length,
    imminent: imminentCount(ranked),
  }), [citizens, campaignSet, silent, ranked])
  const callableCount = citizens.filter(citizen => areaIds.includes(citizen.id) && !citizen.live && citizen.status === 'pending' && !campaignSet.has(citizen.id)).length
  const campaignRunning = citizens.some(citizen => campaignSet.has(citizen.id) && !citizen.live && ['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))
  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const filtered = ranked.filter((citizen) => {
    const text = `${citizen.name} ${citizen.phone} ${citizen.id} ${citizen.locality} ${STATUS_LABEL[citizen.status]}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'imminent' ? citizen.minute < 20 : filter === 'outside' ? citizen.resident === false : filter === 'no_answer' ? citizen.status === 'no_answer' || citizen.callState === 'no_answer' : citizen.status === filter))
  })
  const exerciseSignature = JSON.stringify({ scenario: scenario.id, center: scenario.incident.center, horizon, fireSettings })
  const exerciseReady = Boolean(publishedExercise && publishedExercise === exerciseSignature)
  const updateArea = (area: CallArea | null) => {
    setCallArea(area)
    setAreaIds(selectAreaIds(citizensRef.current, area))
  }
  const finishArea = (area: CallArea) => { updateArea(area); setDrawingArea(false) }
  const beginArea = () => {
    setWorkspaceOpen(false)
    setSelectedId(null)
    setPanel(null)
    updateArea(null)
    setDrawingArea(true)
    setLayers(previous => ({ ...previous, citizens: true, references: true }))
  }
  const prepareLiveExercise = () => {
    setPanel('cop')
    setSelectedId(null)
    setWorkspaceOpen(false)
    setFocusTarget({ lng: scenario.incident.center[0], lat: scenario.incident.center[1], zoom: 14 })
    setLayers(previous => ({ ...previous, perimeter: true, spread: true, citizens: true }))
  }
  const activateLiveExercise = async () => {
    if (!liveMode || !apiRoster || !exerciseAnchor || publishingExercise || !operatorKey.trim()) return
    setPublishingExercise(true)
    setExerciseError('')
    setFirePlaying(false)
    try {
      await publishExerciseFire(operatorKey, exerciseFireEvent(scenario.fireCells, projection, fireSettings), AbortSignal.timeout(20000))
      setPublishedExercise(exerciseSignature)
      finishArea({ ...exerciseAnchor, radiusM: 1000 })
      setPanel('campaign')
    } catch (error) {
      setExerciseError(error instanceof Error ? error.message : 'No se pudo publicar el incendio. Reintenta la activación.')
    } finally { setPublishingExercise(false) }
  }
  /** Modo real: el círculo va a la API y vuelve un tablero de llamadas de verdad. */
  const launchLiveCampaign = async () => {
    if (!active || !liveMode || !apiRoster || !exerciseReady || drawingArea || !callArea || dispatching) return
    setDispatching(true)
    setDispatchError('')
    setSelectedId(null)
    setPanel('campaign')
    try {
      const resultado = await dispatchCircle(operatorKey, callArea, { operator: 'puesto de mando', force: forceRecall, reason: `Ejercicio de incendio simulado junto al censo. Llamada real de demostración con HappyRobot. Viento hacia ${fireSettings.windTowardDeg} grados, ${fireSettings.windKmh} km/h. Situación publicada a +${Math.round(horizon)} min.` })
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

  const launchLocalCampaign = (ids: string[]) => {
    if (liveMode || !active) return
    const campaign = prepareAreaCampaign(citizensRef.current, ids, elapsedRef.current, campaignRef.current)
    if (!campaign.addedIds.length) return
    campaignRef.current = new Set(campaign.ids)
    citizensRef.current = campaign.citizens
    setCitizens(campaign.citizens)
    setCampaignIds(campaign.ids)
    setProtocolOn(true)
  }
  const launchAreaCampaign = () => {
    if (liveMode) { void launchLiveCampaign(); return }
    if (drawingArea || !callArea) return
    launchLocalCampaign(areaIds)
  }
  const startScenarioDemo = () => {
    // Esta entrada solo inicia la simulación local, nunca dispatch ni el censo de la API.
    if (liveMode || apiRoster || dispatching) return
    const area = { lng: scenario.incident.center[0], lat: scenario.incident.center[1], radiusM: 3000 }
    finishArea(area)
    launchLocalCampaign(selectAreaIds(citizensRef.current, area))
    setSelectedId(null)
    setPanel('campaign')
    setWorkspaceOpen(false)
    setLayers(previous => ({ ...previous, citizens: true, references: true, callArea: true }))
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
    if (liveMode || unitsRef.current.length >= MAX_UNITS) return
    try {
      const unit = createDispatch(kind, target, Date.now(), unitSeqRef.current, origins)
      unitSeqRef.current += 1
      unitsRef.current = [unit, ...unitsRef.current]
      setUnits(unitsRef.current)
      setLayers(previous => ({ ...previous, units: true }))
      setFocusTarget({ lng: unit.origin.lng, lat: unit.origin.lat, bounds: [[unit.origin.lng, unit.origin.lat], [target.lng, target.lat]] })
      setSelectedId(null)
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
    setWorkspaceOpen(false)
    setSelectedId(id)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const togglePanel = (next: 'people' | 'layers' | 'cop' | 'centers' | 'alerts' | 'campaign' | 'incidents') => {
    setSelectedId(null)
    setWorkspaceOpen(false)
    if (next === 'people') { setQuery(''); setFilter('all') }
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
    setPlanChange(null)
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
  const panelTitle = selected ? 'Ficha de persona' : panel === 'incidents' ? 'Escenarios' : panel === 'layers' ? 'Capas y leyenda' : panel === 'cop' ? 'Propagación y viento' : panel === 'centers' ? 'Centros y coordinación' : panel === 'alerts' ? 'Avisos y medios' : 'Personas'
  const scenarioLabel = `Escenario +${Math.round(horizon)} min · viento hacia ${fireSettings.windTowardDeg}° a ${fireSettings.windKmh} km/h · avance base ${fireSettings.spreadMPerMin} m/min · margen ${marginM} m`
  const playFire = () => {
    setLayers(previous => ({ ...previous, spread: true, perimeter: true }))
    setFirePlaying(active => !active)
  }
  const shiftWind = () => {
    const nextSettings = { ...fireSettings, windTowardDeg: SHIFTED_WIND }
    const nextForecast = buildFireForecast(scenario.fireCells, nextSettings)
    setPlanChange(planDiff({
      previous: forecast, next: nextForecast, fromDeg: fireSettings.windTowardDeg, toDeg: SHIFTED_WIND,
      citizens: citizensRef.current, zones: scenario.safeZones, routes: routesRef.current, horizon, marginM,
    }))
    setFireSettings(nextSettings)
    setShowWind(true)
    setLayers(previous => ({ ...previous, spread: true }))
  }
  const resetFire = () => {
    setFirePlaying(false)
    setHorizon(0)
    setPlanChange(null)
    setFireSettings(previous => ({ ...previous, windTowardDeg: INITIAL_WIND }))
  }
  const openQueue = (nextFilter = 'all') => {
    setWorkspaceOpen(false)
    setQuery('')
    setFilter(nextFilter)
    setSelectedId(null)
    setPanel('people')
  }
  const toggleWind = () => setShowWind(value => !value)
  const closePanel = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setSelectedId(null)
      setPanel(null)
      document.querySelector<HTMLButtonElement>(`#${liveMode ? 'mode-live' : 'mode-simulation'} .workspace-mobile-toggle`)?.focus()
      return
    }
    if (panel === 'campaign') campaignButtonRef.current?.focus()
    else if (panel === 'incidents') incidentButtonRef.current?.focus()
    else if (panel === 'cop') copButtonRef.current?.focus()
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
  const runTour = useCallback(() => {
    const previous = { panel, selectedId, filter, query, workspaceOpen }
    const personId = selectedId ?? ranked[0]?.id ?? null
    void startDemoTour({
      open: next => flushSync(() => {
        setWorkspaceOpen(false)
        setSelectedId(next === 'person' ? personId : null)
        setQuery('')
        setFilter('all')
        setPanel(next === 'person' ? 'people' : next)
      }),
      close: () => {
        setWorkspaceOpen(previous.workspaceOpen)
        setPanel(previous.panel)
        setSelectedId(previous.selectedId)
        setFilter(previous.filter)
        setQuery(previous.query)
      },
    })
  }, [panel, selectedId, filter, query, ranked, workspaceOpen])
  const beginTour = useCallback(() => {
    setTourIntroOpen(false)
    runTour()
  }, [runTour])
  const dismissTourIntro = useCallback(() => {
    setTourIntroOpen(false)
    markTourSeen()
  }, [])
  useEffect(() => {
    if (liveMode || new URLSearchParams(window.location.search).get('guia') !== '1') return
    const timer = window.setTimeout(() => setTourIntroOpen(true), 500)
    return () => window.clearTimeout(timer)
  }, [liveMode])

  return (
    <div className={`map-app workspace-app compact-workspace ${liveMode ? 'live-workspace' : ''} ${workspaceOpen ? 'workspace-open' : ''}`}>
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap key={scenario.id} token={token} liveMode={liveMode} citizens={citizens} fires={liveMode ? mapScenario.fires : fires} zones={mapScenario.safeZones} selectedId={selectedId} layers={layers} onSelect={selectCitizen} projection={projection} forecast={forecast} zoneExposure={zoneExposure} horizon={horizon} marginM={marginM} route={mapRoute} focusTarget={focusTarget} onCenterSelect={selectCenter} showWind={active && showWind} windDirection={fireSettings.windTowardDeg} windKmh={fireSettings.windKmh} callArea={callArea} areaIds={areaIds} drawingArea={drawingArea} onAreaChange={updateArea} onAreaComplete={finishArea} units={units} onUnitSelect={selectUnit} fireCells={mapScenario.fireCells} centers={mapScenario.centers} incident={mapScenario.incident} />
      </main>
      <header className="floating-brand" data-tour="brand">
        <div className="brand-row"><span className="brand-symbol" aria-hidden="true">V</span><strong>vigía</strong></div>
        <span className="brand-divider" aria-hidden="true" />
        {liveMode ? <div className="live-header-context"><strong>Incendio de prueba · HappyRobot</strong></div> : <>
        <button ref={incidentButtonRef} type="button" className="incident-trigger" aria-label="Cambiar escenario" aria-expanded={panel === 'incidents'} aria-controls={panelId} onClick={() => togglePanel('incidents')}>
          <span><strong>{scenario.incident.name}</strong><small><i className={`connection-dot ${apiRoster ? 'connected' : ''}`} aria-hidden="true" />{apiRoster ? 'API conectada' : 'Escenario de demo'} · {apiRoster ? placeName : scenario.incident.area}</small></span><Icon name="chevron" />
        </button>
        </>}
      </header>
      <button type="button" className="workspace-mobile-toggle" aria-expanded={workspaceOpen} aria-controls={sidebarId} onClick={() => { setWorkspaceOpen(open => !open); setSelectedId(null); setPanel(null) }}><Icon name={workspaceOpen ? 'close' : 'layers'} />{workspaceOpen ? 'Ver mapa' : 'Situación y herramientas'}</button>
      <aside id={sidebarId} className="workspace-sidebar" aria-label="Resumen y herramientas">
        <section className="mission-brief">
          <h1>{liveMode ? 'Ejercicio de incendio' : 'Evacuación por incendio'}</h1>
          {liveMode && <div className={`connection-status ${rosterStatus}`} role="status"><span>{rosterStatus === 'loading' ? 'Conectando con el censo…' : rosterStatus === 'error' ? 'No se pudo conectar con la API.' : counts.total ? `${counts.total} personas en el censo` : 'API conectada. El censo está vacío.'}</span>{rosterStatus === 'error' && <button type="button" onClick={() => { setRosterStatus('loading'); setRosterAttempt(value => value + 1) }}>Reintentar</button>}</div>}
          {!campaignIds.length && !liveBatch ? <div className="mission-start">
            <button type="button" className="cop-primary" onClick={!liveMode && !apiRoster ? startScenarioDemo : prepareLiveExercise}><Icon name={!liveMode && !apiRoster ? 'play' : 'phone'} />{!liveMode && !apiRoster ? 'Iniciar simulación' : 'Preparar situación'}</button>
            <button type="button" className="mission-draw" aria-label="Dibujar zona de llamadas" onClick={beginArea}>Elegir una zona en el mapa <span aria-hidden="true">↗</span></button>
          </div> : <div className="mission-progress">
            <div><strong>{liveMode ? 'Campaña de llamadas' : protocolOn ? 'Simulación en marcha' : 'Simulación en pausa'}</strong><button type="button" onClick={() => togglePanel('campaign')}>Ver actividad →</button></div>
            <p>{liveMode ? `${liveCalls.length} llamadas en el tablero` : `${counts.answered} de ${campaignIds.length} personas han respondido`}</p>
            {!liveMode && <progress aria-label="Personas que han respondido" value={counts.answered} max={campaignIds.length || 1} />}
            {!liveMode && <div className="mission-results">
              <button type="button" onClick={() => openQueue('evacuating')}><strong>{counts.moving}</strong><span>En tránsito</span></button>
              <button type="button" onClick={() => openQueue('safe')}><strong>{counts.safe}</strong><span>En destino</span></button>
              <button type="button" onClick={() => openQueue('no_answer')}><strong>{counts.silent}</strong><span>Sin respuesta</span></button>
            </div>
            }
            {counts.waiting > 0 && <button type="button" className="mission-attention" onClick={() => openQueue('assistance')}>{counts.waiting} personas necesitan revisión de ruta →</button>}
          </div>}
        </section>
        <div className="workspace-section-label">Puesto de mando</div>
        <nav className="workspace-navigation" aria-label="Herramientas del mapa">
          <button type="button" className={panel === 'campaign' ? 'active' : ''} aria-expanded={panel === 'campaign'} aria-controls={panelId} onClick={() => togglePanel('campaign')}><Icon name="phone" /><span><strong>Llamadas</strong><small>Zona, respuestas y actividad</small></span><span className="nav-chevron" aria-hidden="true">›</span></button>
          <button ref={peopleButtonRef} type="button" data-tour="people-nav" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls={panelId} onClick={() => togglePanel('people')}><Icon name="people" /><span><strong>{liveMode ? 'Personas' : 'Personas y rutas'}</strong><small>{liveMode ? 'Censo y ubicación compartida' : 'Prioridad, ubicación y ayuda'}</small></span><span className="nav-count">{counts.total}</span></button>
          <button ref={copButtonRef} type="button" data-tour="cop-nav" aria-label="Propagación" className={panel === 'cop' ? 'active' : ''} aria-expanded={panel === 'cop'} aria-controls={panelId} onClick={() => togglePanel('cop')}><Icon name="fire" /><span><strong>{liveMode ? 'Situación de prueba' : 'Fuego y evacuación'}</strong><small>Viento, convoyes y sectores</small></span><span className="nav-chevron" aria-hidden="true">›</span></button>
          {!liveMode && <>
          <details className="more-tools"><summary>Más herramientas</summary><div>
          <button ref={alertsButtonRef} type="button" aria-label={`Avisos ${unreadAlerts.length}`} className={panel === 'alerts' ? 'active' : ''} aria-expanded={panel === 'alerts'} aria-controls={panelId} onClick={() => togglePanel('alerts')}><Icon name="units" /><span><strong>Avisos y medios</strong><small>Incidencias, patrullas y apoyo</small></span><span className="nav-count">{unreadAlerts.length}</span></button>
          <button ref={centersButtonRef} type="button" aria-label="Centros y coordinación" className={panel === 'centers' ? 'active' : ''} aria-expanded={panel === 'centers'} aria-controls={panelId} onClick={() => togglePanel('centers')}><Icon name="centers" /><span><strong>Centros y coordinación</strong><small>Hospitales, bomberos y preavisos</small></span><span className="nav-chevron" aria-hidden="true">›</span></button>
          <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls={panelId} onClick={() => togglePanel('layers')}><Icon name="layers" /><span><strong>Capas y leyenda</strong><small>Qué representa cada punto</small></span><span className="nav-chevron" aria-hidden="true">›</span></button>
          </div></details>
          </>}
        </nav>
        {!liveMode && <div className="workspace-help"><button type="button" className="tour-replay" aria-label={TOUR_INTRO.replay} onClick={beginTour}><Icon name="play" />Ver recorrido guiado</button><span>HackSpain 2026 · Vigía</span></div>}
      </aside>
      <div className="map-caption"><strong>{liveMode ? 'Ubicaciones del censo' : 'Mapa de evacuación'}</strong>{!liveMode && <><span><i className="legend-fire" />Incendio</span><span><i className="legend-point" />Personas</span><span><span aria-hidden="true">{SITE_EMOJI.meeting}</span>Encuentro</span></>}</div>
      {liveMode ? <div className="cop-strip" aria-label="Estado del censo"><button type="button" onClick={() => openQueue('all')}><strong>{counts.total}</strong><small>personas</small></button><button type="button" onClick={() => openQueue('no_answer')}><strong>{counts.silent}</strong><small>sin respuesta</small></button></div> : <CopStrip total={counts.total} silent={counts.silent} imminent={counts.imminent} lastChange={planChange?.summary} onPeople={() => openQueue('all')} onSilent={() => openQueue('no_answer')} onImminent={() => openQueue('imminent')} onDiff={() => { setSelectedId(null); setPanel('cop') }} />}
      {planChange && <PlanDiffBanner diff={planChange} onOpen={() => { setSelectedId(null); setPanel('cop') }} onDismiss={() => setPlanChange(null)} />}
      {tourIntroOpen && <TourIntro onStart={beginTour} onDismiss={dismissTourIntro} />}
      {toasts.length > 0 && !panel && !selected && !tourIntroOpen && <ol className="alert-toasts" aria-live="polite">{toasts.map(alert => <li key={alert.id}><button type="button" className={`alert-toast ${alert.severity}`} onClick={() => { setSelectedId(null); setFocusTarget(alert.focus ?? null); setPanel('alerts'); setReadAlertIds(new Set(alerts.map(item => item.id))) }}>{alert.title}</button></li>)}</ol>}
      {((panel && panel !== 'campaign') || selected) && <aside id={panelId} data-tour="tour-panel" className="floating-panel" aria-label={panelTitle}>
        <div className="floating-panel-heading"><h2>{panelTitle}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body" key={selected?.id ?? panel}>
          {!selected && panel === 'cop' && liveMode && <section className="exercise-activation">
            <label className="search-label"><span>Clave de operador</span><input className="search" type="password" autoComplete="off" value={operatorKey} onChange={event => { setOperatorKey(event.target.value); saveOperatorKey(event.target.value) }} placeholder="Clave de operador" /></label>
            <button type="button" className="cop-primary" disabled={!apiRoster || !exerciseAnchor || !operatorKey.trim() || publishingExercise || exerciseReady} onClick={() => void activateLiveExercise()}>{publishingExercise ? 'Publicando situación…' : exerciseReady ? 'Situación publicada' : publishedExercise ? 'Publicar cambios y preparar llamadas' : 'Activar incendio y preparar llamadas'}</button>
            <p className="fine">Al publicar, HappyRobot puede iniciar llamadas y SMS automáticos.</p>
            {!apiRoster && <p className="fine" role="status">Conecta con el censo para situar y activar el incendio.</p>}
            {publishedExercise && !exerciseReady && <p className="fine">Hay cambios locales pendientes de publicar.</p>}
            {exerciseError && <p className="need-note" role="alert">{exerciseError}</p>}
          </section>}
          {panel === 'incidents' && !selected ? <div className="cop-content"><p className="panel-intro">Selecciona el escenario que quieres gestionar.</p><nav className="incident-list" aria-label="Incendios activos">{SCENARIOS.map(item => <button type="button" key={item.id} aria-pressed={item.id === scenario.id} onClick={() => selectScenario(item.id)}><i className="incident-dot" aria-hidden="true" /><span><strong>{item.incident.name}</strong><small>{item.incident.area}</small></span>{item.id === scenario.id && <span className="selected-label">Activo</span>}</button>)}</nav><p className="fine">Cambiar de escenario reinicia la campaña y los medios de esta vista.</p></div> : selected ? <><PersonDetail citizen={selected} minute={ranked.find(item => item.id === selected.id)?.minute} allowDispatch={!liveMode} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }} onDispatch={kind => dispatchUnit(kind, { lng: selected.lng, lat: selected.lat, label: selected.name, citizenId: selected.id })} unitLimit={units.length >= MAX_UNITS} zones={scenario.safeZones} />{!liveMode && <RefugeRoutesPanel key={selected.id} citizen={selected} token={token} forecast={forecast} horizon={horizon} marginM={marginM} onRoute={setMapRoute} zones={scenario.safeZones} />}</> : panel === 'cop' ? <FireControls settings={fireSettings} horizon={horizon} playing={firePlaying} onPlay={playFire} onReset={resetFire} showWind={showWind} onWind={toggleWind} onShiftWind={shiftWind} windShifted={windShifted} marginM={marginM} forecast={forecast} onFocus={point => { setFocusTarget({ lng: point.lng, lat: point.lat }); setLayers(previous => ({ ...previous, zones: true })) }} onFocusCitizen={selectCitizen} zones={scenario.safeZones} convoys={liveMode ? undefined : convoys} sectors={liveMode ? undefined : sectors} /> : panel === 'centers' ? <ResponsePanel key={scenario.id} selectedId={selectedCenterId} onSelect={selectCenter} scenario={scenarioLabel} notices={notices} onNotices={setNotices} centers={scenario.centers} settlements={scenario.settlements} /> : panel === 'alerts' ? <AlertsPanel alerts={alerts} units={units} onAction={handleAlertAction} onDispatch={(alert, kind) => handleAlertAction(alert, kind === 'police' ? 'dispatch-police' : kind === 'ambulance' ? 'dispatch-ambulance' : 'dispatch-fire')} onFocus={alert => { if (alert.focus) setFocusTarget(alert.focus) }} onFocusUnit={selectUnit} /> : panel === 'layers' ? (
            <div className="layer-content">
              <div className="map-legend" aria-label="Leyenda"><span><i className="legend-point" />Sin respuesta</span><span><i className="legend-point answered" />Llamada respondida</span><span><span className="site-emoji" aria-hidden="true">{SITE_EMOJI.meeting}</span>Punto de encuentro</span><span><Icon name="units" />Medios</span><span><i className="legend-fire" />Huella térmica</span></div>
              {layerOptions(scenario).map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><LayerMark layer={layer.key} symbol={layer.symbol} /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">La huella y la proyección son del escenario. No delimitan un perímetro confirmado.</p>
            </div>
          ) : (
            <>
              <div data-tour="people-queue">
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input className="search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{(liveMode ? [['all', 'Todas'], ['no_answer', 'Sin respuesta']] : [['all', 'Todas'], ['imminent', 'Menos de 20 min'], ['outside', 'Fuera del núcleo'], ['evacuating', 'En tránsito'], ['safe', 'En destino'], ['no_answer', 'Sin respuesta'], ['assistance', 'Revisión de ruta']]).map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              {!liveMode && (filter === 'all' || filter === 'no_answer') && (filter === 'no_answer' || silent.length > 0) ? <SilentHouses houses={filtered.filter(citizen => citizen.status === 'no_answer' || citizen.callState === 'no_answer')} disabled={units.length >= MAX_UNITS} onSelect={selectCitizen} onPatrol={citizen => dispatchUnit('police', { lng: citizen.lng, lat: citizen.lat, label: citizen.name, citizenId: citizen.id })} /> : null}
              <div className="list-summary"><span>{filtered.length} {filtered.length === 1 ? 'persona' : 'personas'}{liveMode ? ' · censo' : ' · cola por frente'}</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span className={`dot ${citizen.call ? 'answered' : citizen.status}`} /><span className="person-row-copy"><strong>{citizen.name}</strong><em>{citizen.locality}</em></span><span className="person-row-meta">{!liveMode && <small>{formatFrontEta(citizen.minute)}</small>}<span>{citizen.status === 'pending' && !liveMode ? `#${citizen.rank}` : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>{query ? 'No hay coincidencias' : filter === 'imminent' ? 'Nadie está a menos de 20 min del frente' : filter === 'evacuating' ? 'Todavía no hay personas en tránsito' : filter === 'safe' ? 'Todavía no hay llegadas registradas' : filter === 'assistance' ? 'No hay rutas pendientes de revisión' : 'No hay personas en esta lista'}</strong><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button></div>}
              </div>
            </>
          )}
        </div>
      </aside>}
      <section className={`campaign-dock ${liveMode ? 'is-live' : ''}`} data-tour="campaign" aria-label="Campaña de llamadas por zona">
        <button ref={campaignButtonRef} type="button" className="campaign-settings-button" aria-label="Opciones de campaña" aria-expanded={panel === 'campaign'} aria-controls={panelId} onClick={() => togglePanel('campaign')}><Icon name="settings" /></button>
        <button type="button" className="campaign-summary" aria-label="Ver actividad de campaña" onClick={() => togglePanel('campaign')}><strong>{drawingArea ? 'Dibuja una zona en el mapa' : callArea ? `${areaIds.length} personas · ${(callArea.radiusM / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km de radio` : liveBatch ? `${liveCalls.length} llamadas en la campaña` : 'Selecciona una zona'}</strong><span>{liveMode ? 'Llamadas reales · HappyRobot' : 'Simulación local'}{dispatchError ? ' · Revisar incidencia' : planningCount ? ` · ${planningCount} rutas en cálculo` : counts.waiting ? ` · ${counts.waiting} sin ruta` : campaignRunning ? ' · Campaña en curso' : ''}</span></button>
        {!liveMode && campaignRunning && <button type="button" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} /></button>}
        {drawingArea ? <button type="button" className="cop-secondary dock-cancel" onClick={() => { setDrawingArea(false); updateArea(null) }}>Cancelar</button> : <button type="button" className="cop-primary dock-primary" onClick={callArea ? launchAreaCampaign : beginArea} disabled={dispatching || Boolean(callArea && (liveMode ? !exerciseReady || !apiRoster || !operatorKey.trim() || !areaIds.length : !callableCount))}><Icon name={callArea ? 'phone' : 'zone'} /><span>{dispatching ? 'Enviando…' : callArea ? liveMode ? 'Llamar · REAL' : 'Llamar · demo' : 'Dibujar zona'}</span></button>}
      </section>
      {panel === 'campaign' && !selected && <aside id={panelId} data-tour="tour-panel" className="floating-panel" aria-label="Campaña de llamadas">
        <div className="floating-panel-heading"><h2>Campaña de llamadas</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body">
        {!liveMode && campaignIds.length > 0 && <section className="campaign-activity" aria-label="Actividad de la simulación">
          <div className="campaign-activity-heading"><h3>Últimas llamadas</h3><span>{counts.answered}/{campaignIds.length} respondidas</span></div>
          {!events.length ? <p role="status">Iniciando llamadas…</p> : <ul>{events.slice(0, 5).map(event => <li key={event.id}><button type="button" onClick={() => selectCitizen(event.citizenId)}><span className="activity-dot" /><span><strong>{event.name}</strong><small>{event.detail}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>}
          <button type="button" className="cop-secondary" onClick={() => openQueue('all')}>Ver todas las personas →</button>
        </section>}
        <section className="campaign-settings">
        <div className="campaign-heading"><strong>{drawingArea ? 'Arrastra para dibujar un círculo' : callArea ? `${areaIds.length} personas seleccionadas · radio ${Math.round(callArea.radiusM)} m` : 'Selecciona a quién llamar'}</strong></div>
        {liveMode && <div className="exercise-campaign-status"><p>{exerciseReady ? 'Situación publicada' : 'Situación pendiente de publicar'}</p><button type="button" className="cop-secondary" onClick={prepareLiveExercise}>{exerciseReady ? 'Ver situación de prueba →' : 'Preparar situación →'}</button></div>}
        {liveMode && <label className="search-label"><span className="sr-only">Clave de operador</span><input className="search" type="password" autoComplete="off" placeholder="Clave de operador" value={operatorKey} onChange={(event) => { setOperatorKey(event.target.value); saveOperatorKey(event.target.value) }} /></label>}
        {liveMode && <label className="row live-toggle"><input type="checkbox" checked={forceRecall} onChange={(event) => setForceRecall(event.target.checked)} />Volver a llamar aunque ya tengan un intento</label>}
        {liveMode && !apiRoster && <p className="fine" role="status">Conecta con el censo antes de seleccionar destinatarios.</p>}
        {drawingArea && <p className="fine">Pulsa en el centro y arrastra hasta el borde. Mínimo 50 m. Escape cancela.</p>}
        <div className="campaign-actions">
          <button type="button" className="cop-primary" onClick={callArea && !drawingArea ? launchAreaCampaign : beginArea} disabled={dispatching || Boolean(callArea && !drawingArea && (liveMode ? !exerciseReady || !apiRoster || !operatorKey.trim() || !areaIds.length : !callableCount))}>{!callArea || drawingArea ? 'Dibujar zona' : dispatching ? 'Lanzando llamadas…' : liveMode ? areaIds.length ? `Llamar a ${areaIds.length} seleccionados · REAL` : 'Nadie dentro del círculo' : callableCount ? `Llamar a ${callableCount} seleccionados · demo` : 'Sin contactos nuevos'}</button>
          {(callArea || drawingArea) && <button type="button" className="cop-secondary" onClick={() => { setDrawingArea(false); updateArea(null) }}>Borrar selección</button>}
          {!liveMode && campaignRunning && <button type="button" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} />{protocolOn ? 'Pausar' : 'Reanudar'}</button>}
        </div>
        {!callArea && (!liveMode || rosterCenter) && <button type="button" className="cop-secondary" onClick={() => finishArea({ ...(rosterCenter ?? { lng: scenario.incident.center[0], lat: scenario.incident.center[1] }), radiusM: rosterCenter ? 1000 : 3000 })}>{liveMode ? 'Usar zona del censo · 1 km' : 'Usar entorno del incendio · 3 km'}</button>}
        {!liveMode && callArea && !callableCount && !drawingArea && <p className="fine" role="status">No quedan contactos pendientes en esta zona.</p>}
        {dispatchError && <p className="fine" role="alert">{dispatchError}</p>}
        {liveBatch && <CallBoard calls={liveCalls} skipped={liveBatch.skipped} onSelect={selectCitizen} />}
        {!liveMode && campaignIds.length > 0 && <div className="campaign-stats" role="status"><span><strong>{counts.answered}</strong>/{campaignIds.length} respondidas</span><span>{counts.moving} en movimiento</span><span>{counts.silent} sin respuesta</span>{counts.waiting > 0 && <span>{counts.waiting} sin ruta</span>}</div>}
        {!liveMode && planningCount > 0 && <p className="fine" role="status">Calculando {planningCount} rutas individuales desde la posición de los contactos…</p>}
        {!liveMode && counts.waiting > 0 && <><p className="fine" role="status">{citizens.find(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance')?.routeHoldReason}</p><button type="button" className="cop-secondary" onClick={retryRoutes}>Reintentar rutas pendientes</button></>}
        {!liveMode && areaIds.length > 0 && !drawingArea && <DispatchActions kinds={['ambulance', 'police', 'fire']} disabled={units.length >= MAX_UNITS} onDispatch={kind => {
          const target = targetFromCitizens(areaIds, callArea ?? undefined, `${areaIds.length} en zona`)
          if (target) dispatchUnit(kind, target)
        }} />}
        </section></div>
      </aside>}
    </div>
  )
}

function CallBoard({ calls, skipped, onSelect }: { calls: CallRun[]; skipped: DispatchResultSkip[]; onSelect: (id: string) => void }) {
  const porEstado = calls.reduce<Record<string, number>>((acc, call) => ({ ...acc, [call.state]: (acc[call.state] ?? 0) + 1 }), {})
  const abiertas = calls.filter((call) => CALL_STATE_OPEN.includes(call.state)).length
  return (
    <div className="call-board">
      <div className="campaign-stats" role="status">
        <span><strong>{calls.length}</strong> {calls.length === 1 ? 'llamada lanzada' : 'llamadas lanzadas'}</span>
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

const ICONS = {
  zone: 'M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M12 7v10M7 12h10',
  fire: 'M13 3c1 5-4 5-2 9 1-2 3-2 4-4 3 3 4 5 4 7a7 7 0 0 1-14 0c0-4 4-6 8-12Z',
  centers: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  alerts: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 12a3 3 0 0 0 6 0',
  close: 'm6 6 12 12M6 18 18 6', play: 'm8 4 12 8-12 8Z', pause: 'M8 5v14M16 5v14',
  settings: 'M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6', chevron: 'm8 10 4 4 4-4',
  phone: 'M8 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2Z',
  wind: 'M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3',
  routes: 'M6 3v13a3 3 0 0 0 6 0V8a3 3 0 0 1 6 0v13M3 6l3-3 3 3m6 12 3 3 3-3',
  thermal: 'M12 3v2m0 14v2M3 12h2m14 0h2M6 6l1 1m10 10 1 1M6 18l1-1M17 7l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  units: 'M3 6h11v12H3Zm11 4h4l3 4v4h-7M5 18v2m12-2v2M7 10h3M8.5 8.5v3',
}
const LAYER_MARK: Partial<Record<keyof MapLayers, keyof typeof SITE_EMOJI>> = {
  hospitals: 'hospital',
  healthCenters: 'health',
  fireStations: 'fire',
  zones: 'meeting',
}

function LayerMark({ layer, symbol }: { layer: keyof MapLayers; symbol: keyof typeof ICONS }) {
  const mark = LAYER_MARK[layer]
  if (mark) return <span className="site-emoji" aria-hidden="true">{SITE_EMOJI[mark]}</span>
  return <Icon name={symbol} />
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>
}

function PersonDetail({ citizen, minute, events, now, onClose, onDispatch, unitLimit, zones, allowDispatch = true }: { allowDispatch?: boolean; citizen: Citizen; minute?: number; events: CallEvent[]; now: number; onClose: () => void; onDispatch: (kind: UnitKind) => void; unitLimit: boolean; zones: SafeZone[] }) {
  const locationSource = citizen.locationSource ?? 'reference'
  const reference = locationSource === 'reference' || locationSource === 'unknown'
  const stale = citizen.locationUpdatedAt !== undefined && now - citizen.locationUpdatedAt > 120_000
  return (
    <article className="person-detail">
      <button type="button" className="back-button" onClick={onClose}>‹ Todas las personas</button>
      <div className="person-title"><span className="person-avatar">{citizen.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><div><span className="eyebrow">{citizen.locality ?? citizen.id}</span><h2>{citizen.name}</h2></div></div>
      <div className="person-badges"><span className={`status-badge ${citizen.status}`}>{STATUS_LABEL[citizen.status]}</span>{minute !== undefined && <span className="status-badge">Frente {formatFrontEta(minute)}</span>}{citizen.resident === false && <span className="status-badge">Fuera del núcleo</span>}</div>
      {citizen.status === 'assistance' && <p className="need-note">{citizen.routeHoldReason}</p>}
      {allowDispatch && <section className="detail-section"><h3>Enviar medio</h3>
        <DispatchActions kinds={['ambulance', 'police', 'fire']} disabled={unitLimit} onDispatch={onDispatch} />
        {unitLimit && <p className="fine">Límite de {MAX_UNITS} envíos.</p>}
      </section>}
      {!citizen.live && citizen.routeId && <p className="fine">Destino: {zones.find(zone => zone.id === citizen.safeZoneId)?.name}</p>}
      <section className="detail-section"><h3>Localización</h3>
        <div className={`location-card ${reference || stale ? 'uncertain' : ''}`}><strong>{LOCATION_LABEL[locationSource]}</strong><span className="coordinates">{Math.abs(citizen.lat).toFixed(5)}° {citizen.lat >= 0 ? 'N' : 'S'} / {Math.abs(citizen.lng).toFixed(5)}° {citizen.lng < 0 ? 'O' : 'E'}</span><span>{locationAge(citizen.locationUpdatedAt, now)}{stale ? ' · desactualizada' : ''}</span></div>
        <dl className="detail-fields"><div><dt>Precisión</dt><dd>{citizen.accuracyM !== undefined ? `${Math.round(citizen.accuracyM)} m` : 'No disponible'}</dd></div><div><dt>Origen</dt><dd>{citizen.live ? locationSource === 'gps' ? 'Dispositivo' : 'Sesión compartida' : 'Registro'}</dd></div></dl>
      </section>
      <section className="detail-section"><h3>Última llamada</h3>
        <div className="call-summary"><p>{citizen.call?.summary ?? (citizen.callState ? CALL_STATE_LABEL[citizen.callState] : 'Sin llamada registrada')}</p></div>
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
