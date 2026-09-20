import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { CommandMap } from './CommandMap'
import { HappyRobotLogo, HappyRobotSymbol } from './HappyRobot'
import { Wordmark } from './Logo'

/** Lo que dura la entradilla. El velo la acompaña desde el CSS: --intro. */
const INTRO_MS = 1700
import { fetchFirmsSpain } from './firms'
import { DEFAULT_SCENARIO_ID, SCENARIOS, scenarioById } from './scenarios'
import { anchorScenario } from './scenario'
import { recommendAreas } from './risk'
import type { FireScenario } from './scenario'
import { MAX_FORECAST_MIN, PLANNED_FIRE_MIN, buildFireForecast, exposureAt, forecastGeo, routeBlocked } from './fire-model'
import type { FireSettings } from './fire-model'
import { FireControls, RefugeRoutesPanel, ResponsePanel, AlertsPanel, DispatchActions } from './CopPanels'
import type { DemoNotice } from './response'
import { SITE_EMOJI } from './response'
import type { RefugeRoute } from './routing'
import { planCitizenRoute, positionAt } from './routing'
import type { RouteIndex } from './routing'
import { detectAlerts, initialWatch, mergeAlerts } from './alerts'
import type { AlertAction, AlertWatch, CommandAlert } from './alerts'
import { UNIT_LABEL, UNIT_STATUS_LABEL, applyUnitPlan, createDispatch, createPatrolFleet, moveUnits, originsFrom, pickAvailableUnit, planUnitRoute, redirectUnit, retryUnitRoute, unitEta, unitStops } from './units'
import type { DispatchTarget, DispatchUnit, UnitKind } from './units'
import { advanceProtocol, moveEvacuees, prepareAreaCampaign, selectAreaIds } from './simulation'
import {
  CALL_STATE_LABEL, CALL_STATE_OPEN, DispatchFailed, dispatchCircle, fetchAnchor, fetchCalls, fetchRoster,
  TRIAGE_COLOR, TRIAGE_LABEL,
  postPosition, readOperatorKey, saveOperatorKey,
} from './crisisApi'
import { DEMO_ONLY, GUIDE_MODE, exitGuideMode, guideUrl } from './demoMode'
import { flushSync } from 'react-dom'
import { TourIntro } from './TourIntro'
import { TOUR_INTRO, markTourSeen, shouldShowTourIntro, startDemoTour, stopDemoTour } from './demoTour'
import type { HrSyncNote, TourHint, TourTick, TourView } from './demoTour'
import { focusPersonFromUrl, readMe } from './me'
import { HappyRobotCard } from './HappyRobotCard'
import { HR_ESCALATION_STEPS, HR_ESCALATION_UNITS, HR_REROUTE_RELEASE_STEP, HR_REROUTE_STEPS, HR_UNIT_RUN_STEPS, runStepDelayMs } from './hrModel'
import type { HrCallsPulse, HrEscalationRun, HrRerouteOutcome, HrRerouteRun, HrUnitPulse, HrUnitRun, HrView } from './hrModel'
import type { CallRun, CallStateName, DispatchResultSkip, RosterEntry } from './crisisApi'
import type { CallArea, CallEvent, Citizen, FireSpot, LocationPing, MapLayers, PaintedFire, SafeZone } from './types'
import type { FeatureCollection, Polygon } from 'geojson'

/**
 * El censo que sirve la API (`/api/roster`) sustituye al de `scenario.ts` en cuanto responde.
 *
 * Sin backend, router sigue pintando su población de Gredos y su campaña sigue siendo local:
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
    status: statusFromRoster(row),
    vulnerable: row.vulnerable,
    safeZoneId: '',
    speedKmh: 26 + (index % 7) * 4,
    callDelaySec: 1 + (index % 48) * 1.4,
    outcome: 'tracking',
    locationSource: row.location_source === 'gps' ? 'gps' : 'reference',
    // Quien comparte GPS real es una persona de verdad: nunca entra en la simulación local.
    live: row.location_source === 'gps' || undefined,
    callState: row.call_state ?? undefined,
    dialable: row.dialable,
    triage: triageFromRoster(row),
  }
}

/**
 * Qué se enseña del estado de alguien. Manda lo último que se sabe de la llamada, y lo último
 * suele ser el triaje: una observación llega aunque nadie haya rodeado un círculo en el mapa
 * —el agente puede haber llamado desde su propio workflow— y entonces no hay fila en el tablero
 * de llamadas de la que deducir nada.
 */
function statusFromRoster(row: RosterEntry): Citizen['status'] {
  if (row.status === 'no_answer') return 'no_answer'
  // Un intento que caducó sin desenlace sobre alguien a quien nadie ha llegado a contactar es,
  // para el mapa, una casa sin respuesta: rojo y escalable. La ficha conserva el matiz («sin
  // desenlace»). Si ya contestó antes, no se le quita el contacto por eso.
  if (row.call_state === 'stale' && (row.status === 'unknown' || row.status === 'unreachable')) return 'no_answer'
  if (row.triage_level && row.triage_level !== 'unknown') return 'informed'
  return row.call_state === 'answered' ? 'informed' : 'pending'
}

