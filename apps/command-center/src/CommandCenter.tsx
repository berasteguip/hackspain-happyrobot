import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { INITIAL_CITIZENS, SAFE_ZONES, SCENARIO_FIRES, SCENARIO_FIRE_CELLS } from './scenario'
import { advanceProtocol, DEMO_TIME_SCALE, groupSize, zoneUsage } from './simulation'
import { createFireChecker } from './geo'
import { createRoutePlanner } from './routing'
import { applyWaveStatus, buildWavePeople, fetchWaveStatus, pickWaveCitizens, startWave, waveZoneFor } from './bridge'
import type { CallEvent, Citizen, FireSpot, LocationPing, MapLayers, SafeZone } from './types'

const STATUS_LABEL: Record<Citizen['status'], string> = {
  pending: 'Sin contactar', ringing: 'En llamada', no_answer: 'Sin respuesta',
  informed: 'Aviso recibido', tracking: 'Ubicación compartida', evacuating: 'En tránsito · sim.',
  safe: 'Llegada simulada', refused: 'No comparte ubicación',
  routing: 'Consultando recorrido', preparing: 'Preparando salida', assistance: 'Pendiente de asistencia',
}
const LOCATION_LABEL = {
  reference: 'Referencia residencial aproximada', simulation: 'Ubicación compartida · demo',
  gps: 'Geolocalización del dispositivo', unknown: 'Origen no especificado',
}
const LAYER_OPTIONS: { key: keyof MapLayers; name: string; detail: string; symbol: string }[] = [
  { key: 'perimeter', name: 'Huella térmica', detail: 'Manchas de celdas · escenario simulado', symbol: 'perimeter' },
  { key: 'spread', name: 'Posible propagación', detail: 'Hipótesis · no es un pronóstico', symbol: 'spread' },
  { key: 'thermal', name: 'Detecciones térmicas', detail: 'Focos puntuales, no perímetros', symbol: 'thermal' },
  { key: 'citizens', name: 'Personas', detail: 'Ubicación y estado de contacto', symbol: 'person' },
  { key: 'references', name: 'Referencias residenciales', detail: 'No confirman presencia', symbol: 'reference' },
  { key: 'zones', name: 'Puntos de encuentro', detail: 'Ubicaciones de demostración', symbol: 'zone' },
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
  const [elapsed, setElapsed] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [routeNotice, setRouteNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | null>(null)
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: false, thermal: false, citizens: true, references: true, zones: true })
  const citizensRef = useRef(citizens)
  const elapsedRef = useRef(0)
  const peopleButtonRef = useRef<HTMLButtonElement>(null)
  const layersButtonRef = useRef<HTMLButtonElement>(null)
  const fireBlocked = useMemo(() => createFireChecker(SCENARIO_FIRE_CELLS), [])
  const planRoute = useMemo(() => createRoutePlanner(token, fireBlocked), [token, fireBlocked])
  const updatePopulation = useCallback((change: (current: Citizen[]) => Citizen[]) => {
    const next = change(citizensRef.current)
    citizensRef.current = next
    setCitizens(next)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSelectedId(null)
      setSelectedZoneId(null)
      setPanel(null)
      if (panel === 'layers') layersButtonRef.current?.focus()
      else peopleButtonRef.current?.focus()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [panel])
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
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      elapsedRef.current += Math.min((now - last) / 1000, 0.25) * DEMO_TIME_SCALE
      last = now
      const advanced = advanceProtocol(citizensRef.current, elapsedRef.current, [], SAFE_ZONES, { onlyHr: citizensRef.current.some((citizen) => citizen.hrCall) })
      updatePopulation(() => advanced.citizens)
      setElapsed(elapsedRef.current)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 1800))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn, updatePopulation])
  useEffect(() => {
    if (!protocolOn) return
    const controller = new AbortController()
    const inFlight = new Set<string>()
    const pump = () => {
      const waiting = citizensRef.current.filter((citizen) => !citizen.live && citizen.status === 'routing' && citizen.routeState !== 'ready' && !inFlight.has(citizen.id))
        .sort((a, b) => Number(b.locality === 'Guisando') - Number(a.locality === 'Guisando'))
      for (const citizen of waiting.slice(0, Math.max(0, 4 - inFlight.size))) {
        inFlight.add(citizen.id)
        updatePopulation((current) => current.map((item) => item.id === citizen.id ? { ...item, routeState: 'loading' } : item))
        void planRoute(citizen, SAFE_ZONES, citizensRef.current, controller.signal).then((result) => {
          if (controller.signal.aborted) return
          if (result.serviceError) setRouteNotice(result.reason ?? 'Servicio de rutas no disponible.')
          updatePopulation((current) => current.map((item) => item.id === citizen.id && !item.live && item.status === 'routing'
            ? { ...item, routeState: 'ready', routeOptions: result.options, assistanceReason: result.reason } : item))
        }).catch(() => {
          if (controller.signal.aborted) return
          const reason = 'No se pudo verificar un recorrido. El grupo permanece pendiente de asistencia.'
          setRouteNotice(reason)
          updatePopulation((current) => current.map((item) => item.id === citizen.id && !item.live && item.status === 'routing'
            ? { ...item, routeState: 'ready', routeOptions: [], assistanceReason: reason } : item))
        }).finally(() => inFlight.delete(citizen.id))
      }
    }
    const timer = window.setInterval(pump, 250)
    pump()
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [protocolOn, planRoute, updatePopulation])
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/api/locations')
        if (!res.ok) return
        const pings = (await res.json()) as LocationPing[]
        if (cancelled || !Array.isArray(pings) || !pings.length) return
        updatePopulation((current) => mergePings(current, pings))
      } catch {
        // demo API is local-only
      }
    }
    const id = window.setInterval(() => void poll(), 1500)
    void poll()
    return () => { cancelled = true; window.clearInterval(id) }
  }, [updatePopulation])

  const fires = useMemo(() => showFirms ? [...SCENARIO_FIRES, ...firms] : SCENARIO_FIRES, [showFirms, firms])
  const counts = useMemo(() => ({
    total: citizens.length,
    answered: citizens.filter((citizen) => citizen.call).length,
    located: citizens.filter((citizen) => citizen.locationSource === 'gps' || citizen.locationSource === 'simulation').length,
    silent: citizens.filter((citizen) => citizen.status === 'no_answer').length,
    movingPeople: citizens.filter((citizen) => citizen.status === 'evacuating').reduce((sum, citizen) => sum + groupSize(citizen), 0),
    arrivedPeople: citizens.filter((citizen) => !citizen.live && citizen.status === 'safe').reduce((sum, citizen) => sum + groupSize(citizen), 0),
    assistance: citizens.filter((citizen) => citizen.status === 'assistance').length,
  }), [citizens])
  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const selectedZone = SAFE_ZONES.find((zone) => zone.id === selectedZoneId) ?? null
  const filtered = citizens.filter((citizen) => {
    const text = `${citizen.name} ${citizen.phone} ${citizen.id} ${citizen.locality} ${STATUS_LABEL[citizen.status]}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'outside' ? citizen.resident === false : filter === 'assistance' ? citizen.status === 'assistance' : citizen.status === 'no_answer'))
  })
  // Primera pulsación de Play: envía una ola de 4 grupos a la centralita real.
  const startHrWave = () => {
    if (citizensRef.current.some((citizen) => citizen.hrCall)) return
    const selected = pickWaveCitizens(citizensRef.current)
    if (!selected.length) return
    const people = buildWavePeople(citizensRef.current, selected)
    const ids = new Set(selected.map((citizen) => citizen.id))
    const zoneById = new Map(selected.map((citizen, index) => [citizen.id, waveZoneFor(index).id]))
    updatePopulation((current) => current.map((citizen) => ids.has(citizen.id) ? { ...citizen, hrCall: { state: 'queued' as const, transcript: [], zoneId: zoneById.get(citizen.id) } } : citizen))
    startWave(people).catch(() => {
      setRouteNotice('Puente HappyRobot no disponible; esos grupos siguen la simulación de demo.')
      updatePopulation((current) => current.map((citizen) => ids.has(citizen.id) ? { ...citizen, hrCall: undefined } : citizen))
    })
  }
  const toggleProtocol = () => {
    if (!protocolOn && elapsedRef.current === 0) startHrWave()
    setProtocolOn((active) => !active)
  }
  const hrActive = citizens.some((citizen) => citizen.hrCall && citizen.hrCall.state !== 'done' && citizen.hrCall.state !== 'failed')
  useEffect(() => {
    const poll = async () => {
      if (!citizensRef.current.some((citizen) => citizen.hrCall && citizen.hrCall.state !== 'done' && citizen.hrCall.state !== 'failed')) return
      try {
        const status = await fetchWaveStatus()
        updatePopulation((current) => applyWaveStatus(current, status.calls))
      } catch {
        // puente local; si no responde, se reintenta en el siguiente ciclo
      }
    }
    const id = window.setInterval(() => void poll(), 2000)
    return () => window.clearInterval(id)
  }, [updatePopulation])
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setSelectedZoneId(null)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const selectZone = (id: string) => { setSelectedZoneId(id); setSelectedId(null); setPanel(null) }
  const togglePanel = (next: 'people' | 'layers') => { setSelectedId(null); setSelectedZoneId(null); setPanel((current) => current === next ? null : next) }
  const closePanel = () => {
    if (panel === 'layers') layersButtonRef.current?.focus()
    else peopleButtonRef.current?.focus()
    setSelectedId(null)
    setSelectedZoneId(null)
    setPanel(null)
  }

  return (
    <div className="map-app">
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap token={token} citizens={citizens} fires={fires} zones={SAFE_ZONES} selectedId={selectedId} selectedZoneId={selectedZoneId} layers={layers} onSelect={selectCitizen} onZoneSelect={selectZone} />
      </main>
      <header className="floating-brand">
        <span className="brand-symbol" aria-hidden="true">V</span><strong>vigía</strong><span className="brand-divider" /><span className="place-name">Sierra de Gredos</span><span className="demo-badge">DEMO</span>
      </header>
      <nav className="floating-actions" aria-label="Herramientas del mapa">
        <button ref={peopleButtonRef} type="button" aria-label={`Grupos ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}><Icon name="people" /><span>Grupos</span><small>{counts.total}</small></button>
        <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}><Icon name="layers" /><span>Capas</span></button>
      </nav>
      <div className="minimal-legend" aria-label="Leyenda"><span><i className="legend-point hollow" />Referencia residencial</span><span><i className="legend-point" />Ubicación compartida</span><span><i className="legend-fire" />Huella térmica · demo</span></div>
      {(panel || selected || selectedZone) && <aside id="map-panel" className="floating-panel" aria-label={selectedZone ? 'Punto de encuentro' : selected ? 'Ficha del grupo' : panel === 'layers' ? 'Capas del mapa' : 'Personas'}>
        <div className="floating-panel-heading"><h2>{selectedZone ? 'Punto de encuentro' : selected ? 'Ficha del grupo' : panel === 'layers' ? 'Capas del mapa' : 'Personas'}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body">
          {selectedZone ? <MeetingDetail zone={selectedZone} citizens={citizens} onSelect={selectCitizen} /> : selected ? <PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} elapsed={elapsed} onZoneSelect={selectZone} onClose={() => { setSelectedId(null); setPanel('people') }} /> : panel === 'layers' ? (
            <div className="layer-content">
              {LAYER_OPTIONS.map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><span className={`layer-symbol ${layer.symbol}`} aria-hidden="true" /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <div className="meeting-shortcuts"><span className="eyebrow">PUNTOS DE ENCUENTRO · DEMO</span>{SAFE_ZONES.map((zone) => <button type="button" key={zone.id} onClick={() => { setLayers((previous) => ({ ...previous, zones: true })); selectZone(zone.id) }}><span>{zone.code}</span><strong>{zone.name}</strong><span>›</span></button>)}</div>
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">Las celdas rojas son ilustrativas: no delimitan una superficie quemada confirmada. La propagación opcional no procede de un modelo predictivo.</p>
            </div>
          ) : (
            <>
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input autoFocus className="search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{[['all', 'Todos'], ['assistance', 'Necesitan ayuda'], ['no_answer', 'Sin respuesta']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              <div className="list-summary"><span>{filtered.length} contactos / grupos</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span className={`dot ${citizen.status} ${citizen.locationSource === 'reference' ? 'reference-dot' : ''}`} /><span className="person-row-copy"><strong>{citizen.name}{citizen.call && citizen.group ? ` · ${groupSize(citizen)} pers.` : ''}</strong><em>{citizen.locality}</em></span><span className="person-row-meta"><small>{citizen.locationSource === 'gps' ? 'GPS' : citizen.locationSource === 'simulation' ? 'SIM' : 'REF'}</small>{citizen.hrCall && <small>HR</small>}<span>{citizen.status === 'pending' ? '' : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>No hay coincidencias</strong><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button></div>}
            </>
          )}
        </div>
      </aside>}
      <div className="simulation-dock">
        <button type="button" onClick={toggleProtocol} aria-label={protocolOn ? 'Pausar simulación' : elapsed ? 'Continuar simulación' : 'Iniciar simulación'}><Icon name={protocolOn ? 'pause' : 'play'} /><span>{protocolOn ? 'Pausar' : hrActive ? 'Llamando…' : elapsed ? 'Continuar' : 'Simular llamadas'}</span></button>
        <span className="dock-divider" /><span className="dock-count"><strong>{counts.answered}</strong>/{counts.total}<small>respondidas</small></span>
        <span className="dock-progress"><strong>{counts.movingPeople}</strong> en camino <span>·</span> <strong>{counts.arrivedPeople}</strong> llegadas</span>
        <span className="simulation-speed">×{DEMO_TIME_SCALE} demo</span>
      </div>
      {routeNotice && <div className="route-notice" role="status">{routeNotice}<button type="button" aria-label="Cerrar aviso de rutas" onClick={() => setRouteNotice('')}>×</button></div>}
      <div className="map-disclaimer">Demo acelerada · rutas Mapbox al pulsar Play (consume cuota) · no es un plan de evacuación</div>
    </div>
  )
}

