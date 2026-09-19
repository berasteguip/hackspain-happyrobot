import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { INITIAL_CITIZENS, SAFE_ZONES, SCENARIO_FIRES, SCENARIO_FIRE_CELLS, INCIDENT, RECOMMENDED_CALL_AREA } from './scenario'
import { activeFireFootprint, buildFireForecast, exposureAt, FIRE_TIME_SCALE, forecastGeo, MAX_FORECAST_MIN, routeBlocked } from './fire-model'
import type { FireSettings } from './fire-model'
import { FireControls, RefugeRoutesPanel, ResponsePanel } from './CopPanels'
import { RESPONSE_CENTERS } from './response'
import type { DemoNotice } from './response'
import type { RefugeRoute } from './routing'
import { assignedCitizenRoute, holdUnsafeJourneys, planCitizenRoute, rankRefugeRoutes } from './routing'
import type { RouteIndex } from './routing'
import { advanceProtocol, contactCandidateIds, hasSharedLocation, moveEvacuees, prepareAreaCampaign, selectContactLocalities } from './simulation'
import type { CallArea, CallEvent, Citizen, FireSpot, LocationPing, MapLayers } from './types'
import { applyWaveStatus, buildWavePeople, canPlanCitizen, demoMobility, fetchWaveStatus, householdSize, needsWavePolling, pickWaveCitizens, reservedPeople, restoreWave, startWave } from './bridge'
import type { WavePerson } from './bridge'