/** El veredicto del agente, si es que alguien ha hablado ya con esta persona. */
function triageFromRoster(row: RosterEntry): Citizen['triage'] {
  if (!row.triage_level) return undefined
  return {
    level: row.triage_level,
    reason: row.triage_reason,
    confidence: row.triage_confidence,
    at: row.triage_at,
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
    { key: 'plannedFire', name: 'Frente previsto', detail: 'Pintado por el mando · +15 min', symbol: 'fire' },
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
/** Cómo dejó el operador la tarjeta de HappyRobot: se recuerda por navegador, como el token. */
const HR_CARD_KEY = 'router.hrCard'
type HrCardState = 'open' | 'collapsed' | 'hidden'
function readHrCardState(): HrCardState {
  try {
    const saved = localStorage.getItem(HR_CARD_KEY)
    return saved === 'collapsed' || saved === 'hidden' ? saved : 'open'
  } catch {
    return 'open'
  }
}
/** Los frentes pintados como colección de polígonos cerrados, que es lo que el modelo de fuego entiende. */
function paintedFootprint(fires: PaintedFire[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: fires.filter(fire => fire.ring.length >= 3).map(fire => ({ type: 'Feature', properties: { id: fire.id }, geometry: { type: 'Polygon', coordinates: [[...fire.ring, fire.ring[0]]] } })),
  }
}
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
  // Mundo del ensayo anclado a la persona registrada desde el enlace: el escenario se desplaza entero.
  const [anchor, setAnchor] = useState<{ lng: number; lat: number } | null>(null)
  const scenario = useMemo(() => anchor ? anchorScenario(scenarioById(scenarioId), anchor) : scenarioById(scenarioId), [scenarioId, anchor])
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
  const [forceRecall, setForceRecall] = useState(false)
  const [showTourIntro, setShowTourIntro] = useState(false)
  const [touring, setTouring] = useState(false)
  const [apiRoster, setApiRoster] = useState(false)
  // Abierto desde el enlace: `?p=<id>` centra el mapa en esa persona; si además se registró en
  // este navegador, la pestaña emite su GPS.
  const [focusPersonId] = useState(() => focusPersonFromUrl())
  const [beaconId] = useState(() => { const me = readMe(); return me && me.id === focusPersonFromUrl() ? me.id : null })
  const [beaconState, setBeaconState] = useState<'starting' | 'on' | 'error' | 'denied'>('starting')
  const campaignRef = useRef<ReadonlySet<string>>(new Set())
  const campaignSet = useMemo(() => new Set(campaignIds), [campaignIds])
  const [planningCount, setPlanningCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | 'cop' | 'centers' | 'alerts' | 'campaign' | 'incidents' | null>(null)
  // La tarjeta «qué hace HappyRobot detrás»: abierta, plegada al cabecero u oculta.
  const [hrCard, setHrCard] = useState<HrCardState>(readHrCardState)
  // Run de escalada a fuerzas de seguridad: la tarjeta de HappyRobot lo dibuja paso a paso y, al
  // terminar, salen los medios. Uno a la vez: es una decisión del mando, no una cola.
  const [escalation, setEscalation] = useState<HrEscalationRun | null>(null)
  // Frentes previstos pintados a mano y el run de rerruta que disparan cuando cortan un camino.
  const [paintedFires, setPaintedFires] = useState<PaintedFire[]>([])
  const [fireStroke, setFireStroke] = useState<[number, number][] | null>(null)
  const [drawingFire, setDrawingFire] = useState(false)
  const [reroute, setReroute] = useState<HrRerouteRun | null>(null)
  useEffect(() => {
    try { localStorage.setItem(HR_CARD_KEY, hrCard) } catch { /* sin almacenamiento: no se recuerda */ }
  }, [hrCard])
  const [fireSettings, setFireSettings] = useState<FireSettings>({ windTowardDeg: INITIAL_WIND, windKmh: 20, spreadMPerMin: 8 })
  const [horizon, setHorizon] = useState(0)
  const [firePlaying, setFirePlaying] = useState(false)
  const horizonRef = useRef(0)
  const [showWind, setShowWind] = useState(false)
  const marginM = 150
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lng: number; lat: number; zoom?: number; bounds?: [[number, number], [number, number]]; maxZoom?: number } | null>(null)
  const [mapRoute, setMapRoute] = useState<RefugeRoute | null>(null)
  const [notices, setNotices] = useState<DemoNotice[]>([])
  const plannedFootprint = useMemo(() => paintedFires.length ? { footprint: paintedFootprint(paintedFires), minute: PLANNED_FIRE_MIN } : undefined, [paintedFires])
  const forecast = useMemo(() => buildFireForecast(scenario.fireCells, fireSettings, plannedFootprint), [scenario.fireCells, fireSettings, plannedFootprint])
  const projection = useMemo(() => forecastGeo(forecast, horizon), [forecast, horizon])
  const recommended = useMemo(() => recommendAreas(scenario.fireCells, forecast, fireSettings.windTowardDeg), [scenario.fireCells, forecast, fireSettings.windTowardDeg])
  const zoneExposure = useMemo(() => Object.fromEntries(scenario.safeZones.map(zone => [zone.id, exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)])), [forecast, horizon, marginM, scenario.safeZones])
  const forecastRef = useRef({ forecast, horizon, marginM })
  useEffect(() => { forecastRef.current = { forecast, horizon, marginM } }, [forecast, horizon, marginM])
  useEffect(() => { horizonRef.current = horizon }, [horizon])
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: true, plannedFire: true, thermal: false, citizens: true, references: true, zones: true, hospitals: true, healthCenters: true, fireStations: true, routes: true, callArea: true, units: true })
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
  const [planReview, setPlanReview] = useState({ windTowardDeg: INITIAL_WIND, reviewedAt: 0, revision: 1 })
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => new Set())
  const [units, setUnits] = useState<DispatchUnit[]>(() => createPatrolFleet(scenarioById(DEFAULT_SCENARIO_ID)))
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [unitsPaused, setUnitsPaused] = useState(false)
  const watchRef = useRef<AlertWatch | null>(null)
  const unitsRef = useRef<DispatchUnit[]>(units)
  const unitSeqRef = useRef(4)
  const unitFlightRef = useRef(new Map<string, { revision: number; controller: AbortController }>())
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.setTimeout(() => {
      if (shouldShowTourIntro()) setShowTourIntro(true)
    }, reduced ? 400 : INTRO_MS)
    return () => {
      window.clearTimeout(id)
      stopDemoTour()
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (touring) return // Driver gestiona su propio Escape y restaura la vista al cerrarse.
      if (drawingArea) { setDrawingArea(false); setCallArea(null); setAreaIds([]); return }
      if (drawingFire) { setDrawingFire(false); setFireStroke(null); return }
      setSelectedId(null)
      setPanel(null)
      if (hrCard !== 'hidden') { setHrCard('hidden'); return }
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
  }, [panel, drawingArea, drawingFire, hrCard, touring])
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
        // Quien viene de una rerruta no vuelve al refugio que quedó detrás del frente, y el frente
        // previsto cuenta como fuego en su camino aunque todavía no arda.
        const profile = scenario.onFoot ? 'walking' as const : 'driving' as const
        const replan = citizen.reroute && !citizen.reroute.toZoneId ? { excludeZoneIds: [citizen.reroute.fromZoneId], floorMinute: PLANNED_FIRE_MIN + 1, profile } : { profile }
        void planCitizenRoute(token, citizen, scenario.safeZones, forecast, marginM, controller.signal, fetch, replan).then(plan => {
          if (controller.signal.aborted) return
          updatePopulation(current => current.map(item => {
            if (item.id !== citizen.id || item.live || item.call?.consent !== 'granted') return item
            if (plan.route) routesRef.current.set(plan.route.id, plan.route)
            // Si venía de una rerruta, aquí se sabe por fin a dónde va: la tarjeta lo enseña.
            const rerouted = item.reroute && !item.reroute.toZoneId && plan.citizen.safeZoneId ? { ...item.reroute, toZoneId: plan.citizen.safeZoneId } : item.reroute
            return { ...item, status: plan.citizen.status, safeZoneId: plan.citizen.safeZoneId, routeId: plan.citizen.routeId, routeProgressM: plan.citizen.routeProgressM, routePhase: plan.citizen.routePhase, routeHoldReason: plan.citizen.routeHoldReason, reroute: rerouted }
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
  }, [protocolOn, token, forecast, marginM, updatePopulation, scenario.safeZones, scenario.onFoot])
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
      const risk = forecastRef.current
      const advanced = advanceProtocol(citizensRef.current, nextElapsed, [], campaignRef.current, risk)
      const ready = advanced.citizens
      const moved = moveEvacuees(ready, routesRef.current, scenario.safeZones, dt, scenario.clockScale).map((next, index) => {
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
      if (!inFlightRef.current.size && !awaitingPlan && moved.every(citizen => !campaignRef.current.has(citizen.id) || citizen.live || citizen.real || !['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))) setProtocolOn(false)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 700))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn, scenario.safeZones, scenario.clockScale])
  // El censo de la API manda sobre el de `scenario.ts` en cuanto responde, y después se
  // relee en bucle: es por donde entra el veredicto del agente cuando cuelga una llamada
  // (`POST /calls/observation` → `triage_level`). Sin este refresco el mapa se queda con la
  // foto del arranque y el color nunca cambia aunque el agente haya hablado con medio pueblo.
  useEffect(() => {
    if (DEMO_ONLY) return
    let cancelled = false
    let primera = true
    const cargar = async () => {
      const rows = await fetchRoster()
      if (cancelled || !rows || !rows.length) return
      if (primera) {
        primera = false
        const desdeApi = rows.map(citizenFromRoster)
        citizensRef.current = desdeApi
        setCitizens(desdeApi)
        setApiRoster(true)
        setLiveMode(true)
        // Abierto desde el enlace (`?p=<id>`): el mapa arranca sobre esa persona, no sobre el centroide.
        const yo = focusPersonId ? desdeApi.find((c) => c.id === focusPersonId) : undefined
        if (yo) {
          setFocusTarget({ lng: yo.lng, lat: yo.lat, zoom: 15 })
          setSelectedId(yo.id)
          setPanel(null)
          return
        }
        const centro = desdeApi.reduce(
          (acc, c) => ({ lng: acc.lng + c.lng / desdeApi.length, lat: acc.lat + c.lat / desdeApi.length }),
          { lng: 0, lat: 0 },
        )
        setFocusTarget({ ...centro, zoom: 14 })
        return
      }
      // En los refrescos solo entra el triaje. La posición la manda `/api/locations` y quien
      // comparte GPS ya está en `tracking`: pisar eso aquí haría parpadear el mapa cada cuatro
      // segundos y borraría la trayectoria que el operador está mirando.
      const porId = new Map(rows.map((row) => [row.id, row]))
      updatePopulation((current) => current.map((citizen) => {
        const fila = porId.get(citizen.id)
        const triage = fila && triageFromRoster(fila)
        if (!fila || !triage || triage.at === citizen.triage?.at) return citizen
        // Quien comparte GPS se queda en `tracking`: eso lo sabe el mapa mejor que el roster.
        const status = citizen.live ? citizen.status : statusFromRoster(fila)
        return { ...citizen, triage, callState: fila.call_state ?? citizen.callState, status }
      }))
    }
    void cargar()
    const id = window.setInterval(() => void cargar(), 4000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [updatePopulation, focusPersonId])

  // Esta pestaña es el dispositivo de la persona registrada desde el enlace: emite su GPS a la
  // API mientras siga abierta. Solo si el `?p=` coincide con quien se registró en este navegador.
  useEffect(() => {
    if (DEMO_ONLY || !beaconId || !('geolocation' in navigator)) return
    let last = 0
    let lastOk = true
    const watch = navigator.geolocation.watchPosition((position) => {
      const at = Date.now()
      if (at - last < 5000) return
      last = at
      void postPosition(beaconId, position.coords.latitude, position.coords.longitude, position.coords.accuracy).then((ok) => {
        if (ok !== lastOk) { lastOk = ok; setBeaconState(ok ? 'on' : 'error') }
        else if (ok) setBeaconState('on')
      })
    }, () => setBeaconState('denied'), { enableHighAccuracy: true, maximumAge: 4000 })
    return () => navigator.geolocation.clearWatch(watch)
  }, [beaconId])

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
            // Sin respuesta, o cinco minutos sin desenlace: para el mando es una casa a la que
            // nadie ha llegado. Rojo y escalable; la ficha conserva el matiz del tablero.
            : call.state === 'no_answer' || call.state === 'stale' ? 'no_answer'
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
    if (DEMO_ONLY) return
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
    const flights = unitFlightRef.current
    const timer = window.setInterval(() => {
      for (const [id, flight] of flights) {
        if (!unitsRef.current.some(unit => unit.id === id && unit.revision === flight.revision)) {
          flight.controller.abort()
          flights.delete(id)
        }
      }
      const pending = unitsRef.current.filter(unit => unit.status === 'requested' && !flights.has(unit.id)).slice(0, Math.max(0, 2 - flights.size))
      for (const unit of pending) {
        const controller = new AbortController()
        flights.set(unit.id, { revision: unit.revision, controller })
        void planUnitRoute(token, unit, controller.signal).then(planned => {
          if (controller.signal.aborted) return
          unitsRef.current = applyUnitPlan(unitsRef.current, planned)
          setUnits(unitsRef.current)
        }).catch(() => {
          if (controller.signal.aborted) return
          unitsRef.current = applyUnitPlan(unitsRef.current, { ...unit, status: 'hold', hold: 'No se pudo calcular el acceso. Puede reintentar la ruta.' })
          setUnits(unitsRef.current)
        }).finally(() => { if (flights.get(unit.id)?.controller === controller) flights.delete(unit.id) })
      }
    }, 250)
    return () => { window.clearInterval(timer); for (const flight of flights.values()) flight.controller.abort(); flights.clear() }
  }, [token, scenario.id])
  // El mundo se ancla a una persona real: el escenario se desplaza y la flota vuelve a nacer en él.
  const anchorWorld = (ancla: { lng: number; lat: number }) => {
    setAnchor(ancla)
    for (const flight of unitFlightRef.current.values()) flight.controller.abort()
    unitFlightRef.current.clear()
    const fleet = createPatrolFleet(anchorScenario(scenarioById(scenarioId), ancla))
    unitsRef.current = fleet
    setUnits(fleet)
    setSelectedUnitId(null)
    unitSeqRef.current = fleet.length
    routesRef.current = new Map()
    plannedRef.current.clear()
  }
  useEffect(() => {
    if (!apiRoster) return
    let cancelled = false
    void fetchAnchor().then((ancla) => { if (!cancelled && ancla) anchorWorld(ancla) })
    return () => { cancelled = true }
    // Solo al conectar la API: el ancla se fija una vez por sesión del mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRoster])
  useEffect(() => {
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1, (now - previous) / 1000)
      previous = now
      if (document.hidden || unitsPaused || !unitsRef.current.some(unit => unit.status === 'en_route' || unit.status === 'patrolling')) return
      const next = moveUnits(unitsRef.current, dt)
      unitsRef.current = next
      setUnits(next)
    }, 100)
    return () => window.clearInterval(timer)
  }, [unitsPaused])

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
  const campaignRunning = citizens.some(citizen => campaignSet.has(citizen.id) && !citizen.live && !citizen.real && ['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))
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
    setHrCard('hidden')
    setDrawingFire(false)
    setFireStroke(null)
    if (drawingArea) {
      setDrawingArea(false)
      updateArea(null)
      return
    }
    updateArea(null)
    setDrawingArea(true)
    setLayers(previous => ({ ...previous, citizens: true, references: true }))
  }
  const adoptCurrentPlan = (nextRevision = false) => setPlanReview(previous => ({
    windTowardDeg: fireSettings.windTowardDeg,
    reviewedAt: Date.now(),
    revision: previous.revision + (nextRevision && previous.reviewedAt ? 1 : 0),
  }))
  /** Modo real: el círculo va a la API y vuelve un tablero de llamadas de verdad. */
  const launchLiveCampaign = async (area: CallArea, ids: string[], reason?: string) => {
    if (drawingArea || dispatching) return
    setDispatching(true)
    setDispatchError('')
    setSelectedId(null)
    setHrCard('hidden')
    setPanel('campaign')
    try {
      const resultado = await dispatchCircle(operatorKey, area, { operator: 'puesto de mando', force: forceRecall, reason })
      setLiveBatch({ id: resultado.batch_id, skipped: resultado.skipped_detail })
      setLiveCalls(resultado.calls)
      // Híbrido de verdad: HappyRobot se queda con los teléfonos que ha hecho sonar (intento
      // vivo: en cola, marcando o llamando). El resto del círculo —vecinos sintéticos, intentos
      // simulados o bloqueados— lo anima la simulación local. Un punto con llamada real no se
      // mueve ni «contesta» hasta que su desenlace entre por el tablero: si echara a correr al
      // pulsar «Llamar» estaría fingiendo una conversación que todavía no ha ocurrido.
      const dispatchedIds = resultado.calls.map((call) => call.person_id)
      const realSet = new Set(resultado.calls.filter((call) => CALL_STATE_OPEN.includes(call.state)).map((call) => call.person_id))
      const withReal = realSet.size ? citizensRef.current.map((citizen) => realSet.has(citizen.id) ? { ...citizen, real: true } : citizen) : citizensRef.current
      const campaign = prepareAreaCampaign(withReal, ids, elapsedRef.current, campaignRef.current)
      const enrolled = new Set([...campaign.ids, ...dispatchedIds])
      campaignRef.current = enrolled
      citizensRef.current = campaign.citizens
      setCitizens(campaign.citizens)
      setCampaignIds([...enrolled])
      if (resultado.dispatched || campaign.addedIds.length) adoptCurrentPlan()
      if (campaign.addedIds.length) setProtocolOn(true)
      if (!resultado.dispatched) {
        setDispatchError('Nadie en esta zona se puede llamar ahora mismo. Mira el detalle de abajo.')
      }
    } catch (error) {
      setDispatchError(error instanceof DispatchFailed ? error.message : 'Fallo inesperado al lanzar las llamadas.')
    } finally {
      setDispatching(false)
    }
  }

  const launchCampaignIn = (area: CallArea, ids: string[], reason?: string) => {
    if (liveMode && !DEMO_ONLY) { void launchLiveCampaign(area, ids, reason); return }
    if (drawingArea) return
    const campaign = prepareAreaCampaign(citizensRef.current, ids, elapsedRef.current, campaignRef.current)
    if (!campaign.addedIds.length) return
    campaignRef.current = new Set(campaign.ids)
    citizensRef.current = campaign.citizens
    setCitizens(campaign.citizens)
    setCampaignIds(campaign.ids)
    adoptCurrentPlan()
    setProtocolOn(true)
  }
  const launchAreaCampaign = () => { if (callArea) launchCampaignIn(callArea, areaIds) }
  /** Zona recomendada: se adopta como círculo de la campaña y se lanza en el mismo gesto. */
  const launchRecommended = (kind: 'risk' | 'affected') => {
    if (!recommended || drawingArea || dispatching) return
    const area = recommended[kind]
    const ids = selectAreaIds(citizensRef.current, area)
    setCallArea(area)
    setAreaIds(ids)
    launchCampaignIn(area, ids, kind === 'risk' ? 'zona de riesgo recomendada junto al fuego' : `zona posiblemente afectada en ${recommended.affectedMinutes} min`)
  }
  const recommendedCounts = useMemo(() => recommended ? {
    risk: selectAreaIds(citizens, recommended.risk).length,
    affected: selectAreaIds(citizens, recommended.affected).length,
  } : null, [recommended, citizens])
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
  /** Crea o redirige un medio hacia el destino. Devuelve el medio, o nada si no hay hueco o el destino no vale. */
  const spawnUnit = (kind: UnitKind, target: DispatchTarget, agent = 'Operador · demo'): DispatchUnit | null => {
    const available = pickAvailableUnit(unitsRef.current, kind, target)
    if (!available && unitsRef.current.length >= MAX_UNITS) return null
    try {
      const unit = available ? redirectUnit(available, target, Date.now(), agent) : createDispatch(kind, target, Date.now(), unitSeqRef.current++, origins, agent)
      if (!available) unit.id = `${scenario.id}-${unit.id}`
      unitsRef.current = available ? unitsRef.current.map(item => item.id === unit.id ? unit : item) : [unit, ...unitsRef.current]
      setUnits(unitsRef.current)
      setLayers(previous => ({ ...previous, units: true }))
      return unit
    } catch {
      return null // destino inválido: no se crea el medio
    }
  }
  // Enviar un medio a mano arranca el run «Despacho de medio» en la tarjeta de HappyRobot: los pasos
  // avanzan con reloj y el vehículo sale en el paso de Vigía, como en la escalada. Un run a la vez.
  const [unitRun, setUnitRun] = useState<HrUnitRun | null>(null)
  const dispatchUnit = (kind: UnitKind, target: DispatchTarget) => {
    if (unitRun && unitRun.step < HR_UNIT_RUN_STEPS.length) return
    if (!pickAvailableUnit(unitsRef.current, kind, target) && unitsRef.current.length >= MAX_UNITS) return
    setUnitRun({ id: crypto.randomUUID(), kind, target: { ...target }, agent: 'Operador · demo', label: 'Petición del mando', step: 0, startedAt: Date.now() })
    setSelectedUnitId(null)
    setSelectedId(null)
    setDrawingArea(false)
    setPanel(null)
    setHrCard('open')
    setFocusTarget({ lng: target.lng, lat: target.lat, zoom: 14 })
  }
  const spawnUnitRef = useRef(spawnUnit)
  spawnUnitRef.current = spawnUnit
  useEffect(() => {
    if (!unitRun) return
    const step = HR_UNIT_RUN_STEPS[unitRun.step]
    if (!step) {
      // Terminado: el guion se queda unos segundos y después el vehículo manda solo.
      const timer = window.setTimeout(() => setUnitRun(current => current?.id === unitRun.id ? null : current), 4000)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      let unitId = unitRun.unitId
      if (step.id === 'vigia' && !unitId) {
        const unit = spawnUnitRef.current(unitRun.kind, unitRun.target, unitRun.agent)
        if (unit) {
          unitId = unit.id
          setSelectedUnitId(unit.id)
          setFocusTarget({ lng: unit.lng, lat: unit.lat, bounds: [[unit.lng, unit.lat], [unitRun.target.lng, unitRun.target.lat]] })
        }
      }
      setUnitRun(current => current?.id === unitRun.id ? { ...current, step: current.step + 1, unitId } : current)
    }, runStepDelayMs(step))
    return () => window.clearTimeout(timer)
  }, [unitRun])
  const targetFromCitizens = (ids: string[], fallback?: { lng: number; lat: number }, label = 'zona seleccionada'): DispatchTarget | null => {
    const group = ids.map(id => citizensRef.current.find(citizen => citizen.id === id)).filter((citizen): citizen is Citizen => Boolean(citizen))
    if (group.length) {
      return { lng: group.reduce((sum, citizen) => sum + citizen.lng, 0) / group.length, lat: group.reduce((sum, citizen) => sum + citizen.lat, 0) / group.length, label: group.length === 1 ? group[0].name : `${group.length} personas · ${label}`, citizenId: group[0].id }
    }
    if (fallback) return { ...fallback, label }
    return null
  }
  // --- escalada a fuerzas de seguridad -------------------------------------------------------
  /** Casas sin respuesta que aún no se han escalado, dentro del círculo si lo hay o de la campaña si no. */
  const silentIds = useMemo(() => citizens.filter(citizen => citizen.status === 'no_answer' && !citizen.escalation && (areaIds.length ? areaIds.includes(citizen.id) : campaignSet.has(citizen.id))).map(citizen => citizen.id), [citizens, areaIds, campaignSet])
  const startEscalation = (ids: string[], label: string) => {
    if (escalation || !ids.length) return
    setEscalation({ id: crypto.randomUUID(), citizenIds: ids, label, startedAt: Date.now(), step: 0, unitIds: [] })
    setHrCard('open')
  }
  /** Último paso del run: salen los medios, las casas quedan marcadas y el mapa encuadra el vuelo. */
  const completeEscalation = (run: HrEscalationRun): string[] => {
    const target = targetFromCitizens(run.citizenIds, undefined, 'sin respuesta')
    if (!target) return []
    const agent = 'HappyRobot · Escalada'
    const spawned = HR_ESCALATION_UNITS.map(kind => spawnUnit(kind, target, agent)).filter((unit): unit is DispatchUnit => Boolean(unit))
    const unitIds = spawned.map(unit => unit.id)
    const now = Date.now()
    updatePopulation(current => current.map(citizen => run.citizenIds.includes(citizen.id) ? { ...citizen, escalation: { at: now, runId: run.id, unitIds } } : citizen))
    setEvents(previous => [...previous, ...run.citizenIds.map(id => {
      const citizen = citizensRef.current.find(item => item.id === id)
      return { id: `${id}-escalated-${run.id}`, ts: now, agent, citizenId: id, name: citizen?.name ?? id, detail: `escalado · ${spawned.map(unit => unit.callSign).join(' y ') || 'sin medios libres'} en camino` }
    })])
    if (spawned.length) {
      const lngs = [target.lng, ...spawned.map(unit => unit.lng)]
      const lats = [target.lat, ...spawned.map(unit => unit.lat)]
      setFocusTarget({ lng: target.lng, lat: target.lat, bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] })
    }
    return unitIds
  }
  // El cierre lee refs y estado del turno actual; el efecto solo necesita la versión más reciente.
  const completeEscalationRef = useRef(completeEscalation)
  completeEscalationRef.current = completeEscalation
  useEffect(() => {
    if (!escalation) return
    const step = HR_ESCALATION_STEPS[escalation.step]
    // Terminado: la tarjeta enseña el resultado un rato y vuelve a su ficha. Los medios siguen en el mapa.
    if (!step) {
      const timer = window.setTimeout(() => setEscalation(current => current?.id === escalation.id ? null : current), 9000)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      const last = escalation.step === HR_ESCALATION_STEPS.length - 1
      const unitIds = last ? completeEscalationRef.current(escalation) : escalation.unitIds
      setEscalation(current => current?.id === escalation.id ? { ...current, step: current.step + 1, unitIds } : current)
    }, runStepDelayMs(step))
    return () => window.clearTimeout(timer)
  }, [escalation])
  const escalationUnits = useMemo(() => escalation ? escalation.unitIds.map(id => units.find(unit => unit.id === id)).filter((unit): unit is DispatchUnit => Boolean(unit)).map(unit => ({ callSign: unit.callSign, label: `${UNIT_LABEL[unit.kind]} · ${UNIT_STATUS_LABEL[unit.status]}`, eta: unitEta(unit) })) : [], [escalation, units])
  // --- frente previsto pintado a mano y rerruta ------------------------------------------------
  const beginFirePaint = () => {
    setSelectedId(null)
    setPanel(null)
    setHrCard('hidden')
    setDrawingArea(false)
    setFireStroke(null)
    setDrawingFire(active => !active)
    setLayers(previous => ({ ...previous, plannedFire: true, citizens: true, zones: true }))
  }
  const clearPlannedFires = () => {
    setPaintedFires([])
    setFireStroke(null)
    setDrawingFire(false)
  }
  /**
   * El trazo se cierra: entra en el modelo como fuego a +15 min y se mira a quién le corta el
   * camino. La prueba se hace contra un pronóstico hecho SOLO con el frente pintado, para que la
   * culpa sea del trazo y no del fuego real: alguien cuya ruta ya rozaba la proyección vieja no
   * se rerruta por pintar en la otra punta del mapa.
   */
  const finishFireStroke = (ring: [number, number][]) => {
    const painted: PaintedFire = { id: crypto.randomUUID(), ring, at: Date.now() }
    setPaintedFires(previous => [...previous, painted])
    setFireStroke(null)
    setDrawingFire(false)
    const paintedOnly = buildFireForecast({ type: 'FeatureCollection', features: [] }, fireSettings, { footprint: paintedFootprint([painted]), minute: PLANNED_FIRE_MIN })
    const through = Math.max(60, horizonRef.current)
    const affected = citizensRef.current.filter(citizen => {
      if (citizen.live || citizen.reroute && !citizen.reroute.toZoneId) return false
      if (!['evacuating', 'tracking', 'routing'].includes(citizen.status) || !citizen.routeId) return false
      const route = routesRef.current.get(citizen.routeId)
      const zone = scenario.safeZones.find(item => item.id === citizen.safeZoneId)
      if (!route || !zone) return false
      if (exposureAt(paintedOnly, zone.lng, zone.lat, through, marginM + zone.radiusM).level !== 'clear') return true
      // Lo que le queda de camino, desde donde está: lo andado ya no lo cruza nadie.
      const progress = citizen.routeProgressM ?? 0
      const ahead = route.coords.filter((_, index) => route.cumulative[index] >= progress)
      const remaining: [number, number][] = [[citizen.lng, citizen.lat], positionAt(route, progress), ...ahead]
      return routeBlocked(paintedOnly, remaining, through, marginM)
    })
    if (!affected.length || reroute) return
    const run: HrRerouteRun = { id: crypto.randomUUID(), citizenIds: affected.map(citizen => citizen.id), label: `${affected.length} ${affected.length === 1 ? 'persona' : 'personas'} con el camino cortado`, startedAt: Date.now(), step: 0 }
    const at = Date.now()
    // Se paran donde están mientras el run decide. Conservan la ruta vieja para que el planificador
    // no les busque salida antes de que HappyRobot «se lo diga»; se suelta en el paso del aviso.
    updatePopulation(current => current.map(citizen => run.citizenIds.includes(citizen.id)
      ? { ...citizen, status: 'routing', routeHoldReason: 'Frente previsto en su camino. HappyRobot recalcula el destino…', reroute: { at, runId: run.id, fromZoneId: citizen.safeZoneId } }
      : citizen))
    setEvents(previous => [...previous, ...affected.map(citizen => ({ id: `${citizen.id}-reroute-${run.id}`, ts: at, agent: 'HappyRobot · Rerruta', citizenId: citizen.id, name: citizen.name, detail: 'alto: frente previsto en su camino · recalculando destino' }))])
    setReroute(run)
    setHrCard('open')
    const lngs = affected.map(citizen => citizen.lng).concat(ring.map(([lng]) => lng))
    const lats = affected.map(citizen => citizen.lat).concat(ring.map(([, lat]) => lat))
    setFocusTarget({ lng: (Math.min(...lngs) + Math.max(...lngs)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2, bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] })
  }
  /** Paso del aviso: los vecinos «reciben» la ruta nueva, así que ahora sí se pide a Directions desde donde están. */
  const releaseReroute = (run: HrRerouteRun) => {
    for (const id of run.citizenIds) plannedRef.current.delete(id)
    updatePopulation(current => current.map(citizen => run.citizenIds.includes(citizen.id) && citizen.reroute?.runId === run.id
      ? { ...citizen, status: 'routing', routeId: undefined, routeProgressM: undefined, routePhase: undefined, routeHoldReason: 'Buscando la salida más rápida desde su posición actual…' }
      : citizen))
    setProtocolOn(true)
  }
  const releaseRerouteRef = useRef(releaseReroute)
  releaseRerouteRef.current = releaseReroute
  useEffect(() => {
    if (!reroute) return
    const step = HR_REROUTE_STEPS[reroute.step]
    if (!step) {
      const timer = window.setTimeout(() => setReroute(current => current?.id === reroute.id ? null : current), 10000)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      if (reroute.step + 1 === HR_REROUTE_RELEASE_STEP) releaseRerouteRef.current(reroute)
      setReroute(current => current?.id === reroute.id ? { ...current, step: current.step + 1 } : current)
    }, runStepDelayMs(step))
    return () => window.clearTimeout(timer)
  }, [reroute])
  const rerouteOutcome = useMemo(() => {
    if (!reroute) return null
    const mine = citizens.filter(citizen => reroute.citizenIds.includes(citizen.id))
    const outcomes: HrRerouteOutcome[] = scenario.safeZones.map(zone => ({ zoneId: zone.id, code: zone.code, name: zone.name, count: mine.filter(citizen => citizen.reroute?.toZoneId === zone.id).length })).filter(item => item.count > 0)
    const pending = mine.filter(citizen => !citizen.reroute?.toZoneId && citizen.status !== 'assistance').length
    const stuck = mine.filter(citizen => !citizen.reroute?.toZoneId && citizen.status === 'assistance').length
    return { run: reroute, outcomes: stuck ? [...outcomes, { zoneId: 'none', code: '—', name: 'Sin salida segura · revisión del mando', count: stuck }] : outcomes, pending }
  }, [reroute, citizens, scenario.safeZones])
  const handleAlertAction = (alert: CommandAlert, action: AlertAction) => {
    if (action === 'call-area' && alert.focus) {
      finishArea({ lng: alert.focus.lng, lat: alert.focus.lat, radiusM: alert.radiusM ?? 1200 })
      setPanel(null)
      return
    }
    if (action === 'review-routes') {
      setFilter('assistance')
      setDrawingArea(false)
      setHrCard('hidden')
      setPanel('people')
      if (alert.focus) setFocusTarget(alert.focus)
      return
    }
    const kind: UnitKind | undefined = action === 'dispatch-police' ? 'police' : action === 'dispatch-ambulance' ? 'ambulance' : action === 'dispatch-fire' ? 'fire' : undefined
    const target = kind ? targetFromCitizens(alert.citizenIds, alert.focus, alert.title) : null
    if (kind && target) dispatchUnit(kind, target)
  }
  const retryUnit = (id: string) => {
    unitsRef.current = unitsRef.current.map(unit => unit.id === id && unit.status === 'hold' ? retryUnitRoute(unit) : unit)
    setUnits(unitsRef.current)
  }
  // Pulsar un vehículo abre la tarjeta de HappyRobot en su despacho, como la escalada abre la suya.
  // Las pestañas son exclusivas: la ficha que hubiera abierta se cierra.
  const selectUnit = (id: string) => {
    const unit = unitsRef.current.find(item => item.id === id)
    if (!unit) return
    setSelectedId(null)
    setSelectedUnitId(id)
    setDrawingArea(false)
    setPanel(null)
    setHrCard('open')
    // Con ruta, se encuadra entera: el vehículo, la estela y las paradas a la vez.
    const coords = unit.route?.coords
    if (coords && coords.length > 1) {
      const lngs = coords.map(([lng]) => lng)
      const lats = coords.map(([, lat]) => lat)
      setFocusTarget({ lng: unit.lng, lat: unit.lat, bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], maxZoom: 15 })
    } else setFocusTarget({ lng: unit.lng, lat: unit.lat, zoom: 14 })
  }
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setPanel(null)
    setDrawingArea(false)
    if (id) {
      setHrCard('hidden')
      setLayers((previous) => ({ ...previous, citizens: true, references: true }))
    }
  }
  const togglePanel = (next: 'people' | 'layers' | 'cop' | 'centers' | 'alerts' | 'campaign' | 'incidents') => {
    setSelectedId(null)
    setDrawingArea(false)
    setHrCard('hidden')
    if (next === 'alerts') setReadAlertIds(new Set(alerts.map(alert => alert.id)))
    setPanel((current) => current === next ? null : next)
  }
  const toggleHappyRobot = () => {
    setSelectedId(null)
    setSelectedUnitId(null)
    setDrawingArea(false)
    setPanel(null)
    setHrCard((value) => value === 'hidden' ? 'open' : 'hidden')
  }
  const selectScenario = (id: string) => {
    if (id === scenarioId) return
    const next = scenarioById(id)
    setScenarioId(id)
    setEscalation(null)
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
    setPlanReview({ windTowardDeg: INITIAL_WIND, reviewedAt: 0, revision: 1 })
    setReadAlertIds(new Set())
    const fleet = createPatrolFleet(next)
    setUnits(fleet)
    unitsRef.current = fleet
    setSelectedUnitId(null)
    setUnitsPaused(false)
    unitSeqRef.current = fleet.length
    for (const flight of unitFlightRef.current.values()) flight.controller.abort()
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
    setDrawingArea(false)
    setHrCard('hidden')
    setPanel('centers')
    setFocusTarget({ lng: center.lng, lat: center.lat })
    setLayers(previous => ({ ...previous, [center.kind === 'hospital' ? 'hospitals' : center.kind === 'health' ? 'healthCenters' : 'fireStations']: true }))
  }
  // El pulso de la campaña para la tarjeta de HappyRobot: con la ráfaga viva manda el tablero de la
  // API; en simulación local, los vecinos del círculo. Sin campaña, no hay pulso.
  const hrCalls: HrCallsPulse | undefined = useMemo(() => {
    if (liveBatch) return { total: liveCalls.length, open: liveCalls.filter(call => CALL_STATE_OPEN.includes(call.state)).length, answered: liveCalls.filter(call => call.state === 'answered').length }
    if (!campaignIds.length) return undefined
    return { total: campaignIds.length, open: citizens.filter(citizen => campaignSet.has(citizen.id) && citizen.status === 'ringing').length, answered: counts.answered }
  }, [liveBatch, liveCalls, campaignIds.length, citizens, campaignSet, counts.answered])
  // El medio pulsado, para la tarjeta de HappyRobot: solo lo que el CECOP sabe de él de verdad.
  const hrUnit: HrUnitPulse | undefined = useMemo(() => {
    const unit = selectedUnitId ? units.find(item => item.id === selectedUnitId) : undefined
    if (!unit) return undefined
    const etaSec = unit.status === 'en_route' ? unit.etaSec ?? unit.route?.durationSec : undefined
    return {
      id: unit.id, callSign: unit.callSign, kind: unit.kind, status: unit.status, mission: unit.mission, revision: unit.revision,
      agent: unit.agent, summary: unit.summary, origin: unit.origin.name,
      target: unit.mission === 'dispatch' ? unit.target.label : undefined,
      etaMin: etaSec === undefined ? undefined : Math.max(1, Math.ceil(etaSec / 60)),
      distanceKm: unit.route && unit.mission === 'dispatch' ? unit.route.lengthM / 1000 : undefined,
      hold: unit.hold,
      escalated: citizens.some(citizen => citizen.escalation?.unitIds.includes(unit.id)),
      stops: unitStops(unit).map(stop => ({ label: stop.label, km: stop.distanceM === undefined ? undefined : stop.distanceM / 1000, etaMin: stop.etaSec === undefined ? undefined : Math.max(1, Math.ceil(stop.etaSec / 60)) })),
    }
  }, [units, selectedUnitId, citizens])
  // Con llamadas en marcha y ninguna ficha abierta, la tarjeta enseña la anatomía de la llamada.
  // Con un despacho en marcha o un vehículo pulsado y ninguna ficha abierta, manda el despacho.
  const hrView: HrView = escalation ? 'escalation' : reroute ? 'reroute' : selected ? 'person' : panel ?? (hrUnit || unitRun ? 'unit' : hrCalls && (hrCalls.open > 0 || campaignRunning) ? 'campaign' : 'overview')
  const panelTitle = selected ? 'Ficha de persona' : panel === 'incidents' ? 'Escenarios' : panel === 'layers' ? 'Capas y leyenda' : panel === 'cop' ? 'Propagación y viento' : panel === 'centers' ? 'Centros y coordinación' : panel === 'alerts' ? 'Plan operativo' : 'Personas'
  const panelKicker = selected ? 'Censo' : panel === 'incidents' ? 'Escenario' : panel === 'layers' ? 'Mapa' : panel === 'cop' ? 'Modelo' : panel === 'centers' ? 'Coordinación' : panel === 'alerts' ? 'Operación' : 'Censo'
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
  // --- recorrido guiado -----------------------------------------------------------------------
  // El recorrido lee el estado del turno actual desde el temporizador de Driver, fuera de React:
  // las refs le dan siempre la versión más reciente sin rehacer el tour en cada render.
  const [tourHint, setTourHint] = useState<TourHint | null>(null)
  const guided = scenario.guided
  const guidedIds = useMemo(() => guided ? citizens.filter(citizen => citizen.locality === guided.locality).map(citizen => citizen.id) : [], [citizens, guided])
  const tourStateRef = useRef({ escalation, reroute, unitRun, selectedId, callArea, areaIds, paintedFires, escalationUnits, rerouteOutcome, guidedIds, drawingArea, drawingFire, tourHint })
  tourStateRef.current = { escalation, reroute, unitRun, selectedId, callArea, areaIds, paintedFires, escalationUnits, rerouteOutcome, guidedIds, drawingArea, drawingFire, tourHint }
  /** Las casas del grupo guiado, con su estado de ahora mismo. */
  const guidedNow = () => citizensRef.current.filter(citizen => tourStateRef.current.guidedIds.includes(citizen.id))
  const centroid = (group: { lng: number; lat: number }[]) => group.length ? { lng: group.reduce((sum, point) => sum + point.lng, 0) / group.length, lat: group.reduce((sum, point) => sum + point.lat, 0) / group.length } : null
  const boundsOf = (points: { lng: number; lat: number }[]) => {
    if (!points.length) return null
    const lngs = points.map(point => point.lng)
    const lats = points.map(point => point.lat)
    const bounds: [[number, number], [number, number]] = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
    return { lng: (bounds[0][0] + bounds[1][0]) / 2, lat: (bounds[0][1] + bounds[1][1]) / 2, bounds }
  }
  const silentPerson = () => citizensRef.current.find(citizen => citizen.id === guided?.silentId) ?? null
  /** El refugio al que va la mayoría del grupo ahora mismo, y la ruta de quien va en cabeza. */
  const guidedRoute = () => {
    const walkers = guidedNow().filter(citizen => citizen.routeId && citizen.safeZoneId && ['tracking', 'evacuating', 'routing'].includes(citizen.status))
    const byZone = new Map<string, number>()
    for (const walker of walkers) byZone.set(walker.safeZoneId, (byZone.get(walker.safeZoneId) ?? 0) + 1)
    const zoneId = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const zone = scenario.safeZones.find(item => item.id === zoneId) ?? null
    const lead = walkers.find(walker => walker.safeZoneId === zoneId)
    const route = lead?.routeId ? routesRef.current.get(lead.routeId) ?? null : null
    return { walkers, zone, route }
  }
  /**
   * Dónde pintar el frente: por delante de quien va en cabeza (unos 350 m), sin pasarse del último
   * tramo, para que el trazo corte el camino que les queda y no queme ni la salida ni el refugio.
   */
  const paintTarget = () => {
    const { walkers, route } = guidedRoute()
    if (!route) return null
    const lead = Math.max(0, ...walkers.filter(walker => walker.routeId === route.id || walker.safeZoneId === route.zoneId).map(walker => walker.routeProgressM ?? 0))
    const along = Math.min(route.lengthM * 0.8, Math.max(route.lengthM * 0.4, lead + 350))
    const [lng, lat] = positionAt(route, along)
    return { lng, lat }
  }
  const tourHintFor = (kind: TourView['hint']): TourHint | null => {
    if (!kind || !guided) return null
    const group = guidedNow()
    const center = centroid(group)
    switch (kind) {
      case 'group':
        return center ? { kind, ...center, radiusM: guided.radiusM, label: `${group.length} casas · ${guided.locality}` } : null
      case 'draw':
        return center ? { kind, ...center, radiusM: guided.radiusM, label: 'Dibuja aquí el círculo' } : null
      case 'person': {
        const silent = silentPerson()
        return silent ? { kind, lng: silent.lng, lat: silent.lat, radiusM: 45, label: `${silent.name} · sin respuesta` } : null
      }
      case 'walkers': {
        const { walkers, zone } = guidedRoute()
        const spot = centroid(walkers) ?? center
        return spot ? { kind, ...spot, radiusM: Math.max(120, guided.radiusM * 0.7), label: zone ? `${walkers.length} en camino a ${zone.code}` : `${group.length} casas` } : null
      }
      case 'paint': {
        const target = paintTarget()
        return target ? { kind, ...target, radiusM: 150, label: 'Pinta aquí el frente' } : null
      }
    }
  }
  const focusFor = (focus: TourView['focus']) => {
    if (focus === 'fire') { setFocusTarget({ lng: scenario.incident.center[0], lat: scenario.incident.center[1], zoom: 14 }); return }
    const group = guidedNow()
    if (focus === 'group') {
      const center = centroid(group)
      if (center) setFocusTarget({ ...center, zoom: 15.4 })
      return
    }
    if (focus === 'route') {
      const { zone, route } = guidedRoute()
      const points: { lng: number; lat: number }[] = [...group.map(citizen => ({ lng: citizen.lng, lat: citizen.lat })), ...(zone ? [zone] : []), ...(route ? route.coords.map(([lng, lat]) => ({ lng, lat })) : [])]
      const box = boundsOf(points)
      if (box) setFocusTarget({ ...box, maxZoom: 15.2 })
    }
  }
  /** Lo que el visitante tiene hecho de cada paso, y qué le falta. */
  const tourTick = (stepId: string): TourTick => {
    const state = tourStateRef.current
    // HappyRobot está ejecutando un run (los nodos van pasando a la derecha): no se puede saltar.
    const runBusy = Boolean(
      (state.escalation && state.escalation.step < HR_ESCALATION_STEPS.length) ||
      (state.reroute && state.reroute.step < HR_REROUTE_STEPS.length) ||
      (state.unitRun && state.unitRun.step < HR_UNIT_RUN_STEPS.length),
    )
    const tick = tourTickFor(stepId)
    return runBusy ? { ...tick, busy: true } : tick
  }
  const tourTickFor = (stepId: string): TourTick => {
    const state = tourStateRef.current
    const group = guidedNow()
    const silent = silentPerson()
    const enrolled = group.filter(citizen => campaignRef.current.has(citizen.id))
    const answered = enrolled.filter(citizen => citizen.call).length
    const ringing = enrolled.filter(citizen => citizen.status === 'ringing').length
    const red = enrolled.filter(citizen => citizen.status === 'no_answer').length
    const callsLine = enrolled.length ? `${answered} de ${enrolled.length} han contestado · ${ringing} sonando · ${red} en rojo` : null
    switch (stepId) {
      case 'grupo':
        return { live: `${group.length} casas · ${group.filter(citizen => citizen.vulnerable).length} con alguien que no puede salir solo` }
      case 'dibuja': {
        if (state.drawingArea) return { live: 'Arrastra sobre la marca azul y suelta.' }
        if (!state.callArea) return { live: 'Esperando tu círculo.', target: '[data-demo="tool-area"]' }
        const inside = group.filter(citizen => state.areaIds.includes(citizen.id)).length
        const silentInside = Boolean(silent && state.areaIds.includes(silent.id))
        if (inside >= Math.min(group.length, 12) && silentInside) return { live: `${inside} de ${group.length} casas dentro del círculo.`, done: true }
        return { live: inside ? `Solo ${inside} de ${group.length} dentro${silentInside ? '' : ', y falta la que importa'}. Pulsa «Zona» otra vez y dibuja un círculo más grande.` : 'El círculo no toca al grupo. Pulsa «Zona» otra vez y dibuja sobre la marca azul.', target: '[data-demo="tool-area"]' }
      }
      case 'llama':
        if (enrolled.length) return { live: callsLine, done: true }
        return { live: state.callArea ? `${state.areaIds.length} personas seleccionadas. Falta pulsar «Llamar · demo».` : 'Sin círculo: vuelve al paso anterior.', target: '[data-demo="campaign-primary"]' }
      case 'motor':
        return { live: callsLine ?? 'Sin llamadas en marcha: vuelve al paso 4.' }
      case 'roja': {
        if (!silent) return { live: null }
        if (state.selectedId === silent.id) return { live: `${silent.name} · sin respuesta tras dos intentos`, done: true }
        if (silent.status !== 'no_answer') return { live: callsLine ? `${callsLine}. Su teléfono aún está sonando…` : 'Aún no ha sonado su teléfono.' }
        return { live: `${silent.name} está en rojo. Haz clic en su punto.` }
      }
      case 'escala': {
        const escalated = Boolean(silent?.escalation) || Boolean(state.escalation && silent && state.escalation.citizenIds.includes(silent.id))
        if (escalated) return { live: 'Run de escalada en marcha.', done: true }
        return state.selectedId === silent?.id ? { live: 'El botón rojo está en su ficha, a la derecha.', target: '[data-demo="escalate-person"]' } : { live: 'Abre su ficha: haz clic en el punto rojo.' }
      }
      case 'run': {
        if (state.escalation) {
          const step = HR_ESCALATION_STEPS[state.escalation.step]
          if (step) return { live: `Paso ${state.escalation.step + 1} de ${HR_ESCALATION_STEPS.length} · ${step.label}` }
          return { live: state.escalationUnits.length ? `Enviado · ${state.escalationUnits.map(unit => `${unit.callSign} ${unit.eta}`).join(' · ')} · mira el mapa` : 'Enviado' }
        }
        const done = citizensRef.current.filter(citizen => citizen.escalation).length
        return { live: done ? `${done} ${done === 1 ? 'casa' : 'casas'} con fuerzas de seguridad en camino` : 'Sin escalada: vuelve al paso anterior.' }
      }
      case 'camino': {
        const { walkers, zone } = guidedRoute()
        const moving = walkers.filter(walker => walker.status === 'evacuating').length
        const arrived = group.filter(citizen => citizen.status === 'safe').length
        if (!walkers.length) return { live: arrived ? `${arrived} ya han llegado a su refugio.` : 'Calculando las rutas desde cada puerta…' }
        return { live: `${moving} en tránsito · ${walkers.length - moving} saliendo · destino ${zone?.code ?? '?'} ${zone?.name ?? ''}` }
      }
      case 'pinta': {
        if (group.some(citizen => citizen.reroute)) return { live: 'Frente en su camino. HappyRobot recalcula.', done: true }
        // La marca de dónde pintar depende de las rutas, que pueden llegar después de abrir el paso.
        if (state.tourHint?.kind !== 'paint') {
          const spot = tourHintFor('paint')
          if (spot) setTourHint(spot)
          else return { live: 'Nadie del grupo está de camino: no hay camino que cortar.' }
        }
        if (state.drawingFire) return { live: 'Dibuja un círculo sobre la zona azul y suelta.' }
        if (state.paintedFires.length) return { live: 'Ese trazo no corta el camino de nadie. Pulsa «Frente» otra vez y pinta sobre la zona azul.', target: '[data-demo="tool-paint-fire"]' }
        return { live: 'Esperando tu frente.', target: '[data-demo="tool-paint-fire"]' }
      }
      case 'rerruta': {
        if (state.reroute) {
          const step = HR_REROUTE_STEPS[state.reroute.step]
          if (step) return { live: `Paso ${state.reroute.step + 1} de ${HR_REROUTE_STEPS.length} · ${step.label}` }
          const outcomes = state.rerouteOutcome?.outcomes ?? []
          return { live: outcomes.length ? `Destino nuevo · ${outcomes.map(item => `${item.code} · ${item.count}`).join(' · ')}` : 'Enviado · Directions calculando' }
        }
        const rerouted = group.filter(citizen => citizen.reroute?.toZoneId)
        const to = scenario.safeZones.find(zone => zone.id === rerouted[0]?.reroute?.toZoneId)
        return { live: rerouted.length ? `${rerouted.length} van ahora a ${to?.code ?? '?'} ${to?.name ?? ''}` : 'Sin rerruta: vuelve al paso anterior.' }
      }
      default:
        return { live: null }
    }
  }
  const tourTickRef = useRef(tourTick)
  tourTickRef.current = tourTick
  // Avisos breves de HappyRobot durante el recorrido: se encolan y salen de uno en uno, ~1,6 s cada uno.
  const [hrSync, setHrSync] = useState<(HrSyncNote & { id: number; done: boolean }) | null>(null)
  const hrSyncQueue = useRef<HrSyncNote[]>([])
  const hrSyncBusy = useRef(false)
  const pumpHrSync = () => {
    if (hrSyncBusy.current) return
    const note = hrSyncQueue.current.shift()
    if (!note) return
    hrSyncBusy.current = true
    const id = Date.now()
    setHrSync({ ...note, id, done: false })
    window.setTimeout(() => setHrSync(current => current?.id === id ? { ...current, done: true } : current), 1100)
    window.setTimeout(() => {
      setHrSync(current => current?.id === id ? null : current)
      hrSyncBusy.current = false
      window.setTimeout(pumpHrSync, 220)
    }, 1900)
  }
  const queueHrSync = (notes: HrSyncNote[]) => { hrSyncQueue.current.push(...notes); pumpHrSync() }
  const tourOpen = (view: TourView) => {
    setDrawingArea(false)
    setDrawingFire(false)
    setFireStroke(null)
    setHrCard(view.happyRobot ? 'open' : 'hidden')
    setSelectedId(view.person ? guided?.silentId ?? null : null)
    setPanel(view.person ? 'people' : view.panel ?? null)
    if (view.panel === 'alerts') setReadAlertIds(new Set(alerts.map(alert => alert.id)))
    setTourHint(tourHintFor(view.hint))
    focusFor(view.focus)
  }
  const tourOpenRef = useRef(tourOpen)
  tourOpenRef.current = tourOpen
  const launchTour = () => {
    // Con censo real detrás, el recorrido no corre aquí: abre el mismo despliegue con `?guia=1`,
    // que arranca en modo autocontenido sobre el escenario sintético.
    if (!DEMO_ONLY) { window.location.assign(guideUrl()); return }
    setShowTourIntro(false)
    // Al terminar, el visitante vuelve a encontrarse lo que tenía abierto. Lo que ha puesto en
    // marcha (llamadas, medios, frentes) se queda: es el punto de partida para explorar.
    const previous = { panel, selectedId, hrCard }
    setTouring(true)
    void startDemoTour({
      // flushSync: Driver mide el anclaje justo después, así que la vista tiene que estar ya en el DOM.
      open: (view: TourView) => flushSync(() => tourOpenRef.current(view)),
      tick: (stepId) => tourTickRef.current(stepId),
      sync: queueHrSync,
      close: () => {
        setTouring(false)
        hrSyncQueue.current = []
        setHrSync(null)
        setTourHint(null)
        setPanel(previous.panel)
        setSelectedId(previous.selectedId)
        setHrCard(previous.hrCard)
      },
    })
  }
  const unreadAlerts = alerts.filter(alert => !readAlertIds.has(alert.id))
  const toasts = unreadAlerts.slice(0, 3)
  const windShifted = fireSettings.windTowardDeg !== INITIAL_WIND
  const planStale = Boolean(planReview.reviewedAt) && (
    planReview.windTowardDeg !== fireSettings.windTowardDeg
    || alerts.some(alert => ['fire-spread', 'route-cut'].includes(alert.kind) && alert.ts > planReview.reviewedAt)
  )

  const brandRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`map-app${panel || selected ? ' has-panel' : ''}${hrCard !== 'hidden' ? ' has-hr' : ''}`}>
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap key={scenario.id} token={token} citizens={citizens} fires={fires} zones={scenario.safeZones} selectedId={selectedId} layers={layers} onSelect={selectCitizen} projection={projection} forecast={forecast} zoneExposure={zoneExposure} horizon={horizon} marginM={marginM} route={mapRoute} focusTarget={focusTarget} onCenterSelect={selectCenter} showWind={showWind} windDirection={fireSettings.windTowardDeg} windKmh={fireSettings.windKmh} callArea={callArea} areaIds={areaIds} drawingArea={drawingArea} onAreaChange={updateArea} onAreaComplete={finishArea} plannedFires={paintedFires} fireStroke={fireStroke} drawingFire={drawingFire} onFireStroke={setFireStroke} onFireComplete={finishFireStroke} recommended={recommended} units={units} selectedUnitId={selectedUnitId} tourHint={tourHint} onUnitSelect={selectUnit} fireCells={scenario.fireCells} centers={scenario.centers} incident={scenario.incident} />
      </main>
      <Intro brand={brandRef} />
      <header className="floating-brand">
        <div className="brand-row" ref={brandRef}><Wordmark className="brand-logo" /></div>
        <span className="brand-divider" aria-hidden="true" />
        <button ref={incidentButtonRef} type="button" data-demo="incident-trigger" className="incident-trigger" aria-label="Cambiar escenario" aria-expanded={panel === 'incidents'} aria-controls="map-panel" onClick={() => togglePanel('incidents')}>
          <span><strong>{scenario.incident.name}</strong><small><i className={`connection-dot ${!DEMO_ONLY && apiRoster ? 'connected' : ''}`} aria-hidden="true" />{DEMO_ONLY ? GUIDE_MODE ? 'Recorrido guiado · escenario sintético' : 'Demo fija · sin backend' : apiRoster ? 'API conectada' : 'Escenario de demo'} · {DEMO_ONLY || !apiRoster ? scenario.incident.area : placeName}</small></span><Icon name="chevron" />
        </button>
        {beaconId && <span className={`beacon-chip ${beaconState}`} role="status">{beaconState === 'on' ? 'Compartiendo tu ubicación' : beaconState === 'denied' ? 'Ubicación denegada' : beaconState === 'error' ? 'Sin conexión con la API' : 'Leyendo tu ubicación…'}</span>}
      </header>
      <nav className="floating-actions" data-demo="tools" aria-label="Herramientas del mapa">
        <button type="button" data-demo="tool-area" aria-label="Dibujar zona de llamadas" aria-pressed={drawingArea} className={drawingArea ? 'active' : ''} onClick={beginArea}><Icon name="zone" /><span>Zona</span></button>
        <button type="button" data-demo="tool-paint-fire" aria-label="Pintar un frente previsto" aria-pressed={drawingFire} className={`paint-fire ${drawingFire ? 'active' : ''}`} onClick={beginFirePaint}><Icon name="brush" /><span>Frente</span>{paintedFires.length > 0 && <small>{paintedFires.length}</small>}</button>
        <button ref={copButtonRef} type="button" data-demo="tool-fire" aria-label="Propagación" className={panel === 'cop' ? 'active' : ''} aria-expanded={panel === 'cop'} aria-controls="map-panel" onClick={() => togglePanel('cop')}><Icon name="fire" /><span>Propagación</span></button>
        <button ref={centersButtonRef} type="button" data-demo="tool-centers" aria-label="Centros y coordinación" className={panel === 'centers' ? 'active' : ''} aria-expanded={panel === 'centers'} aria-controls="map-panel" onClick={() => togglePanel('centers')}><Icon name="centers" /><span>Centros</span></button>
        <button ref={alertsButtonRef} type="button" data-demo="tool-alerts" aria-label={`Plan operativo · ${unreadAlerts.length} cambios nuevos`} className={panel === 'alerts' ? 'active' : ''} aria-expanded={panel === 'alerts'} aria-controls="map-panel" onClick={() => togglePanel('alerts')}><Icon name="alerts" /><span>Plan</span>{unreadAlerts.length > 0 && <small>{unreadAlerts.length}</small>}</button>
        <button ref={peopleButtonRef} type="button" data-demo="tool-people" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}><Icon name="people" /><span>Personas</span><small>{counts.total}</small></button>
        <button ref={layersButtonRef} type="button" data-demo="tool-layers" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}><Icon name="layers" /><span>Capas</span></button>
        <button type="button" data-demo="tool-happyrobot" aria-label="Qué hace HappyRobot" aria-pressed={hrCard !== 'hidden'} className={hrCard !== 'hidden' ? 'active' : ''} onClick={toggleHappyRobot}><HappyRobotSymbol className="hr-symbol" /><span>HappyRobot</span></button>
      </nav>
      {/* La memoria compartida (src/CallLog.tsx) está oculta: se monta aquí cuando vuelva a la demo. */}
      {hrSync && <div className={`hr-sync ${hrSync.done ? 'is-done' : ''}`} role="status" aria-live="polite" data-demo="hr-sync"><HappyRobotSymbol className="hr-symbol" /><span className="hr-sync-dot" aria-hidden="true" /><span className="hr-sync-node">{hrSync.node}</span><span className="hr-sync-detail">{hrSync.detail}</span></div>}
      {toasts.length > 0 && !panel && !selected && <ol className="alert-toasts" aria-live="polite">{toasts.map(alert => <li key={alert.id}><button type="button" data-demo="alert-toast" data-demo-id={alert.id} className={`alert-toast ${alert.severity}`} onClick={() => { setSelectedId(null); setDrawingArea(false); setHrCard('hidden'); setFocusTarget(alert.focus ?? null); setPanel('alerts'); setReadAlertIds(new Set(alerts.map(item => item.id))) }}>{alert.title}</button></li>)}</ol>}
      {((panel && panel !== 'campaign') || selected) && <aside id="map-panel" data-demo="panel" className="floating-panel" aria-label={panelTitle}>
        <header className="floating-panel-heading"><div className="floating-panel-title"><p className="eyebrow">{panelKicker}</p><h2>{panelTitle}</h2></div><button type="button" data-demo="panel-close" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></header>
        <div className="floating-panel-body" key={selected?.id ?? panel}>
          {panel === 'incidents' && !selected ? <div className="cop-content"><p className="panel-intro">Selecciona el escenario que quieres gestionar.</p><nav className="incident-list" aria-label="Incendios activos">{SCENARIOS.map(item => <button type="button" key={item.id} data-demo="scenario" data-demo-id={item.id} aria-pressed={item.id === scenario.id} onClick={() => selectScenario(item.id)}><span className="row-mark"><i className="incident-dot" aria-hidden="true" /></span><span><strong>{item.incident.name}</strong><small>{item.incident.area}</small></span>{item.id === scenario.id && <span className="selected-label">Activo</span>}</button>)}</nav><p className="fine">Cambiar de escenario reinicia la campaña y los medios de esta vista.</p></div> : selected ? <><PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }} onDispatch={kind => dispatchUnit(kind, { lng: selected.lng, lat: selected.lat, label: selected.name, citizenId: selected.id })} onEscalate={() => startEscalation([selected.id], selected.name)} escalating={Boolean(escalation)} unitLimit={units.length >= MAX_UNITS} zones={scenario.safeZones} units={units} /><RefugeRoutesPanel key={selected.id} citizen={selected} token={token} forecast={forecast} horizon={horizon} marginM={marginM} onRoute={setMapRoute} zones={scenario.safeZones} /></> : panel === 'cop' ? <FireControls settings={fireSettings} horizon={horizon} playing={firePlaying} onPlay={playFire} onReset={resetFire} showWind={showWind} onWind={toggleWind} onShiftWind={shiftWind} windShifted={windShifted} marginM={marginM} forecast={forecast} plannedCount={paintedFires.length} onPaintFire={beginFirePaint} onClearPlanned={clearPlannedFires} onFocus={point => { setFocusTarget({ lng: point.lng, lat: point.lat }); setLayers(previous => ({ ...previous, zones: true })) }} zones={scenario.safeZones} /> : panel === 'centers' ? <ResponsePanel key={scenario.id} selectedId={selectedCenterId} onSelect={selectCenter} scenario={scenarioLabel} notices={notices} onNotices={setNotices} centers={scenario.centers} settlements={scenario.settlements} /> : panel === 'alerts' ? <AlertsPanel alerts={alerts} units={units} selectedUnitId={selectedUnitId} unitsPaused={unitsPaused} plan={{ status: planStale ? 'stale' : planReview.reviewedAt ? 'active' : 'draft', revision: planReview.revision, reviewedAt: planReview.reviewedAt, recommendedCount: recommendedCounts?.risk ?? 0, affectedCount: recommendedCounts?.affected ?? 0, campaignCount: campaignIds.length, answered: counts.answered, silent: counts.silent, moving: counts.moving, waiting: counts.waiting, live: liveMode }} onToggleUnits={() => setUnitsPaused(value => !value)} onRetryUnit={retryUnit} onAction={handleAlertAction} onDispatch={(alert, kind) => handleAlertAction(alert, kind === 'police' ? 'dispatch-police' : kind === 'ambulance' ? 'dispatch-ambulance' : 'dispatch-fire')} onFocus={alert => { if (alert.focus) setFocusTarget(alert.focus) }} onFocusUnit={selectUnit} onAdoptPlan={() => adoptCurrentPlan(true)} onStartRecommended={() => launchRecommended('risk')} onOpenCampaign={() => { setDrawingArea(false); setHrCard('hidden'); setPanel('campaign') }} /> : panel === 'layers' ? (
            <div className="layer-content">
              <div className="map-legend" aria-label="Leyenda"><span><i className="legend-point" />Sin contactar</span><span><i className="legend-point no_answer" />Sin respuesta</span><span><i className="legend-point answered" />Llamada respondida</span><span><span className="site-emoji" aria-hidden="true">{SITE_EMOJI.meeting}</span>Punto de encuentro</span><span><Icon name="units" />Medios</span><span><i className="legend-fire" />Huella térmica</span></div>
              {layerOptions(scenario).map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><LayerMark layer={layer.key} symbol={layer.symbol} /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" data-demo="layer-toggle" data-demo-id={layer.key} aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary data-demo="firms-details">Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" data-demo="firms-toggle" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">La huella y la proyección son del escenario. No delimitan un perímetro confirmado.</p>
            </div>
          ) : (
            <>
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input className="search" data-demo="people-search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{[['all', 'Todas'], ['outside', 'Fuera del núcleo'], ['no_answer', 'Sin respuesta'], ['assistance', 'Revisión de ruta']].map(([value, label]) => <button type="button" key={value} data-demo="people-filter" data-demo-id={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              <div className="list-summary"><span>{filtered.length} {filtered.length === 1 ? 'persona' : 'personas'}</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" data-demo="person" data-demo-id={citizen.id} onClick={() => selectCitizen(citizen.id)}><span className="row-mark"><span className={`dot ${citizen.call ? 'answered' : citizen.status}`} style={citizen.triage ? { background: TRIAGE_COLOR[citizen.triage.level] } : undefined} /></span><span className="person-row-copy"><strong>{citizen.name}</strong><em>{citizen.locality}</em></span><span className="person-row-meta"><small>{citizen.locationSource === 'gps' ? 'GPS' : citizen.locationSource === 'simulation' ? 'SIM' : 'REF'}</small><span>{citizen.triage ? TRIAGE_LABEL[citizen.triage.level] : citizen.status === 'pending' ? '' : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>No hay coincidencias</strong><button type="button" data-demo="people-clear" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button></div>}
            </>
          )}
        </div>
      </aside>}
      {hrCard !== 'hidden' && <HappyRobotCard view={hrView} connected={apiRoster} live={liveMode && !DEMO_ONLY} calls={hrCalls} unit={hrUnit} unitRun={unitRun} escalation={escalation ? { run: escalation, units: escalationUnits } : null} reroute={rerouteOutcome} collapsed={hrCard === 'collapsed'} onToggleCollapse={() => setHrCard(value => value === 'collapsed' ? 'open' : 'collapsed')} onClose={() => setHrCard('hidden')} />}
      <section className={`campaign-dock ${liveMode && !DEMO_ONLY ? 'is-live' : ''}`} data-demo="campaign-dock" aria-label="Campaña de llamadas por zona">
        <button ref={campaignButtonRef} type="button" data-demo="campaign-settings" className="campaign-settings-button" aria-label="Opciones de campaña" aria-expanded={panel === 'campaign'} aria-controls="map-panel" onClick={() => togglePanel('campaign')}><Icon name="settings" /></button>
        <button type="button" data-demo="campaign-summary" className="campaign-summary" aria-label="Ver actividad de campaña" onClick={() => togglePanel('campaign')}><strong>{drawingFire ? 'Pinta el frente previsto sobre el mapa' : drawingArea ? 'Dibuja una zona en el mapa' : callArea ? `${areaIds.length} personas · ${(callArea.radiusM / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km de radio` : liveBatch ? `${liveCalls.length} llamadas en la campaña` : recommendedCounts ? `Zona de riesgo recomendada · ${recommendedCounts.risk} posibles víctimas` : 'Selecciona una zona'}</strong><span>{DEMO_ONLY || !liveMode ? 'Simulación local' : 'Llamadas reales · HappyRobot'}{dispatchError ? ' · Revisar incidencia' : planningCount ? ` · ${planningCount} rutas en cálculo` : counts.waiting ? ` · ${counts.waiting} sin ruta` : campaignRunning ? ' · Campaña en curso' : !callArea && !drawingArea && recommended && recommendedCounts ? ` · Posible afectación +${recommended.affectedMinutes} min: ${recommendedCounts.affected}` : ' · Control de llamadas'}</span></button>
        {silentIds.length > 0 && <button type="button" data-demo="campaign-escalate" className="escalate-button dock-escalate" disabled={Boolean(escalation)} onClick={() => startEscalation(silentIds, `${silentIds.length} ${silentIds.length === 1 ? 'casa' : 'casas'} sin respuesta`)} aria-label={`Enviar fuerzas de seguridad a ${silentIds.length} sin respuesta`}><Icon name="alerts" /><span>{escalation ? escalation.step >= HR_ESCALATION_STEPS.length ? 'Enviado' : 'Escalando…' : `Fuerzas · ${silentIds.length} sin respuesta`}</span></button>}
        {!liveMode && campaignRunning && <button type="button" data-demo="campaign-pause" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} /></button>}
        {!drawingArea && !callArea && recommended && recommendedCounts && <>
          <button type="button" className="cop-secondary dock-secondary" data-demo="campaign-affected" onClick={() => launchRecommended('affected')} disabled={dispatching || !recommendedCounts.affected} aria-label={`Llamar a la zona posiblemente afectada · ${recommendedCounts.affected}`}><span>Zona afectada · {recommendedCounts.affected}</span></button>
          <button type="button" className="cop-secondary dock-secondary" data-demo="campaign-draw" onClick={beginArea} aria-label="Dibujar zona de llamadas a mano"><Icon name="zone" /></button>
        </>}
        {drawingFire ? <button type="button" data-demo="paint-fire-cancel" className="cop-secondary dock-cancel" onClick={() => { setDrawingFire(false); setFireStroke(null) }}>Cancelar</button>
          : drawingArea ? <button type="button" data-demo="campaign-cancel" className="cop-secondary dock-cancel" onClick={() => { setDrawingArea(false); updateArea(null) }}>Cancelar</button>
          : callArea ? <button type="button" data-demo="campaign-primary" className="cop-primary dock-primary" onClick={launchAreaCampaign} disabled={dispatching || (liveMode && !DEMO_ONLY ? !areaIds.length : !callableCount)}><Icon name="phone" /><span>{dispatching ? 'Enviando…' : liveMode && !DEMO_ONLY ? 'Llamar · REAL' : 'Llamar · demo'}</span></button>
          : recommended && recommendedCounts ? <button type="button" data-demo="campaign-primary" className="cop-primary dock-primary" onClick={() => launchRecommended('risk')} disabled={dispatching || !recommendedCounts.risk}><Icon name="phone" /><span>{dispatching ? 'Enviando…' : `Llamar zona de riesgo · ${recommendedCounts.risk}${liveMode && !DEMO_ONLY ? ' · REAL' : ''}`}</span></button>
          : <button type="button" data-demo="campaign-primary" className="cop-primary dock-primary" onClick={beginArea}><Icon name="zone" /><span>Dibujar zona</span></button>}
      </section>
      {panel === 'campaign' && !selected && <aside id="map-panel" data-demo="panel" className="floating-panel" aria-label="Campaña de llamadas">
        <header className="floating-panel-heading"><div className="floating-panel-title"><p className="eyebrow">Llamadas</p><h2>Campaña de llamadas</h2></div><button type="button" data-demo="panel-close" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></header>
        <div className="panel-context"><span className="eyebrow">Selección</span><strong>{drawingArea ? 'Arrastra para dibujar un círculo' : callArea ? `${areaIds.length} personas · radio ${Math.round(callArea.radiusM)} m` : 'Selecciona a quién llamar'}</strong><span className={`status-pill ${liveMode && !DEMO_ONLY ? 'live' : ''}`}>{DEMO_ONLY || !liveMode ? 'Demo' : 'Real'}</span></div>
        <div className="floating-panel-body"><section className="campaign-settings">
        <p className="fine">{DEMO_ONLY ? 'Simulación local · datos fijos del escenario' : liveMode ? `HappyRobot · llamadas reales${apiRoster ? '' : ' · SIN censo de la API'}` : 'HappyRobot · simulación local'}</p>
        {DEMO_ONLY ? <p className="fine">Modo demo: 110 vecinos sintéticos, triaje simulado y evacuación en el navegador. No requiere API ni HappyRobot.</p> : <>
        <label className="row live-toggle"><input type="checkbox" data-demo="campaign-live" checked={liveMode} onChange={(event) => { setLiveMode(event.target.checked); setDispatchError('') }} />Llamar de verdad por HappyRobot</label>
        {liveMode && <label className="search-label"><span className="sr-only">Clave de operador</span><input className="search" data-demo="campaign-operator-key" type="password" autoComplete="off" placeholder="Clave de operador (HR_SHARED_SECRET)" value={operatorKey} onChange={(event) => { setOperatorKey(event.target.value); saveOperatorKey(event.target.value) }} /></label>}
        {liveMode && <label className="row live-toggle"><input type="checkbox" data-demo="campaign-force-recall" checked={forceRecall} onChange={(event) => setForceRecall(event.target.checked)} />Volver a llamar aunque ya tengan un intento</label>}
        {liveMode && <p className="fine">Se manda el círculo a la API de crisis y es ella quien dispara HappyRobot. El cerrojo <code>ALLOW_REAL_CALLS</code> sigue mandando, y los topes de lote y radio limitan la ráfaga: un punto sin teléfono aparecerá como no llamable.</p>}
        </>}
        {drawingArea && <p className="fine">Pulsa en el centro y arrastra hasta el borde. Mínimo 50 m. Escape cancela.</p>}
        <div className="campaign-actions">
          <button type="button" data-demo="campaign-launch" className="cop-primary" onClick={callArea && !drawingArea ? launchAreaCampaign : beginArea} disabled={dispatching || Boolean(callArea && !drawingArea && (liveMode && !DEMO_ONLY ? !areaIds.length : !callableCount))}>{!callArea || drawingArea ? 'Dibujar zona' : dispatching ? 'Lanzando llamadas…' : liveMode && !DEMO_ONLY ? areaIds.length ? `Llamar a ${areaIds.length} seleccionados · REAL` : 'Nadie dentro del círculo' : callableCount ? `Llamar a ${callableCount} seleccionados · demo` : 'Sin contactos nuevos'}</button>
          {(callArea || drawingArea) && <button type="button" data-demo="campaign-clear" className="cop-secondary" onClick={() => { setDrawingArea(false); updateArea(null) }}>Borrar selección</button>}
          {!liveMode && campaignRunning && <button type="button" data-demo="campaign-pause-panel" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} />{protocolOn ? 'Pausar' : 'Reanudar'}</button>}
        </div>
        {!callArea && !drawingArea && recommended && recommendedCounts && <div className="recommended-areas" role="group" aria-label="Zonas recomendadas">
          <button type="button" className="cop-secondary" data-demo="campaign-recommended-risk" onClick={() => finishArea(recommended.risk)}><strong>Zona de riesgo</strong><span>{recommendedCounts.risk} posibles víctimas · {(recommended.risk.radiusM / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km junto al fuego, a favor del viento</span></button>
          <button type="button" className="cop-secondary" data-demo="campaign-recommended-affected" onClick={() => finishArea(recommended.affected)}><strong>Posible afectación · +{recommended.affectedMinutes} min</strong><span>{recommendedCounts.affected} personas · {(recommended.affected.radiusM / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km según la previsión de propagación</span></button>
          <p className="fine">Recomendación del modelo de propagación de la demo; no es un perímetro oficial. Al elegir una, revisa la selección y pulsa llamar.</p>
        </div>}
        {!callArea && <button type="button" data-demo="campaign-preset-area" className="cop-secondary" onClick={() => finishArea({ ...(rosterCenter ?? { lng: scenario.incident.center[0], lat: scenario.incident.center[1] }), radiusM: rosterCenter ? 1000 : 3000 })}>{rosterCenter ? 'Usar todo el censo · 1 km' : 'Usar entorno del incendio · 3 km'}</button>}
        {!liveMode && callArea && !callableCount && !drawingArea && <p className="fine" role="status">No hay nuevos contactos pendientes en esta selección. Puedes dibujar otra zona; las sesiones GPS quedan excluidas.</p>}
        {dispatchError && <p className="fine" role="alert">{dispatchError}</p>}
        {liveBatch && <CallBoard calls={liveCalls} skipped={liveBatch.skipped} onSelect={selectCitizen} />}
        {!liveMode && campaignIds.length > 0 && <div className="campaign-stats" role="status"><span><strong>{counts.answered}</strong>/{campaignIds.length} respondidas</span><span>{counts.moving} en movimiento</span><span>{counts.silent} sin respuesta</span>{counts.waiting > 0 && <span>{counts.waiting} sin ruta</span>}</div>}
        {silentIds.length > 0 && <div className="escalate-section"><button type="button" data-demo="campaign-escalate-panel" className="escalate-button" disabled={Boolean(escalation)} onClick={() => startEscalation(silentIds, `${silentIds.length} ${silentIds.length === 1 ? 'casa' : 'casas'} sin respuesta`)}><Icon name="alerts" /><span>{escalation ? escalation.step >= HR_ESCALATION_STEPS.length ? 'Enviado' : 'Escalada en curso…' : `Enviar fuerzas de seguridad · ${silentIds.length} sin respuesta`}</span></button><p className="fine">Nadie descolgó en esas casas. HappyRobot lee quién vive ahí y qué flota queda, arma las rutas, llama a cada conductor con su manifiesto y avisa por SMS a quien va a recoger.</p></div>}
        {!liveMode && planningCount > 0 && <p className="fine" role="status">Calculando {planningCount} rutas individuales desde la posición de los contactos…</p>}
        {!liveMode && counts.waiting > 0 && <><p className="fine" role="status">{citizens.find(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance')?.routeHoldReason}</p><button type="button" data-demo="campaign-retry-routes" className="cop-secondary" onClick={retryRoutes}>Reintentar rutas pendientes</button></>}
        {areaIds.length > 0 && !drawingArea && <DispatchActions scope="dispatch-area" kinds={['ambulance', 'police', 'fire']} disabled={units.length >= MAX_UNITS} onDispatch={kind => {
          const target = targetFromCitizens(areaIds, callArea ?? undefined, `${areaIds.length} en zona`)
          if (target) dispatchUnit(kind, target)
        }} />}
        </section></div>
      </aside>}
      {!showTourIntro && !touring && <button type="button" className="tour-replay" data-demo="tour-start" onClick={launchTour}><Icon name="routes" />{TOUR_INTRO.replay}</button>}
      {GUIDE_MODE && !showTourIntro && !touring && <button type="button" className="tour-replay tour-exit" data-demo="tour-exit" onClick={() => exitGuideMode()}>Salir de la guía</button>}
      {showTourIntro && <TourIntro onStart={launchTour} onDismiss={() => { markTourSeen(); setShowTourIntro(false) }} />}
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
            <button type="button" data-demo="call" data-demo-id={call.person_id} onClick={() => onSelect(call.person_id)}>
              <span className="row-mark"><span className={`dot ${call.state === 'answered' ? 'answered' : call.state === 'no_answer' ? 'no_answer' : 'pending'}`} /></span>
              <span className="person-row-copy"><strong>{call.name || call.person_id}</strong><em>{call.detail || CALL_STATE_LABEL[call.state]}</em></span>
              <span className="person-row-meta"><span>{CALL_STATE_LABEL[call.state]}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <details className="source-details">
          <summary data-demo="call-skipped">{skipped.length} dentro del círculo sin llamar</summary>
          <ul className="people">{skipped.map((item) => <li key={item.person_id}><button type="button" data-demo="call-skipped-person" data-demo-id={item.person_id} onClick={() => onSelect(item.person_id)}><span className="person-row-copy"><strong>{item.name || item.person_id}</strong><em>{item.reason}</em></span></button></li>)}</ul>
        </details>
      )}
    </div>
  )
}

const ICONS = {
  zone: 'M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M12 7v10M7 12h10',
  fire: 'M13 3c1 5-4 5-2 9 1-2 3-2 4-4 3 3 4 5 4 7a7 7 0 0 1-14 0c0-4 4-6 8-12Z',
  // Pincel: el gesto de pintar un frente que aún no arde.
  brush: 'M20 3c-4 1-9 6-11 10l2 2c4-2 9-7 10-11l-1-1ZM9 13c-3 0-4 2-4 4 0 1-1 2-2 3 3 0 7-1 8-4l-2-3Z',
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

/**
 * Entradilla de apertura: al abrir, el conjunto —nuestro logotipo, un separador y el de
 * HappyRobot— aparece grande en el centro. Después el separador y HappyRobot se retiran,
 * y el nuestro sigue solo hasta su sitio en la cabecera mientras el mapa se descubre.
 *
 * Lo que se mueve es un clon medido contra el logotipo real, así que aterriza encima de
 * él sea cual sea el tamaño de la pantalla —sin repetir posiciones en el CSS ni
 * desincronizarse con los puntos de ruptura— y se desvanece al final para que el relevo
 * entre el clon y el de verdad no se note.
 *
 * La caja del clon es EXACTAMENTE la del logotipo de la cabecera: el separador y
 * HappyRobot cuelgan fuera, en posición absoluta, para no ensancharla. Así el aterrizaje
 * sigue siendo el mismo cálculo de antes, con ellos o sin ellos.
 */
function Intro({ brand }: { brand: RefObject<HTMLDivElement | null> }) {
  // Quien pide menos movimiento entra directo al mapa: la entradilla ni se monta.
  const [done, setDone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
  const clone = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const home = brand.current?.getBoundingClientRect()
    const box = clone.current
    if (!home || !box || !home.height) return setDone(true)

    box.style.left = `${home.left}px`
    box.style.top = `${home.top}px`
    box.style.width = `${home.width}px`
    box.style.height = `${home.height}px`

    // El conjunto es más ancho que su caja porque HappyRobot cuelga fuera: hay que medirlo
    // ya colocado para centrarlo entero y que no se salga por la derecha.
    const fin = box.lastElementChild?.getBoundingClientRect()
    const ancho = fin ? fin.right - home.left : home.width

    // Grande sin desbordar: 80 % del ancho, o el 24 % del alto si la pantalla es apaisada.
    // El conjunto mide casi el triple que el logotipo solo, así que manda casi siempre el ancho.
    const scale = Math.min(window.innerWidth * 0.8 / ancho, window.innerHeight * 0.24 / home.height)
    const start = `translate(${(window.innerWidth - ancho * scale) / 2 - home.left}px, ${(window.innerHeight - home.height * scale) / 2 - home.top}px) scale(${scale})`
    // Se planta, viaja, descansa ya colocado y se retira: ese descanso es el que deja
    // ver que ha aterrizado, y el fundido final tapa el relevo con el logotipo real.
    const travel = box.animate([
      { opacity: 1, transform: start, easing: 'linear', offset: 0 },
      { opacity: 1, transform: start, easing: 'cubic-bezier(.45,0,.15,1)', offset: 0.36 },
      { opacity: 1, transform: 'none', easing: 'linear', offset: 0.78 },
      { opacity: 1, transform: 'none', easing: 'linear', offset: 0.92 },
      { opacity: 0, transform: 'none', offset: 1 },
    ], { duration: INTRO_MS, fill: 'both' })

    // El separador y HappyRobot se van justo antes de que el nuestro arranque, con un
    // desplazamiento mínimo a la izquierda para que parezca que le ceden el paso.
    const salida = [
      { opacity: 1, transform: 'none', offset: 0 },
      { opacity: 1, transform: 'none', offset: 0.24 },
      { opacity: 0, transform: 'translateX(-8px)', offset: 0.38 },
      { opacity: 0, transform: 'translateX(-8px)', offset: 1 },
    ]
    const acompanan = [...box.querySelectorAll('[data-sale]')].map((el) =>
      el.animate(salida, { duration: INTRO_MS, fill: 'both', easing: 'ease' }),
    )

    travel.finished.then(() => setDone(true), () => {})
    return () => [travel, ...acompanan].forEach((a) => a.cancel())
  }, [brand])

  if (done) return null
  return (
    <>
      <div className="intro-veil" aria-hidden="true" />
      <div className="intro-logo" ref={clone} aria-hidden="true">
        <Wordmark />
        <span className="intro-sep" data-sale />
        <span className="intro-partner" data-sale><HappyRobotLogo /></span>
      </div>
    </>
  )
}

function LayerMark({ layer, symbol }: { layer: keyof MapLayers; symbol: keyof typeof ICONS }) {
  const mark = LAYER_MARK[layer]
  if (mark) return <span className="site-emoji" aria-hidden="true">{SITE_EMOJI[mark]}</span>
  return <Icon name={symbol} />
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>
}

function PersonDetail({ citizen, events, now, onClose, onDispatch, onEscalate, escalating, unitLimit, zones, units }: { citizen: Citizen; events: CallEvent[]; now: number; onClose: () => void; onDispatch: (kind: UnitKind) => void; onEscalate: () => void; escalating: boolean; unitLimit: boolean; zones: SafeZone[]; units: DispatchUnit[] }) {
  const locationSource = citizen.locationSource ?? 'reference'
  const reference = locationSource === 'reference' || locationSource === 'unknown'
  const stale = citizen.locationUpdatedAt !== undefined && now - citizen.locationUpdatedAt > 120_000
  return (
    <article className="person-detail">
      <button type="button" data-demo="person-back" className="back-button" onClick={onClose}>‹ Todas las personas</button>
      <div className="person-title"><span className="person-avatar">{citizen.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><div><span className="eyebrow">{citizen.locality ?? citizen.id}</span><h2>{citizen.name}</h2></div></div>
      <div className="person-badges"><span className={`status-badge ${citizen.status}`}>{STATUS_LABEL[citizen.status]}</span>{citizen.resident === false && <span className="status-badge">Fuera del núcleo</span>}</div>
      {citizen.status === 'assistance' && <p className="need-note">{citizen.routeHoldReason}</p>}
      {citizen.reroute && citizen.status !== 'safe' && <div className="reroute-done" data-demo="person-reroute"><strong>{citizen.reroute.toZoneId ? 'Destino cambiado por un frente previsto' : 'Parado: frente previsto en su camino'}</strong><span>{citizen.reroute.toZoneId ? `${zones.find(zone => zone.id === citizen.reroute?.fromZoneId)?.code ?? '?'} → ${zones.find(zone => zone.id === citizen.reroute?.toZoneId)?.code ?? '?'} · ${zones.find(zone => zone.id === citizen.reroute?.toZoneId)?.name ?? ''}` : citizen.routeHoldReason ?? 'HappyRobot recalcula la salida desde su posición actual.'}</span><small>Desde {formatClock(new Date(citizen.reroute.at))} · ruta nueva desde donde estaba, no desde casa</small></div>}
      {citizen.status === 'no_answer' && (
        <section className="detail-section escalate-section" aria-label="Escalada a fuerzas de seguridad">
          {citizen.escalation
            ? <div className="escalate-done"><strong>Fuerzas de seguridad en camino</strong><span>{citizen.escalation.unitIds.map(id => units.find(unit => unit.id === id)).filter((unit): unit is DispatchUnit => Boolean(unit)).map(unit => `${unit.callSign} · ${UNIT_LABEL[unit.kind]}${unitEta(unit) ? ` · ${unitEta(unit)}` : ''}`).join('  ·  ') || 'Escalado · sin medios libres'}</span><small>Desde {formatClock(new Date(citizen.escalation.at))} · HappyRobot avisó a Guardia Civil y 1-1-2</small></div>
            : <>
              <button type="button" data-demo="escalate-person" className="escalate-button" disabled={escalating} onClick={onEscalate}><Icon name="alerts" /><span>{escalating ? 'Escalada en curso…' : 'Enviar fuerzas de seguridad'}</span></button>
              <p className="fine">Nadie ha descolgado. HappyRobot busca un vehículo con plazas libres, llama al conductor con el manifiesto y manda un medio a su puerta.</p>
            </>}
        </section>
      )}
      <section className="detail-section" data-demo="person-dispatch"><h3>Enviar medio</h3>
        <DispatchActions scope="dispatch-person" kinds={['ambulance', 'police', 'fire']} disabled={unitLimit} onDispatch={onDispatch} />
        {unitLimit && <p className="fine">Límite de {MAX_UNITS} envíos.</p>}
      </section>
      {!citizen.live && citizen.routeId && <p className="fine">Destino: {zones.find(zone => zone.id === citizen.safeZoneId)?.name}</p>}
      <section className="detail-section"><h3>Localización</h3>
        <div className={`location-card ${reference || stale ? 'uncertain' : ''}`}><strong>{LOCATION_LABEL[locationSource]}</strong><span className="coordinates">{Math.abs(citizen.lat).toFixed(5)}° {citizen.lat >= 0 ? 'N' : 'S'} / {Math.abs(citizen.lng).toFixed(5)}° {citizen.lng < 0 ? 'O' : 'E'}</span><span>{locationAge(citizen.locationUpdatedAt, now)}{stale ? ' · desactualizada' : ''}</span></div>
        <dl className="detail-fields"><div><dt>Precisión</dt><dd>{citizen.accuracyM !== undefined ? `${Math.round(citizen.accuracyM)} m` : 'No disponible'}</dd></div><div><dt>Origen</dt><dd>{citizen.live ? locationSource === 'gps' ? 'Dispositivo' : 'Sesión compartida' : 'Registro'}</dd></div></dl>
      </section>
      {citizen.triage && (
        <section className="detail-section"><h3>Triaje del agente</h3>
          {/* Lo único de esta ficha que sale de haber hablado con la persona. El resto —posición,
              exposición, ruta— lo calcula la geometría, y por eso puede estar equivocado. */}
          <div className="location-card" style={{ borderColor: TRIAGE_COLOR[citizen.triage.level] }}>
            <strong style={{ color: TRIAGE_COLOR[citizen.triage.level] }}>{TRIAGE_LABEL[citizen.triage.level]}</strong>
            <span>{citizen.triage.reason || 'El agente no dejó motivo.'}</span>
            <span>{citizen.triage.at ? `Cerrado ${formatClock(new Date(citizen.triage.at))}` : ''}{citizen.triage.confidence ? ` · confianza ${citizen.triage.confidence}` : ''}</span>
          </div>
        </section>
      )}
      <section className="detail-section"><h3>Última llamada</h3>
        <div className="call-summary"><p>{citizen.call?.summary ?? (citizen.callState ? CALL_STATE_LABEL[citizen.callState] : 'Sin llamada registrada')}</p></div>
        {citizen.call?.needs.map((need) => <p className="need-note" key={need}>{need}</p>)}
        <dl className="detail-fields"><div><dt>Agente</dt><dd>{citizen.call?.agent ?? 'No asignado'}</dd></div><div><dt>Respuesta</dt><dd>{citizen.call ? formatClock(new Date(citizen.call.answeredAt)) : '—'}</dd></div><div><dt>Comparte ubicación</dt><dd>{citizen.call ? citizen.call.consent === 'granted' ? 'Sí' : 'No' : '—'}</dd></div></dl>
      </section>
      {citizen.household?.length ? <section className="detail-section"><h3>Acompañantes</h3>{citizen.household.map((member) => <div className="family-member" key={member.name}><strong>{member.name}</strong><p>{member.situation}</p></div>)}</section> : null}
      {events.length > 0 && <details className="detail-section"><summary data-demo="person-log">Registro</summary><ol className="feed">{events.map((event) => <li key={event.id}><time>{formatClock(new Date(event.ts))}</time><div><p>{event.detail}</p><small>{event.agent}</small></div></li>)}</ol></details>}
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
