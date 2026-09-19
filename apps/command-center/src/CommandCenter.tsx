import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { INITIAL_CITIZENS, SAFE_ZONES, SCENARIO_FIRES, SCENARIO_FIRE_CELLS, INCIDENT } from './scenario'
import { buildFireForecast, exposureAt, forecastGeo, routeBlocked } from './fire-model'
import type { FireSettings } from './fire-model'
import { FireControls, RefugeRoutesPanel, ResponsePanel } from './CopPanels'
import { RESPONSE_CENTERS } from './response'
import type { DemoNotice } from './response'
import type { RefugeRoute } from './routing'
import { planCitizenRoute } from './routing'
import type { RouteIndex } from './routing'
import { advanceProtocol, moveEvacuees, prepareAreaCampaign, selectAreaIds } from './simulation'
import {
  CALL_STATE_LABEL, CALL_STATE_OPEN, DispatchFailed, dispatchCircle, fetchCalls, fetchRoster,
  readOperatorKey, saveOperatorKey,
} from './crisisApi'
import type { CallRun, CallStateName, DispatchResultSkip, RosterEntry } from './crisisApi'
import type { CallArea, CallEvent, Citizen, FireSpot, LocationPing, MapLayers } from './types'

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
  informed: 'Aviso recibido', tracking: 'Ubicación compartida', evacuating: 'En tránsito · sim.',
  safe: 'En punto de encuentro · sim.', refused: 'No comparte ubicación', assistance: 'Ruta pendiente de revisión', routing: 'Calculando ruta individual',
}
const LOCATION_LABEL = {
  reference: 'Referencia residencial aproximada', simulation: 'Ubicación compartida · demo',
  gps: 'Geolocalización del dispositivo', unknown: 'Origen no especificado',
}
const LAYER_OPTIONS: { key: keyof MapLayers; name: string; detail: string; symbol: string }[] = [
  { key: 'perimeter', name: 'Huella térmica', detail: 'Manchas de celdas · escenario simulado', symbol: 'perimeter' },
  { key: 'spread', name: 'Propagación temporal', detail: 'Escenario configurable · no es un pronóstico', symbol: 'spread' },
  { key: 'routes', name: 'Ruta seleccionada', detail: 'Comparación por tiempo · filtro de exposición', symbol: 'spread' },
  { key: 'hospitals', name: 'Hospitales', detail: 'Posición de demo · centro real en Talavera', symbol: 'zone' },
  { key: 'healthCenters', name: 'Centros de salud', detail: 'No equivalen a hospitales', symbol: 'zone' },
  { key: 'fireStations', name: 'Bomberos', detail: 'Posición de demo · sin despliegues reales', symbol: 'zone' },
  { key: 'thermal', name: 'Detecciones térmicas', detail: 'Focos puntuales, no perímetros', symbol: 'thermal' },
  { key: 'citizens', name: 'Personas', detail: 'Ubicación y estado de contacto', symbol: 'person' },
  { key: 'references', name: 'Referencias residenciales', detail: 'No confirman presencia', symbol: 'reference' },
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
  const [apiRoster, setApiRoster] = useState(false)
  const campaignRef = useRef<ReadonlySet<string>>(new Set())
  const campaignSet = useMemo(() => new Set(campaignIds), [campaignIds])
  const [planningCount, setPlanningCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | 'cop' | 'centers' | null>(null)
  const [fireSettings] = useState<FireSettings>({ windTowardDeg: 225, windKmh: 20, spreadMPerMin: 5 })
  const [horizon, setHorizon] = useState(0)
  const [showWind, setShowWind] = useState(false)
  const marginM = 150
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ lng: number; lat: number; zoom?: number } | null>(null)
  const [mapRoute, setMapRoute] = useState<RefugeRoute | null>(null)
  const [notices, setNotices] = useState<DemoNotice[]>([])
  const forecast = useMemo(() => buildFireForecast(SCENARIO_FIRE_CELLS, fireSettings), [fireSettings])
  const projection = useMemo(() => forecastGeo(forecast, horizon), [forecast, horizon])
  const zoneExposure = useMemo(() => Object.fromEntries(SAFE_ZONES.map(zone => [zone.id, exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)])), [forecast, horizon, marginM])
  const forecastRef = useRef({ forecast, horizon, marginM })
  useEffect(() => { forecastRef.current = { forecast, horizon, marginM } }, [forecast, horizon, marginM])
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: true, thermal: false, citizens: true, references: true, zones: true, hospitals: true, healthCenters: true, fireStations: true, routes: true })
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
  useEffect(() => { citizensRef.current = citizens }, [citizens])

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
        void planCitizenRoute(token, citizen, SAFE_ZONES, forecast, marginM, controller.signal).then(plan => {
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
  }, [protocolOn, token, forecast, marginM, updatePopulation])
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
        return !hasRoad || exposed || routeBlocked(risk.forecast, [[previous.lng, previous.lat], [next.lng, next.lat]], 0, risk.marginM) ? { ...previous, status: 'assistance' as const, routeHoldReason: 'Recorrido detenido por exposición o falta de ruta. Pendiente de revisión del mando.' } : next
      })
      citizensRef.current = moved
      setCitizens(moved)
      const awaitingPlan = moved.some(citizen => campaignRef.current.has(citizen.id) && !citizen.live && citizen.call?.consent === 'granted' && !citizen.routeId && !plannedRef.current.has(citizen.id))
      if (!inFlightRef.current.size && !awaitingPlan && moved.every(citizen => !campaignRef.current.has(citizen.id) || citizen.live || !['pending', 'ringing', 'tracking', 'routing', 'evacuating'].includes(citizen.status))) setProtocolOn(false)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 700))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn])
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

  const fires = useMemo(() => showFirms ? [...SCENARIO_FIRES, ...firms] : SCENARIO_FIRES, [showFirms, firms])
  /** Centro del censo que sirve la API. `null` mientras Vigía siga con su población local. */
  const rosterCenter = useMemo(() => {
    if (!apiRoster || !citizens.length) return null
    return {
      lng: citizens.reduce((total, citizen) => total + citizen.lng, 0) / citizens.length,
      lat: citizens.reduce((total, citizen) => total + citizen.lat, 0) / citizens.length,
    }
  }, [apiRoster, citizens])
  /** El rótulo de la cabecera miente si el censo ya no es el de Gredos. */
  const placeName = useMemo(() => {
    if (!apiRoster) return 'Sierra de Gredos'
    const porLocalidad = new Map<string, number>()
    for (const citizen of citizens) {
      const clave = citizen.locality ?? ''
      if (clave) porLocalidad.set(clave, (porLocalidad.get(clave) ?? 0) + 1)
    }
    return [...porLocalidad.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Escenario de la API'
  }, [apiRoster, citizens])
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
      const resultado = await dispatchCircle(operatorKey, callArea, { operator: 'puesto de mando', force: forceRecall })
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
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const togglePanel = (next: 'people' | 'layers' | 'cop' | 'centers') => { setSelectedId(null); setPanel((current) => current === next ? null : next) }
  const selectCenter = (id: string) => {
    const center = RESPONSE_CENTERS.find(item => item.id === id)
    if (!center) return
    setSelectedId(null)
    setSelectedCenterId(id)
    setPanel('centers')
    setFocusTarget({ lng: center.lng, lat: center.lat })
    setLayers(previous => ({ ...previous, [center.kind === 'hospital' ? 'hospitals' : center.kind === 'health' ? 'healthCenters' : 'fireStations']: true }))
  }
  const panelTitle = selected ? 'Ficha de persona' : panel === 'layers' ? 'Capas del mapa' : panel === 'cop' ? 'Simulación del incendio' : panel === 'centers' ? 'Centros y coordinación' : 'Personas'
  const scenarioLabel = `Escenario +${horizon} min · viento hacia ${fireSettings.windTowardDeg}° a ${fireSettings.windKmh} km/h · avance base ${fireSettings.spreadMPerMin} m/min · margen ${marginM} m`
  const simulateFire = () => { setHorizon(60); setLayers(previous => ({ ...previous, spread: true })); setFocusTarget({ lng: INCIDENT.center[0], lat: INCIDENT.center[1], zoom: 12 }) }
  const resetFire = () => setHorizon(0)
  const toggleWind = () => setShowWind(value => !value)
  const closePanel = () => {
    if (panel === 'cop') copButtonRef.current?.focus()
    else if (panel === 'centers') centersButtonRef.current?.focus()
    else if (panel === 'layers') layersButtonRef.current?.focus()
    else peopleButtonRef.current?.focus()
    setSelectedId(null)
    setPanel(null)
  }

  return (
    <div className="map-app">
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap token={token} citizens={citizens} fires={fires} zones={SAFE_ZONES} selectedId={selectedId} layers={layers} onSelect={selectCitizen} projection={projection} zoneExposure={zoneExposure} horizon={horizon} marginM={marginM} route={mapRoute} focusTarget={focusTarget} onCenterSelect={selectCenter} showWind={showWind} windDirection={fireSettings.windTowardDeg} windKmh={fireSettings.windKmh} callArea={callArea} areaIds={areaIds} drawingArea={drawingArea} onAreaChange={updateArea} onAreaComplete={finishArea} />
      </main>
      <header className="floating-brand">
        <span className="brand-symbol" aria-hidden="true">V</span><strong>vigía</strong><span className="brand-divider" /><span className="place-name">{placeName}</span><span className="demo-badge">DEMO</span>
      </header>
      <nav className="floating-actions" aria-label="Herramientas del mapa">
        <button type="button" aria-label="Dibujar zona de llamadas" aria-pressed={drawingArea} className={drawingArea ? 'active' : ''} onClick={beginArea}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8" strokeDasharray="3 2" /><path d="M12 8v8M8 12h8" /></svg><span>Zona</span></button>
        <button ref={copButtonRef} type="button" aria-label="Simulación del incendio" className={panel === 'cop' ? 'active' : ''} aria-expanded={panel === 'cop'} aria-controls="map-panel" onClick={() => togglePanel('cop')}><Icon name="layers" /><span>Propagación</span></button>
        <button ref={centersButtonRef} type="button" aria-label="Centros y coordinación" className={panel === 'centers' ? 'active' : ''} aria-expanded={panel === 'centers'} aria-controls="map-panel" onClick={() => togglePanel('centers')}><Icon name="people" /><span>Centros</span></button>
        <button ref={peopleButtonRef} type="button" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}><Icon name="people" /><span>Personas</span><small>{counts.total}</small></button>
        <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}><Icon name="layers" /><span>Capas</span></button>
      </nav>
      <div className="minimal-legend" aria-label="Leyenda"><span><i className="legend-point" />Sin respuesta</span><span><i className="legend-point answered" />Llamada respondida</span><span><i className="legend-zone" />Punto de encuentro</span><span><i className="legend-fire" />Huella térmica · demo</span></div>
      <section className="forecast-summary" aria-label="Viento y simulación rápida"><div className="wind-heading"><span><span className="eyebrow">VIENTO · DEMO</span><strong>Hacia SO · {fireSettings.windKmh} km/h</strong></span><button type="button" className="wind-toggle" role="switch" aria-label="Mostrar viento en el mapa" aria-checked={showWind} onClick={toggleWind}>{showWind ? 'ON' : 'OFF'}</button></div><button type="button" className="cop-primary" onClick={simulateFire}>Simular incendio dentro de 1 hora</button>{horizon > 0 && <button type="button" className="cop-secondary" onClick={resetFire}>Volver al incendio inicial</button>}<small role="status">{horizon ? 'Posible extensión a +1 h · no es un pronóstico' : 'Incendio inicial · viento prefijado del escenario'}</small></section>
      {(panel || selected) && <aside id="map-panel" className="floating-panel" aria-label={panelTitle}>
        <div className="floating-panel-heading"><h2>{panelTitle}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body" key={selected?.id ?? panel}>
          {selected ? <><PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }} /><RefugeRoutesPanel key={selected.id} citizen={selected} token={token} forecast={forecast} horizon={horizon} marginM={marginM} onRoute={setMapRoute} /></> : panel === 'cop' ? <FireControls settings={fireSettings} horizon={horizon} onSimulate={simulateFire} onReset={resetFire} showWind={showWind} onWind={toggleWind} marginM={marginM} forecast={forecast} onFocus={point => { setFocusTarget({ lng: point.lng, lat: point.lat }); setLayers(previous => ({ ...previous, zones: true })) }} /> : panel === 'centers' ? <ResponsePanel selectedId={selectedCenterId} onSelect={selectCenter} scenario={scenarioLabel} notices={notices} onNotices={setNotices} /> : panel === 'layers' ? (
            <div className="layer-content">
              {LAYER_OPTIONS.map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><span className={`layer-symbol ${layer.symbol}`} aria-hidden="true" /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">Las celdas rojas son ilustrativas: no delimitan una superficie quemada confirmada. La propagación opcional no procede de un modelo predictivo.</p>
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
        {liveMode && <label className="row live-toggle"><input type="checkbox" checked={forceRecall} onChange={(event) => setForceRecall(event.target.checked)} />Volver a llamar aunque ya tengan un intento</label>}
        {liveMode && <p className="fine">Se manda el círculo a la API de crisis y es ella quien dispara HappyRobot. Los cerrojos <code>ALLOW_REAL_CALLS</code> y <code>CALL_ALLOWLIST</code> siguen mandando: un punto que no esté en la lista aparecerá como bloqueado.</p>}
        {drawingArea && <p className="fine">Pulsa en el centro y arrastra hasta el borde. Mínimo 50 m. Escape cancela.</p>}
        <div className="campaign-actions">
          <button type="button" className="cop-primary" onClick={callArea && !drawingArea ? launchAreaCampaign : beginArea} disabled={dispatching || Boolean(callArea && !drawingArea && (liveMode ? !areaIds.length : !callableCount))}>{!callArea || drawingArea ? 'Dibujar zona' : dispatching ? 'Lanzando llamadas…' : liveMode ? areaIds.length ? `Llamar a ${areaIds.length} seleccionados · REAL` : 'Nadie dentro del círculo' : callableCount ? `Llamar a ${callableCount} seleccionados · demo` : 'Sin contactos nuevos'}</button>
          {(callArea || drawingArea) && <button type="button" className="cop-secondary" onClick={() => { setDrawingArea(false); updateArea(null) }}>Borrar selección</button>}
          {!liveMode && campaignRunning && <button type="button" className="campaign-pause" onClick={() => setProtocolOn(active => !active)} aria-label={protocolOn ? 'Pausar campaña' : 'Reanudar campaña'}><Icon name={protocolOn ? 'pause' : 'play'} />{protocolOn ? 'Pausar' : 'Reanudar'}</button>}
        </div>
        {!callArea && <button type="button" className="cop-secondary" onClick={() => finishArea({ ...(rosterCenter ?? { lng: INCIDENT.center[0], lat: INCIDENT.center[1] }), radiusM: rosterCenter ? 1000 : 3000 })}>{rosterCenter ? 'Usar todo el censo · 1 km' : 'Usar entorno del incendio · 3 km'}</button>}
        {!liveMode && callArea && !callableCount && !drawingArea && <p className="fine" role="status">No hay nuevos contactos pendientes en esta selección. Puedes dibujar otra zona; las sesiones GPS quedan excluidas.</p>}
        {dispatchError && <p className="fine" role="alert">{dispatchError}</p>}
        {liveBatch && <CallBoard calls={liveCalls} skipped={liveBatch.skipped} onSelect={selectCitizen} />}
        {!liveMode && campaignIds.length > 0 && <div className="campaign-stats" role="status"><span><strong>{counts.answered}</strong>/{campaignIds.length} respondidas</span><span>{counts.moving} en movimiento</span><span>{counts.silent} sin respuesta</span>{counts.waiting > 0 && <span>{counts.waiting} sin ruta</span>}</div>}
        {!liveMode && planningCount > 0 && <p className="fine" role="status">Calculando {planningCount} rutas individuales desde la posición de los contactos…</p>}
        {!liveMode && counts.waiting > 0 && <><p className="fine" role="status">{citizens.find(citizen => campaignSet.has(citizen.id) && citizen.status === 'assistance')?.routeHoldReason}</p><button type="button" className="cop-secondary" onClick={retryRoutes}>Reintentar rutas pendientes</button></>}
      </section>
      <div className="map-disclaimer">Demo · sin llamadas reales · hospital y bomberos reubicados · propagación ilustrativa</div>
    </div>
  )
}