const STATUS_LABEL: Record<Citizen['status'], string> = {
  pending: 'Sin contactar', ringing: 'En llamada', no_answer: 'Sin respuesta',
  informed: 'Aviso recibido', tracking: 'Ubicación compartida', evacuating: 'En tránsito · sim.',
  safe: 'En punto de encuentro · sim.', refused: 'No comparte ubicación', assistance: 'Ruta pendiente de revisión', routing: 'Calculando ruta individual',
}
const LOCATION_LABEL = {
  reference: 'Referencia residencial aproximada', simulation: 'Ubicación compartida · demo',
  gps: 'Geolocalización del dispositivo', unknown: 'Origen no especificado',
}
const LAYER_OPTIONS: { key: keyof MapLayers; name: string; detail: string; symbol: string }[] = [
  { key: 'perimeter', name: 'Huella térmica', detail: 'Manchas de celdas · escenario simulado', symbol: 'perimeter' },
  { key: 'routes', name: 'Ruta seleccionada', detail: 'Comparación por tiempo · filtro de exposición', symbol: 'spread' },
  { key: 'hospitals', name: 'Hospitales', detail: 'Posición de demo · centro real en Talavera', symbol: 'zone' },
  { key: 'healthCenters', name: 'Centros de salud', detail: 'No equivalen a hospitales', symbol: 'zone' },
  { key: 'fireStations', name: 'Bomberos', detail: 'Posición de demo · sin despliegues reales', symbol: 'zone' },
  { key: 'thermal', name: 'Detecciones térmicas', detail: 'Focos puntuales, no perímetros', symbol: 'thermal' },
  { key: 'citizens', name: 'Personas', detail: 'Ubicación y estado de contacto', symbol: 'person' },
  { key: 'zones', name: 'Puntos de encuentro', detail: 'Lugares reales · uso como refugio simulado', symbol: 'zone' },
]
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
  const [citizens, setCitizens] = useState<Citizen[]>(INITIAL_CITIZENS)
  const [events, setEvents] = useState<CallEvent[]>([])
  const [protocolOn, setProtocolOn] = useState(false)
  const [callArea, setCallArea] = useState<CallArea | null>(null)
  const [additionalAreas, setAdditionalAreas] = useState<CallArea[]>([])
  const [recommendedEnabled, setRecommendedEnabled] = useState(true)
  const [drawingArea, setDrawingArea] = useState(false)
  const selectedLocalities = useMemo(() => selectContactLocalities(recommendedEnabled ? RECOMMENDED_CALL_AREA : null, additionalAreas), [recommendedEnabled, additionalAreas])
  const areaIds = useMemo(() => contactCandidateIds(citizens, selectedLocalities), [citizens, selectedLocalities])
  const selectedAreaCount = Number(recommendedEnabled) + additionalAreas.length
  const [campaignIds, setCampaignIds] = useState<string[]>([])
  const campaignRef = useRef<ReadonlySet<string>>(new Set())
  const campaignSet = useMemo(() => new Set(campaignIds), [campaignIds])
  const [planningCount, setPlanningCount] = useState(0)
  const [waveStarting, setWaveStarting] = useState(false)
  const [bridgeNotice, setBridgeNotice] = useState('')
  const [retryWavePeople, setRetryWavePeople] = useState<WavePerson[] | null>(null)
  const [campaignMode, setCampaignMode] = useState<'happyrobot' | 'local'>('happyrobot')
  const launchRef = useRef(false)
  const launchController = useRef<AbortController | null>(null)
  useEffect(() => () => launchController.current?.abort(), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | 'cop' | 'centers' | 'campaign' | null>(null)
  const [fireSettings] = useState<FireSettings>({ windTowardDeg: 225, windKmh: 20, spreadMPerMin: 5 })
  const [horizon, setHorizon] = useState(0)
  const [fireMinute, setFireMinute] = useState(0)
  const [fireRunning, setFireRunning] = useState(true)
  const fireFinished = fireMinute >= MAX_FORECAST_MIN
  const fireEpoch = Math.ceil(fireMinute)
  const fireFootprint = useMemo(() => activeFireFootprint(SCENARIO_FIRE_CELLS, fireSettings, fireMinute), [fireSettings, fireMinute])
  useEffect(() => {
    if (!fireRunning || fireFinished) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(1, (now - last) / 1000)
      last = now
      if (!document.hidden) setFireMinute(previous => Math.min(MAX_FORECAST_MIN, previous + delta * FIRE_TIME_SCALE / 60))
    }, 500)
    return () => window.clearInterval(timer)
  }, [fireRunning, fireFinished])
  const [showWind, setShowWind] = useState(false)
  const marginM = 150
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lng: number; lat: number; zoom?: number } | null>(null)
  const [routePreview, setRoutePreview] = useState<{ citizenId: string; route: RefugeRoute } | null>(null)
  const setMapRoute = useCallback((route: RefugeRoute | null) => setRoutePreview(route && selectedId ? { citizenId: selectedId, route } : null), [selectedId])
  const [notices, setNotices] = useState<DemoNotice[]>([])
  const forecast = useMemo(() => buildFireForecast(activeFireFootprint(SCENARIO_FIRE_CELLS, fireSettings, fireEpoch), fireSettings), [fireSettings, fireEpoch])
  const projection = useMemo(() => forecastGeo(forecast, horizon), [forecast, horizon])
  const zoneExposure = useMemo(() => Object.fromEntries(SAFE_ZONES.map(zone => [zone.id, exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)])), [forecast, horizon, marginM])
  const forecastRef = useRef({ forecast, horizon, marginM })
  useEffect(() => { forecastRef.current = { forecast, horizon, marginM } }, [forecast, horizon, marginM])
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: false, thermal: false, citizens: true, references: true, zones: true, hospitals: true, healthCenters: true, fireStations: true, routes: true })
  const citizensRef = useRef(citizens)
  const routesRef = useRef<RouteIndex>(new Map())
  const [routeIndex, setRouteIndex] = useState<RouteIndex>(() => new Map())
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
  const campaignButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { citizensRef.current = citizens }, [citizens])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (drawingArea) { setDrawingArea(false); setCallArea(null); return }
      setSelectedId(null)
      setPanel(null)
      if (panel === 'campaign') campaignButtonRef.current?.focus()
      else if (panel === 'cop') copButtonRef.current?.focus()
      else if (panel === 'centers') centersButtonRef.current?.focus()
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
      const candidates = citizensRef.current.filter(citizen => campaignRef.current.has(citizen.id) && canPlanCitizen(citizen) && !citizen.routeId && ['tracking', 'routing', 'assistance'].includes(citizen.status) && !plannedRef.current.has(citizen.id))
      for (const citizen of candidates.slice(0, Math.max(0, 2 - inFlightRef.current.size))) {
        plannedRef.current.add(citizen.id)
        inFlightRef.current.add(citizen.id)
        setPlanningCount(inFlightRef.current.size)
        updatePopulation(current => current.map(item => item.id === citizen.id ? { ...item, status: 'routing', routeHoldReason: 'Consultando una ruta desde su posición…' } : item))
        void planCitizenRoute(token, citizen, SAFE_ZONES, forecastRef.current.forecast, marginM, controller.signal).then(plan => {
          if (controller.signal.aborted) return
          updatePopulation(current => current.map(item => {
            if (item.id !== citizen.id || item.live || item.locationSource === 'gps' || item.call?.consent !== 'granted') return item
            if (plan.route && !rankRefugeRoutes([{ id: plan.route.id, zoneId: plan.route.zoneId, coordinates: plan.route.coords, durationSec: plan.route.durationSec, distanceM: plan.route.lengthM, accessM: 0 }], SAFE_ZONES, forecastRef.current.forecast, 60, marginM).routes.length) return { ...item, status: 'assistance', fireAlert: true, routeHoldReason: 'El incendio cambió durante la consulta. Recorrido descartado; requiere apoyo y revisión.' }
            const zone = SAFE_ZONES.find(zone => zone.id === plan.citizen.safeZoneId)
            if (item.hrCall && plan.route && zone && reservedPeople(current.filter(other => other.id !== item.id), zone.id) + householdSize(item) > zone.capacity) return { ...item, status: 'assistance', routeHoldReason: 'Sin plazas para todo el grupo en el destino comunicado. Requiere coordinación.' }
            if (plan.route) {
              routesRef.current.set(plan.route.id, plan.route)
              setRouteIndex(new Map(routesRef.current))
            }
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
  }, [protocolOn, token, marginM, updatePopulation])
  useEffect(() => {
    if (!fireRunning) return
    const timer = window.setInterval(() => {
      const previous = citizensRef.current
      const next = holdUnsafeJourneys(previous, routesRef.current, SAFE_ZONES, forecastRef.current.forecast, marginM)
      if (next.some((citizen, index) => citizen !== previous[index])) updatePopulation(() => next)
    }, 500)
    return () => window.clearInterval(timer)
  }, [fireRunning, marginM, updatePopulation])
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
      const moved = moveEvacuees(ready, routesRef.current, SAFE_ZONES, dt).map((next, index) => {
        const previous = ready[index]
        if (next === previous || previous.live) return next
        const zone = SAFE_ZONES.find(item => item.id === next.safeZoneId)
        const road = next.routeId ? routesRef.current.get(next.routeId) : undefined
        const hasRoad = road?.zoneId === next.safeZoneId && road?.group === (next.locality ?? '')
        const throughMinute = Math.max(60, risk.horizon)
        const exposed = !zone || exposureAt(risk.forecast, zone.lng, zone.lat, throughMinute, risk.marginM + zone.radiusM).level !== 'clear'
        return !hasRoad || exposed || routeBlocked(risk.forecast, [[previous.lng, previous.lat], [next.lng, next.lat]], 0, risk.marginM) ? { ...previous, status: 'assistance' as const, fireAlert: exposed || hasRoad, routeHoldReason: 'Recorrido detenido por exposición o falta de ruta. Pendiente de revisión del mando.' } : next
      })
      citizensRef.current = moved
      setCitizens(moved)
      const awaitingPlan = moved.some(citizen => campaignRef.current.has(citizen.id) && canPlanCitizen(citizen) && !citizen.routeId && !plannedRef.current.has(citizen.id))
      if (!inFlightRef.current.size && !awaitingPlan && moved.every(citizen => !campaignRef.current.has(citizen.id) || citizen.live || !['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))) setProtocolOn(false)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 700))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn])
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

  const fires = useMemo(() => showFirms ? [...SCENARIO_FIRES, ...firms] : SCENARIO_FIRES, [showFirms, firms])
  const locatedCitizens = useMemo(() => citizens.filter(hasSharedLocation), [citizens])
  const counts = useMemo(() => ({
    total: locatedCitizens.length,
    answered: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.call).length,
    located: locatedCitizens.length,
    silent: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'no_answer').length,
    moving: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'evacuating').length,
    waiting: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance').length,
  }), [citizens, campaignSet, locatedCitizens])
  const campaignRunning = needsWavePolling(citizens) || citizens.some(citizen => campaignSet.has(citizen.id) && !citizen.live && ['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))
  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const assignedRoute = assignedCitizenRoute(selected, routeIndex)
  const mapRoute = routePreview?.citizenId === selectedId ? routePreview.route : assignedRoute
  const filtered = locatedCitizens.filter((citizen) => {
    const text = `${citizen.name} ${citizen.phone} ${citizen.id} ${citizen.locality} ${STATUS_LABEL[citizen.status]}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'outside' ? citizen.resident === false : citizen.status === filter))
  })
  const updateArea = (area: CallArea | null) => setCallArea(area)
  const finishArea = (area: CallArea) => {
    if ([area.lng, area.lat, area.radiusM].every(Number.isFinite) && Math.abs(area.lng) <= 180 && Math.abs(area.lat) <= 90 && area.radiusM >= 50 && area.radiusM <= 20000) setAdditionalAreas(previous => [...previous, area])
    setCallArea(null)
    setDrawingArea(false)
  }
  const beginArea = () => {
    setSelectedId(null)
    setPanel(null)
    updateArea(null)
    setDrawingArea(true)
    setLayers(previous => ({ ...previous, citizens: true, references: true }))
  }
  const launchAreaCampaign = async () => {
    if (launchRef.current || drawingArea || !selectedAreaCount) return
    const ids = new Set(contactCandidateIds(citizensRef.current, selectedLocalities))
    const selected = pickWaveCitizens(citizensRef.current, 4, ids)
    if (!selected.length) {
      setBridgeNotice('No hay contactos nuevos de demo en las zonas elegidas. No se han enviado llamadas.')
      return
    }
    if (campaignMode === 'local') {
      const campaign = prepareAreaCampaign(citizensRef.current, [...ids].filter(id => !citizensRef.current.find(citizen => citizen.id === id)?.hrCall), elapsedRef.current, campaignRef.current)
      campaignRef.current = new Set(campaign.ids)
      updatePopulation(() => campaign.citizens)
      setCampaignIds(campaign.ids)
      setProtocolOn(true)
      return
    }
    launchRef.current = true
    setWaveStarting(true)
    setBridgeNotice('Consulta censal simulada: preparando los contactos de los pueblos seleccionados y sus destinos…')
    const controller = new AbortController()
    launchController.current = controller
    const waveId = crypto.randomUUID()
    const selectedIds = new Set(selected.map(citizen => citizen.id))
    updatePopulation(current => current.map(citizen => selectedIds.has(citizen.id) ? { ...citizen, hrCall: { personId: `${citizen.id}--${waveId}`, state: 'queued', resultState: 'pending', transcript: [] }, householdSize: householdSize(citizen), mobility: demoMobility(citizen) } : citizen))
    campaignRef.current = new Set([...campaignRef.current, ...selectedIds])
    setCampaignIds([...campaignRef.current])
    try {
      for (const original of selected) {
        const citizen = citizensRef.current.find(item => item.id === original.id)!
        const available = SAFE_ZONES.filter(zone => reservedPeople(citizensRef.current, zone.id) + householdSize(citizen) <= zone.capacity)
        const plan = await planCitizenRoute(token, { ...citizen, hrCall: undefined, call: { answeredAt: 0, agent: 'Preconsulta de demo', summary: '', consent: 'granted', needs: [] } }, available, forecast, marginM, controller.signal)
        if (controller.signal.aborted) return
        updatePopulation(current => current.map(item => item.id === citizen.id && item.hrCall ? { ...item, hrCall: { ...item.hrCall, zoneId: plan.route?.zoneId }, routeHoldReason: plan.citizen.routeHoldReason } : item))
      }
      const ready = citizensRef.current.filter(citizen => selectedIds.has(citizen.id) && !citizen.live && citizen.locationSource !== 'gps')
      if (!ready.length) throw new Error('Las fichas seleccionadas ahora son sesiones GPS; no se inicia la ola.')
      const people = buildWavePeople(citizensRef.current, ready)
      setRetryWavePeople(people)
      await startWave(people)
      setRetryWavePeople(null)
      if (controller.signal.aborted) return
      setBridgeNotice('Ola enviada a HappyRobot. Chats reales con vecinos sintéticos; sin llamadas telefónicas.')
      setProtocolOn(true)
    } catch {
      if (controller.signal.aborted) return
      setBridgeNotice('No se pudo confirmar el envío al puente. Se consultará el estado por si la ola fue aceptada; no se inventan respuestas.')
      updatePopulation(current => current.map(citizen => selectedIds.has(citizen.id) ? { ...citizen, status: 'assistance', routeHoldReason: 'Envío sin confirmar. Esperando estado del puente.' } : citizen))
      setProtocolOn(true)
    } finally {
      launchRef.current = false
      setWaveStarting(false)
    }
  }
  const recoverWave = async () => {
    if (launchRef.current) return
    try {
      const status = await fetchWaveStatus()
      const restored = restoreWave(citizensRef.current, status.calls, elapsedRef.current)
      const ids = restored.filter(citizen => citizen.hrCall && !citizen.live && citizen.locationSource !== 'gps').map(citizen => citizen.id)
      updatePopulation(() => restored)
      campaignRef.current = new Set([...campaignRef.current, ...ids])
      setCampaignIds([...campaignRef.current])
      setProtocolOn(false)
      setBridgeNotice(ids.length ? 'Conversaciones recuperadas sin abrir nuevos chats. Recorrido de demo en pausa; reanude para simular el traslado permitido.' : 'No hay una ola recuperable en este puente.')
    } catch {
      setBridgeNotice('No se pudo recuperar el estado del puente. No se han abierto chats.')
    }
  }
  const retryWave = async () => {
    if (!retryWavePeople || launchRef.current) return
    const people = retryWavePeople.filter(person => citizensRef.current.some(citizen => citizen.hrCall?.personId === person.agent.person_id && !citizen.live && citizen.locationSource !== 'gps'))
    if (!people.length) return
    launchRef.current = true
    setWaveStarting(true)
    try {
      await startWave(people)
      setRetryWavePeople(null)
      setBridgeNotice('Envío confirmado. Los identificadores se conservan para no duplicar conversaciones.')
      setProtocolOn(true)
    } catch {
      setBridgeNotice('El puente sigue sin confirmar el envío. No se simulan respuestas.')
    } finally {
      launchRef.current = false
      setWaveStarting(false)
    }
  }
  const pollWave = useCallback(async (signal?: AbortSignal) => {
    if (launchRef.current || !needsWavePolling(citizensRef.current)) return
    try {
      const status = await fetchWaveStatus(signal)
      if (!signal?.aborted) updatePopulation(current => applyWaveStatus(current, status.calls, elapsedRef.current))
    } catch {
      if (!signal?.aborted) setBridgeNotice('Sin conexión con la centralita. Se reintentará; las respuestas pendientes no se simulan.')
    }
  }, [updatePopulation])
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    const timer = window.setInterval(() => {
      if (busy) return
      busy = true
      void pollWave(controller.signal).finally(() => { busy = false })
    }, 2000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [pollWave])
  const retryRoutes = () => {
    for (const citizen of citizensRef.current) {
      if (campaignRef.current.has(citizen.id) && canPlanCitizen(citizen) && citizen.status === 'assistance') {
        plannedRef.current.delete(citizen.id)
        if (citizen.routeId) routesRef.current.delete(citizen.routeId)
      }
    }
    setRouteIndex(new Map(routesRef.current))
    updatePopulation(current => current.map(citizen => campaignRef.current.has(citizen.id) && canPlanCitizen(citizen) && citizen.status === 'assistance' ? { ...citizen, status: 'tracking', routeId: undefined, safeZoneId: '', routeProgressM: undefined, routePhase: undefined, routeHoldReason: undefined } : citizen))
    setProtocolOn(true)
  }
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const togglePanel = (next: 'people' | 'layers' | 'cop' | 'centers' | 'campaign') => { setSelectedId(null); setPanel((current) => current === next ? null : next) }
  const selectCenter = (id: string) => {
    const center = RESPONSE_CENTERS.find(item => item.id === id)
    if (!center) return
    setSelectedId(null)
    setSelectedCenterId(id)
    setPanel('centers')
    setFocusTarget({ lng: center.lng, lat: center.lat })
    setLayers(previous => ({ ...previous, [center.kind === 'hospital' ? 'hospitals' : center.kind === 'health' ? 'healthCenters' : 'fireStations']: true }))
  }
  const panelTitle = selected ? 'Ficha de persona' : panel === 'campaign' ? 'Campaña' : panel === 'layers' ? 'Capas del mapa' : panel === 'cop' ? 'Escenario' : panel === 'centers' ? 'Centros y coordinación' : 'Personas'
  const wavePending = needsWavePolling(citizens)
  const canLaunch = !waveStarting && !wavePending && !drawingArea && selectedAreaCount > 0
  const campaignSummary = waveStarting ? 'Buscando contactos · demo' : drawingArea ? 'Dibuja una zona adicional' : campaignRunning ? `${counts.located} ubicaciones · ${counts.moving} en camino` : recommendedEnabled ? `Zona recomendada${additionalAreas.length ? ` + ${additionalAreas.length} manual${additionalAreas.length === 1 ? '' : 'es'}` : ''}` : selectedAreaCount ? `${selectedAreaCount} zona${selectedAreaCount === 1 ? '' : 's'} manual${selectedAreaCount === 1 ? '' : 'es'}` : 'Selecciona una zona'
  const campaignContext = drawingArea ? 'Arrastra desde el centro · Esc para cancelar' : campaignMode === 'happyrobot' ? 'Censo simulado · 4 chats · consume créditos' : 'Censo y llamadas simulados · sin HappyRobot'
  const bridgeFailed = /No se|Sin conexión|No hay/.test(bridgeNotice)
  const primaryLabel = campaignRunning ? protocolOn ? 'Pausar campaña' : 'Reanudar campaña' : 'Enviar llamadas'
  const scenarioLabel = `Escenario +${horizon} min · viento hacia ${fireSettings.windTowardDeg}° a ${fireSettings.windKmh} km/h · avance base ${fireSettings.spreadMPerMin} m/min · margen ${marginM} m`
  const simulateFire = () => { setHorizon(60); setFocusTarget({ lng: INCIDENT.center[0], lat: INCIDENT.center[1], zoom: 12 }) }
  const resetFire = () => { setHorizon(0); setFireMinute(0); setFireRunning(false) }
  const toggleCampaignPause = () => { setProtocolOn(!protocolOn); setFireRunning(!protocolOn) }
  const toggleWind = () => setShowWind(value => !value)
  const closePanel = () => {
    if (panel === 'campaign') campaignButtonRef.current?.focus()
    else if (panel === 'cop') copButtonRef.current?.focus()
    else if (panel === 'centers') centersButtonRef.current?.focus()
    else if (panel === 'layers') layersButtonRef.current?.focus()
    else peopleButtonRef.current?.focus()
    setSelectedId(null)
    setPanel(null)
  }

  return (
    <div className="map-app">
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap token={token} citizens={locatedCitizens} fires={fires} zones={SAFE_ZONES} selectedId={selectedId} layers={layers} onSelect={selectCitizen} projection={projection} fireFootprint={fireFootprint} zoneExposure={zoneExposure} horizon={horizon} marginM={marginM} route={mapRoute} focusTarget={focusTarget} onCenterSelect={selectCenter} showWind={showWind} windDirection={fireSettings.windTowardDeg} windKmh={fireSettings.windKmh} callArea={callArea} additionalAreas={additionalAreas} recommendedEnabled={recommendedEnabled} areaIds={areaIds} drawingArea={drawingArea} onAreaChange={updateArea} onAreaComplete={finishArea} />
      </main>
      <header className="floating-brand">
        <strong>vigía</strong><span className="brand-divider" /><span className="place-name">Sierra de Gredos</span><span className="demo-badge">Demo</span>
      </header>
      <nav className="floating-actions" aria-label="Herramientas del mapa">
        <button type="button" aria-label={drawingArea ? 'Cancelar selección de zona' : 'Añadir zona de llamadas'} aria-pressed={drawingArea} className={drawingArea ? 'active' : ''} onClick={() => { if (drawingArea) { setDrawingArea(false); setCallArea(null) } else beginArea() }}>Zona</button>
        <button ref={peopleButtonRef} type="button" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}>Personas <small>{counts.total}</small></button>
        <button ref={copButtonRef} type="button" aria-label="Simulación del incendio" className={panel === 'cop' ? 'active' : ''} aria-expanded={panel === 'cop'} aria-controls="map-panel" onClick={() => togglePanel('cop')}>Escenario{horizon > 0 && <small>+1 h</small>}</button>
        <button ref={centersButtonRef} type="button" aria-label="Centros y coordinación" className={panel === 'centers' ? 'active' : ''} aria-expanded={panel === 'centers'} aria-controls="map-panel" onClick={() => togglePanel('centers')}>Centros</button>
        <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}>Capas</button>
      </nav>
      {(panel || selected) && <aside id="map-panel" className="floating-panel" aria-label={panelTitle}>
        <div className="floating-panel-heading"><h2>{panelTitle}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body" key={selected?.id ?? panel}>
          {selected ? <PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }}><RefugeRoutesPanel key={selected.id} citizen={selected} token={token} forecast={forecast} horizon={horizon} marginM={marginM} onRoute={setMapRoute} /></PersonDetail> : panel === 'campaign' ? (
            <div className="campaign-settings">
              <section className="settings-section">
                <h3>Canal</h3>
                <div className="segmented-control" role="group" aria-label="Canal de campaña">
                  <button type="button" aria-pressed={campaignMode === 'happyrobot'} disabled={waveStarting || campaignRunning || wavePending} onClick={() => setCampaignMode('happyrobot')}>HappyRobot</button>
                  <button type="button" aria-pressed={campaignMode === 'local'} disabled={waveStarting || campaignRunning || wavePending} onClick={() => setCampaignMode('local')}>Demo local</button>
                </div>
                <p className="fine">{campaignMode === 'happyrobot' ? 'Hasta 4 vecinos sintéticos. Chats reales que consumen créditos; no se realizan llamadas ni SMS.' : 'Simula todos los contactos de la zona seleccionada. No conecta con HappyRobot.'}</p>
              </section>
              <section className="settings-section">
                <h3>Zonas a explorar</h3>
                <label className="recommended-choice"><span><strong>Zona recomendada</strong><small>Contorno de contacto · no es una previsión de riesgo</small></span><input type="checkbox" aria-label="Incluir zona recomendada" checked={recommendedEnabled} onChange={event => setRecommendedEnabled(event.target.checked)} /></label>
                {additionalAreas.length > 0 && <ul className="selected-areas">{additionalAreas.map((area, index) => <li key={`${area.lng}-${area.lat}-${index}`}><span>Zona manual {index + 1}<small>{Math.round(area.radiusM)} m de radio</small></span><button type="button" aria-label={`Quitar zona manual ${index + 1}`} onClick={() => setAdditionalAreas(previous => previous.filter((_, i) => i !== index))}><Icon name="close" /></button></li>)}</ul>}
                <div className="text-actions"><button type="button" onClick={beginArea}>Dibujar zona</button>{additionalAreas.length > 0 && <button type="button" onClick={() => setAdditionalAreas([])}>Quitar zonas manuales</button>}</div>
                <p className="fine">{selectedLocalities.length ? `Pueblos incluidos: ${selectedLocalities.join(' · ')}.` : 'Ningún núcleo de la demo queda dentro de la selección.'}</p>
                <p className="fine">Al enviar se simula la consulta de censos. No se buscan archivos ni teléfonos reales. Las personas aparecen al compartir su ubicación.</p>
              </section>
              {campaignIds.length > 0 && <section className="settings-section">
                <h3>Actividad</h3>
                <div className="activity-counts"><span><strong>{counts.answered}/{campaignIds.length}</strong> respuestas</span><span><strong>{counts.moving}</strong> en camino</span><span><strong>{counts.silent}</strong> sin respuesta</span><span><strong>{counts.waiting}</strong> pendientes</span></div>
                <ul className="campaign-people">{citizens.filter(citizen => campaignSet.has(citizen.id)).map(citizen => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span>{citizen.name}</span><small>{STATUS_LABEL[citizen.status]}</small><span aria-hidden="true">›</span></button></li>)}</ul>
                {campaignRunning && canLaunch && <button type="button" className="cop-secondary" onClick={() => void launchAreaCampaign()}>Enviar otra ola a las zonas seleccionadas</button>}
                {counts.waiting > 0 && <button type="button" className="cop-secondary" onClick={retryRoutes}>Reintentar rutas pendientes</button>}
              </section>}
              {campaignMode === 'happyrobot' && <section className="settings-section">
                <button type="button" className="utility-action" aria-label="Recuperar última ola del puente" disabled={waveStarting || protocolOn} onClick={() => void recoverWave()}>Recuperar última ola <span aria-hidden="true">↗</span></button>
                <p className="fine">Recupera las conversaciones del puente sin abrir nuevos chats.</p>
                {bridgeNotice && <p className={`operation-feedback ${bridgeFailed ? 'is-error' : ''}`} role="status">{bridgeNotice}</p>}
                {retryWavePeople && !waveStarting && <button type="button" className="cop-secondary" onClick={() => void retryWave()}>Reintentar el envío de la misma ola</button>}
              </section>}
            </div>
          ) : panel === 'cop' ? <FireControls settings={fireSettings} fireMinute={fireMinute} fireRunning={fireRunning && !fireFinished} onFireToggle={() => setFireRunning(value => !value)} horizon={horizon} onSimulate={simulateFire} onReset={resetFire} showWind={showWind} onWind={toggleWind} marginM={marginM} forecast={forecast} onFocus={point => { setFocusTarget({ lng: point.lng, lat: point.lat }); setLayers(previous => ({ ...previous, zones: true })) }} /> : panel === 'centers' ? <ResponsePanel selectedId={selectedCenterId} onSelect={selectCenter} scenario={scenarioLabel} notices={notices} onNotices={setNotices} /> : panel === 'layers' ? (
            <div className="layer-content">
              <div className="map-key" aria-label="Leyenda"><span><i className="dot" />Sesión compartida</span><span><i className="dot answered" />Ubicación recibida</span><span>⌂ Punto de encuentro</span><span><i className="layer-symbol perimeter" />Fuego simulado</span></div>
              {LAYER_OPTIONS.map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><span className={`layer-symbol ${layer.symbol}`} aria-hidden="true" /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">Las celdas rojas son ilustrativas: no delimitan una superficie quemada confirmada. La propagación opcional no procede de un modelo predictivo.</p>
            </div>
          ) : (
            <>
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input autoFocus className="search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{[['all', 'Todas'], ['outside', 'Fuera del núcleo'], ['no_answer', 'Sin respuesta'], ['assistance', 'Revisión de ruta']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              <div className="list-summary"><span>{filtered.length} personas</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span className={`dot ${citizen.call ? 'answered' : citizen.status}`} /><span className="person-row-copy"><strong>{citizen.name}</strong><em>{citizen.locality}</em></span><span className="person-row-meta"><small>{citizen.hrCall ? 'HR' : citizen.locationSource === 'gps' ? 'GPS' : citizen.locationSource === 'simulation' ? 'SIM' : 'REF'}</small><span>{citizen.status === 'pending' ? '' : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>{locatedCitizens.length ? 'No hay coincidencias' : 'Todavía no hay personas localizadas'}</strong>{locatedCitizens.length ? <button type="button" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button> : <span>Envía las llamadas a la zona recomendada o añade otras zonas. Las ubicaciones aparecerán al recibirse, no al seleccionar el área.</span>}</div>}
            </>
          )}
        </div>
      </aside>}
      <section className="simulation-dock campaign-dock" aria-label="Campaña de llamadas por zona">
        <button type="button" className="campaign-overview" onClick={() => togglePanel('campaign')} aria-label="Ver actividad de campaña">
          <span className={`activity-indicator ${protocolOn || waveStarting ? 'running' : ''} ${bridgeFailed ? 'has-error' : ''}`} aria-hidden="true" />
          <span><strong>{campaignSummary}</strong><small>{planningCount > 0 ? `Calculando ${planningCount} rutas…` : bridgeFailed ? 'Revisar conexión · ver detalle' : campaignContext}</small></span>
        </button>
        {drawingArea ? <button type="button" className="dock-action" onClick={() => { setDrawingArea(false); updateArea(null) }}>Cancelar</button> : <button type="button" className="dock-action" aria-label={primaryLabel} disabled={waveStarting || !campaignRunning && !canLaunch} onClick={() => campaignRunning ? toggleCampaignPause() : void launchAreaCampaign()}><Icon name={campaignRunning && protocolOn ? 'pause' : 'play'} />{waveStarting ? 'Preparando' : campaignRunning ? protocolOn ? 'Pausar' : 'Reanudar' : 'Enviar llamadas'}</button>}
        <button ref={campaignButtonRef} type="button" className={`dock-options ${panel === 'campaign' ? 'active' : ''}`} aria-label="Opciones de campaña" aria-expanded={panel === 'campaign'} aria-controls="map-panel" onClick={() => togglePanel('campaign')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none" /></svg></button>
        <span className="sr-only" role="status">{bridgeNotice}</span>
      </section>
      <div className="map-disclaimer">Ejercicio de simulación · no es un aviso oficial</div>
    </div>
  )
}

function Icon({ name }: { name: 'people' | 'layers' | 'close' | 'play' | 'pause' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'people' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></> : name === 'layers' ? <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></> : name === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : name === 'play' ? <path d="m8 4 12 8-12 8Z" /> : <><path d="M8 5v14M16 5v14" /></>}</svg>
}

function PersonDetail({ citizen, events, now, onClose, children }: { citizen: Citizen; events: CallEvent[]; now: number; onClose: () => void; children: ReactNode }) {
  const [tab, setTab] = useState<'summary' | 'conversation' | 'routes'>(citizen.hrCall ? 'conversation' : 'summary')
  const locationSource = citizen.locationSource ?? 'reference'
  const reference = locationSource === 'reference' || locationSource === 'unknown'
  const stale = citizen.locationUpdatedAt !== undefined && now - citizen.locationUpdatedAt > 120_000
  return (
    <article className="person-detail">
      <button type="button" className="back-button" onClick={onClose}>‹ Todas las personas</button>
      <div className="person-title"><span className="person-avatar">{citizen.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><div><span className="eyebrow">{citizen.id} / {citizen.live ? 'SESIÓN COMPARTIDA' : 'FICHA DEMO'}</span><h2>{citizen.name}</h2></div></div>
      <div className="person-badges"><span className={`status-badge ${citizen.status}`}>{STATUS_LABEL[citizen.status]}</span>{citizen.resident === false && <span className="status-badge">Fuera del núcleo</span>}</div>
      {citizen.status === 'assistance' && <p className="need-note">{citizen.routeHoldReason}</p>}
      {!citizen.live && citizen.routeId && <p className="fine">Destino de demo: {SAFE_ZONES.find(zone => zone.id === citizen.safeZoneId)?.name}. Recorrido más corto entre las alternativas admisibles, no validado operativamente.</p>}
      <div className="person-tabs" role="group" aria-label="Secciones de la ficha"><button type="button" aria-pressed={tab === 'summary'} onClick={() => setTab('summary')}>Resumen</button>{citizen.hrCall && <button type="button" aria-pressed={tab === 'conversation'} onClick={() => setTab('conversation')}>Conversación</button>}<button type="button" disabled={!hasSharedLocation(citizen)} aria-pressed={tab === 'routes'} onClick={() => setTab('routes')}>Rutas</button></div>
      {tab === 'routes' && children}
      {tab === 'summary' && <><section className="detail-section"><h3>Localización</h3>
        <div className={`location-card ${reference || stale ? 'uncertain' : ''}`}><strong>{LOCATION_LABEL[locationSource]}</strong><span className="coordinates">{hasSharedLocation(citizen) ? `${Math.abs(citizen.lat).toFixed(5)}° ${citizen.lat >= 0 ? 'N' : 'S'} / ${Math.abs(citizen.lng).toFixed(5)}° ${citizen.lng < 0 ? 'O' : 'E'}` : 'Ubicación pendiente de recibir'}</span><span>{locationAge(citizen.locationUpdatedAt, now)}{stale ? ' · DESACTUALIZADA' : ''}</span></div>
        <dl className="detail-fields"><div><dt>Precisión reportada</dt><dd>{citizen.accuracyM !== undefined ? `${Math.round(citizen.accuracyM)} m` : 'No disponible'}</dd></div><div><dt>Origen</dt><dd>{citizen.live ? locationSource === 'gps' ? 'Navegador del ciudadano' : 'Sesión compartida' : 'Escenario sintético'}</dd></div><div><dt>Localidad / entorno</dt><dd>{citizen.locality ?? 'Sin información'}</dd></div></dl>
        <p className="detail-warning">{reference ? 'Referencia aproximada del núcleo urbano, no de una vivienda real. No confirma la presencia de esta persona.' : locationSource === 'simulation' ? 'Ubicación compartida en el guion de la demo; no es una medición GPS real.' : 'Posición reportada por el dispositivo. No valida identidad ni confirma que esté a salvo.'}</p>
      </section>
      <section className="detail-section"><h3>Última llamada</h3>
        <div className="call-summary"><p>{citizen.call?.summary ?? 'Sin llamada respondida. Los datos de registro no son declaraciones de la persona.'}</p></div>
        {citizen.call?.needs.map((need) => <p className="need-note" key={need}>{need}</p>)}
        <dl className="detail-fields"><div><dt>Agente</dt><dd>{citizen.call?.agent ?? 'No asignado'}</dd></div><div><dt>Respuesta</dt><dd>{citizen.call ? formatClock(new Date(citizen.call.answeredAt)) : 'Sin información'}</dd></div><div><dt>Comparte ubicación</dt><dd>{citizen.call ? citizen.call.consent === 'granted' ? 'Sí · demo' : 'No · demo' : 'No registrado'}</dd></div></dl>
      </section>
      </>}
      {tab === 'conversation' && citizen.hrCall && <section className="detail-section"><h3>Conversación HappyRobot</h3>
        <p className="fine">{{ queued: 'En cola', talking: 'Conversando', done: 'Chat terminado', failed: 'Fallo técnico' }[citizen.hrCall.state]} · {citizen.hrCall.outcomeApplied ? 'Resultado recibido' : citizen.hrCall.resultState === 'failed' ? 'Resultado no disponible' : 'Esperando extracción'}</p>
        {citizen.hrCall.zoneId && <p className="fine">Punto comunicado: {SAFE_ZONES.find(zone => zone.id === citizen.hrCall?.zoneId)?.name}</p>}
        {citizen.hrCall.outcomeApplied && <p className="fine">Grupo: {citizen.householdSize ?? 'sin confirmar'} personas · movilidad: {citizen.mobility ?? 'sin confirmar'}</p>}
        {citizen.hrCall.outcomeError && <p className="need-note">{citizen.hrCall.outcomeError}</p>}
        {citizen.hrCall.transcript.length ? <ol className="feed hr-transcript">{citizen.hrCall.transcript.map((line, index) => <li key={index}><time>{formatClock(new Date(line.ts))}</time><div><p><strong>{line.speaker === 'A' ? 'VIGÍA' : 'VECINO'}</strong> · {line.text}</p></div></li>)}</ol> : <p className="fine">Sin mensajes todavía.</p>}
        {citizen.hrCall.runUrl && /^https:\/\/platform\.eu\.happyrobot\.ai\//.test(citizen.hrCall.runUrl) && <a className="source-link" href={citizen.hrCall.runUrl} target="_blank" rel="noreferrer">Ver run en HappyRobot</a>}
      </section>}
      {tab === 'summary' && <><section className="detail-section"><h3>Familiares y acompañantes</h3>
        {citizen.household?.length ? citizen.household.map((member) => <div className="family-member" key={member.name}><strong>{member.name}</strong><p>{member.situation}</p><small>{member.source}</small></div>) : <p className="fine">Sin información aportada.</p>}
      </section>
      <details className="detail-section"><summary>Metadatos y trazabilidad</summary><dl className="detail-fields"><div><dt>Teléfono</dt><dd>{citizen.live ? 'No aportado' : 'Contacto ficticio'}</dd></div><div><dt>Fuente del registro</dt><dd>{citizen.live ? 'Formulario voluntario' : 'Dataset de demostración'}</dd></div></dl><ol className="feed">{events.map((event) => <li key={event.id}><time>{formatClock(new Date(event.ts))}</time><div><p>{event.detail}</p><small>{event.agent} · SIMULACIÓN</small></div></li>)}</ol></details></>}
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