function Icon({ name }: { name: 'people' | 'layers' | 'close' | 'play' | 'pause' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'people' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></> : name === 'layers' ? <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></> : name === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : name === 'play' ? <path d="m8 4 12 8-12 8Z" /> : <><path d="M8 5v14M16 5v14" /></>}</svg>
}

function PersonDetail({ citizen, events, now, elapsed, onClose, onZoneSelect }: { citizen: Citizen; events: CallEvent[]; now: number; elapsed: number; onClose: () => void; onZoneSelect: (id: string) => void }) {
  const locationSource = citizen.locationSource ?? 'reference'
  const reference = locationSource === 'reference' || locationSource === 'unknown'
  const stale = citizen.locationUpdatedAt !== undefined && now - citizen.locationUpdatedAt > 120_000
  const zone = SAFE_ZONES.find((item) => item.id === citizen.journey?.zoneId)
  const group = citizen.call ? citizen.group : undefined
  const mobility = { walking: 'A pie', assisted: 'A pie, con acompañamiento', vehicle: 'Vehículo propio', pickup: 'Necesita recogida' }
  return (
    <article className="person-detail">
      <button type="button" className="back-button" onClick={onClose}>‹ Todas las personas</button>
      <div className="person-title"><span className="person-avatar">{citizen.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><div><span className="eyebrow">{citizen.id} / {citizen.live ? 'SESIÓN COMPARTIDA' : 'FICHA DEMO'}</span><h2>{citizen.name}</h2></div></div>
      <div className="person-badges"><span className={`status-badge ${citizen.status}`}>{STATUS_LABEL[citizen.status]}</span>{citizen.resident === false && <span className="status-badge">Fuera del núcleo</span>}</div>
      {group && <section className="detail-section"><h3>Un representante · {groupSize(citizen)} {groupSize(citizen) === 1 ? 'persona' : 'personas'}</h3><div className="group-composition"><span><strong>{group.adults}</strong> adultos</span><span><strong>{group.children}</strong> menores</span><span><strong>{group.olderAdults}</strong> mayores</span></div><p className="fine">{mobility[group.mobility]}{citizen.speedKmh > 0 ? ` · ritmo de demo ${citizen.speedKmh.toFixed(1)} km/h` : ''}. Composición confirmada en el guion, no identidades verificadas.</p></section>}
      {citizen.assistanceReason && <p className="need-note">{citizen.assistanceReason}</p>}
      {citizen.status === 'routing' && <p className="fine" role="status">Consultando calles y caminos. El grupo no se moverá hasta tener destino y recorrido admisibles para la demo.</p>}
      {zone && citizen.journey && <section className="detail-section"><h3>Punto comunicado al grupo</h3><button type="button" className="destination-button" onClick={() => onZoneSelect(zone.id)}><span>{zone.code}</span><strong>{zone.name}</strong><span>›</span></button><div className="journey-progress"><span style={{ width: `${citizen.journey.distanceTravelledM / Math.max(1, citizen.journey.distanceM) * 100}%` }} /></div><dl className="detail-fields"><div><dt>Recorrido</dt><dd>{Math.round(citizen.journey.distanceTravelledM)} / {Math.round(citizen.journey.distanceM)} m</dd></div><div><dt>{citizen.status === 'preparing' ? 'Preparación restante' : 'Tiempo restante'}</dt><dd>{citizen.status === 'preparing' ? `${Math.ceil(Math.max(0, citizen.journey.departureAt - elapsed))} s de demo` : `${Math.ceil((citizen.journey.distanceM - citizen.journey.distanceTravelledM) / Math.max(0.1, citizen.speedKmh * 1000 / 3600) / 60)} min simulados`}</dd></div><div><dt>Fuente del recorrido</dt><dd>Mapbox Directions</dd></div></dl><p className="fine">Accesos inicial/final aproximados: {Math.round(citizen.journey.accessM)} m en total. Reloj ×{DEMO_TIME_SCALE}; recorrido no validado por emergencias.</p></section>}
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
      {citizen.hrCall && <section className="detail-section"><h3>Conversación HappyRobot</h3>
        {citizen.hrCall.zoneId && <p className="fine">Punto comunicado: {SAFE_ZONES.find((zone) => zone.id === citizen.hrCall?.zoneId)?.code} · {SAFE_ZONES.find((zone) => zone.id === citizen.hrCall?.zoneId)?.name}</p>}
        <p className="fine">Estado: {{ queued: 'En cola', talking: 'En curso', done: 'Terminada', failed: 'Fallida' }[citizen.hrCall.state]}{citizen.hrCall.endReason ? ` · ${citizen.hrCall.endReason}` : ''}</p>
        {citizen.hrCall.transcript.length ? <ol className="feed hr-transcript">{citizen.hrCall.transcript.map((line, index) => <li key={index}><time>{formatClock(new Date(line.ts))}</time><div><p><strong>{line.speaker === 'A' ? 'VIGÍA' : 'VECINO'}</strong> · {line.text}</p></div></li>)}</ol> : <p className="fine">Sin mensajes todavía.</p>}
        {citizen.hrCall.runUrl && <a className="source-link" href={citizen.hrCall.runUrl} target="_blank" rel="noreferrer">Ver run ↗</a>}
      </section>}
      <section className="detail-section"><h3>Familiares y acompañantes</h3>
        {citizen.household?.length ? citizen.household.map((member) => <div className="family-member" key={member.name}><strong>{member.name}</strong><p>{member.situation}</p><small>{member.source}</small></div>) : <p className="fine">Sin información aportada.</p>}
      </section>
      <details className="detail-section"><summary>Metadatos y trazabilidad</summary><dl className="detail-fields"><div><dt>Teléfono</dt><dd>{citizen.live ? 'No aportado' : 'Contacto ficticio'}</dd></div><div><dt>Fuente del registro</dt><dd>{citizen.live ? 'Formulario voluntario' : 'Dataset de demostración'}</dd></div></dl><ol className="feed">{events.map((event) => <li key={event.id}><time>{formatClock(new Date(event.ts))}</time><div><p>{event.detail}</p><small>{event.agent} · SIMULACIÓN</small></div></li>)}</ol></details>
    </article>
  )
}

function MeetingDetail({ zone, citizens, onSelect }: { zone: SafeZone; citizens: Citizen[]; onSelect: (id: string) => void }) {
  const usage = zoneUsage(citizens, zone.id)
  const assigned = citizens.filter((citizen) => !citizen.live && citizen.journey?.zoneId === zone.id)
  return <article className="meeting-detail"><span className="eyebrow">{zone.code} / PUNTO DE DEMOSTRACIÓN</span><h2>{zone.name}</h2><p className="fine">{zone.description}</p><div className="meeting-services">{zone.services.map((service) => <span key={service}>{service}</span>)}</div><div className="meeting-counts"><div><strong>{usage.arrivedPeople}</strong><span>Llegadas simuladas</span></div><div><strong>{usage.inboundPeople}</strong><span>Por llegar</span></div></div><div className="journey-progress"><span style={{ width: `${usage.reservedPeople / zone.capacity * 100}%` }} /></div><p className="fine">{usage.reservedPeople} / {zone.capacity} plazas reservadas · {usage.groups} grupos. Aforo ficticio; se cuenta a cada miembro, no solo al representante.</p><p className="detail-warning">No es un refugio oficial. Estar fuera de la huella dibujada no garantiza seguridad ni acceso real.</p><a href={zone.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Ubicación publicada por el Ayuntamiento ↗</a><h3>Grupos asignados</h3>{!assigned.length && <p className="fine">Se asignarán después de confirmar cada llamada y su recorrido.</p>}<ul className="meeting-groups">{assigned.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => onSelect(citizen.id)}><span className={`dot ${citizen.status}`} /><span><strong>{citizen.name}</strong><small>{groupSize(citizen)} personas · {STATUS_LABEL[citizen.status]}</small></span><span>›</span></button></li>)}</ul></article>
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
      journey: undefined, routeOptions: undefined, routeState: undefined, safeZoneId: '', assistanceReason: undefined,
    }
    if (index >= 0) {
      const previous = next[index]
      next[index] = { ...previous, ...shared, name: ping.name || previous.name, call: previous.live ? previous.call : undefined, household: previous.live ? previous.household : undefined, group: previous.live ? previous.group : undefined }
    } else {
      next.unshift({ ...shared, id: ping.id, name: ping.name || 'Ciudadano', phone: '', vulnerable: false, safeZoneId: '', speedKmh: 0, callDelaySec: 0, outcome: 'tracking' })
    }
  }
  return next
}