/**
 * El tablero de la ráfaga: una fila por llamada, con su estado y su motivo.
 *
 * Los descartados van abajo y con su razón porque son la mitad interesante: un círculo del
 * que solo suenan cuatro de dieciocho teléfonos tiene que poder explicarse sin abrir un log.
 */
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

function Icon({ name }: { name: 'people' | 'layers' | 'close' | 'play' | 'pause' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'people' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></> : name === 'layers' ? <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></> : name === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : name === 'play' ? <path d="m8 4 12 8-12 8Z" /> : <><path d="M8 5v14M16 5v14" /></>}</svg>
}

function PersonDetail({ citizen, events, now, onClose }: { citizen: Citizen; events: CallEvent[]; now: number; onClose: () => void }) {
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
      <section className="detail-section"><h3>Localización</h3>
        <div className={`location-card ${reference || stale ? 'uncertain' : ''}`}><strong>{LOCATION_LABEL[locationSource]}</strong><span className="coordinates">{Math.abs(citizen.lat).toFixed(5)}° {citizen.lat >= 0 ? 'N' : 'S'} / {Math.abs(citizen.lng).toFixed(5)}° {citizen.lng < 0 ? 'O' : 'E'}</span><span>{locationAge(citizen.locationUpdatedAt, now)}{stale ? ' · DESACTUALIZADA' : ''}</span></div>
        <dl className="detail-fields"><div><dt>Precisión reportada</dt><dd>{citizen.accuracyM !== undefined ? `${Math.round(citizen.accuracyM)} m` : 'No disponible'}</dd></div><div><dt>Origen</dt><dd>{citizen.live ? locationSource === 'gps' ? 'Navegador del ciudadano' : 'Sesión compartida' : 'Escenario sintético'}</dd></div><div><dt>Localidad / entorno</dt><dd>{citizen.locality ?? 'Sin información'}</dd></div></dl>
        <p className="detail-warning">{reference ? 'Referencia aproximada del núcleo urbano, no de una vivienda real. No confirma la presencia de esta persona.' : locationSource === 'simulation' ? 'Ubicación compartida en el guion de la demo; no es una medición GPS real.' : 'Posición reportada por el dispositivo. No valida identidad ni confirma que esté a salvo.'}</p>
      </section>
      <section className="detail-section"><h3>Última llamada</h3>
        <div className="call-summary"><p>{citizen.call?.summary ?? 'Sin llamada respondida. Los datos de registro no son declaraciones de la persona.'}</p></div>
        {citizen.call?.needs.map((need) => <p className="need-note" key={need}>{need}</p>)}
        <dl className="detail-fields"><div><dt>Agente</dt><dd>{citizen.call?.agent ?? 'No asignado'}</dd></div><div><dt>Respuesta</dt><dd>{citizen.call ? formatClock(new Date(citizen.call.answeredAt)) : 'Sin información'}</dd></div><div><dt>Comparte ubicación</dt><dd>{citizen.call ? citizen.call.consent === 'granted' ? 'Sí · demo' : 'No · demo' : 'No registrado'}</dd></div></dl>
      </section>
      <section className="detail-section"><h3>Familiares y acompañantes</h3>
        {citizen.household?.length ? citizen.household.map((member) => <div className="family-member" key={member.name}><strong>{member.name}</strong><p>{member.situation}</p><small>{member.source}</small></div>) : <p className="fine">Sin información aportada.</p>}
      </section>
      <details className="detail-section"><summary>Metadatos y trazabilidad</summary><dl className="detail-fields"><div><dt>Teléfono</dt><dd>{citizen.live ? 'No aportado' : 'Contacto ficticio'}</dd></div><div><dt>Fuente del registro</dt><dd>{citizen.live ? 'Formulario voluntario' : 'Dataset de demostración'}</dd></div></dl><ol className="feed">{events.map((event) => <li key={event.id}><time>{formatClock(new Date(event.ts))}</time><div><p>{event.detail}</p><small>{event.agent} · SIMULACIÓN</small></div></li>)}</ol></details>
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
