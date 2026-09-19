import { useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { EVACUATION_CORRIDORS, INITIAL_CITIZENS, SAFE_ZONES, SCENARIO_FIRES } from './scenario'
import { loadCorridorRoutes, resolveGroupZones } from './routing'
import type { RouteIndex } from './routing'
import { advanceProtocol, moveEvacuees } from './simulation'
import { fetchSnapshot } from './api'
import type { CallEvent, Citizen, FireSpot, LocationPing, MapLayers, RiskArea, SafeZone } from './types'

const STATUS_LABEL: Record<Citizen['status'], string> = {
  pending: 'Sin contactar', ringing: 'En llamada', no_answer: 'Sin respuesta',
  informed: 'Aviso recibido', tracking: 'Ubicación compartida', evacuating: 'En tránsito · sim.',
  safe: 'En punto de encuentro · sim.', refused: 'No comparte ubicación',
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
  // Zonas y perímetro dejan de venir de `scenario.ts` en cuanto `api/` responde: la geografía
  // sale del dataset, no del frontend (decisión 003).
  const [zones, setZones] = useState<SafeZone[]>(SAFE_ZONES)
  const [perimeter, setPerimeter] = useState<RiskArea | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [live, setLive] = useState(false)
  const [liveNote, setLiveNote] = useState('Escenario local · sin conexión con la API')
  const [events, setEvents] = useState<CallEvent[]>([])
  const [protocolOn, setProtocolOn] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [panel, setPanel] = useState<'people' | 'layers' | null>(null)
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(false)
  const [firmsState, setFirmsState] = useState('Sin consultar · detecciones de las últimas 24 h')
  const [layers, setLayers] = useState<MapLayers>({ perimeter: true, spread: false, thermal: false, citizens: true, references: true, zones: true })
  const citizensRef = useRef(citizens)
  const routesRef = useRef<RouteIndex>(new Map())
  const elapsedRef = useRef(0)
  const peopleButtonRef = useRef<HTMLButtonElement>(null)
  const layersButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { citizensRef.current = citizens }, [citizens])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSelectedId(null)
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
    const controller = new AbortController()
    loadCorridorRoutes(token, EVACUATION_CORRIDORS, controller.signal)
      .then((routes) => {
        if (controller.signal.aborted) return
        routesRef.current = routes
        const byGroup = resolveGroupZones(routes)
        if (!byGroup.size) return
        setCitizens((current) => {
          const next = current.map((citizen) => {
            const zoneId = citizen.locality ? byGroup.get(citizen.locality) : undefined
            return zoneId && zoneId !== citizen.safeZoneId ? { ...citizen, safeZoneId: zoneId } : citizen
          })
          citizensRef.current = next
          return next
        })
      })
      .catch(() => { routesRef.current = new Map() })
    return () => controller.abort()
  }, [token])
  useEffect(() => {
    // La simulación local es el plan B. Con la API conectada, mover gente por nuestra cuenta
    // pintaría evacuaciones que no están ocurriendo.
    if (!protocolOn || live) return
    const started = performance.now()
    const baseline = elapsedRef.current
    let previousElapsed = baseline
    const timer = window.setInterval(() => {
      const nextElapsed = baseline + (performance.now() - started) / 1000
      const dt = nextElapsed - previousElapsed
      previousElapsed = nextElapsed
      elapsedRef.current = nextElapsed
      const advanced = advanceProtocol(citizensRef.current, nextElapsed, [])
      const moved = moveEvacuees(advanced.citizens, routesRef.current, zones, dt)
      citizensRef.current = moved
      setCitizens(moved)
      setElapsed(nextElapsed)
      if (advanced.events.length) setEvents((previous) => [...advanced.events.reverse(), ...previous].slice(0, 700))
    }, 100)
    return () => window.clearInterval(timer)
  }, [protocolOn, live, zones])
  // Estado real de la crisis. Es la vía por la que aparecen en el mapa las personas que
  // comparten ubicación desde el enlace del SMS: su posición entra por `POST /positions` y se
  // escribe sobre la propia persona, así que `GET /state` ya las trae con su trayectoria.
  useEffect(() => {
    let cancelled = false
    const control = new AbortController()
    const poll = async () => {
      try {
        const snapshot = await fetchSnapshot(control.signal)
        if (cancelled) return
        setCitizens(snapshot.citizens)
        if (snapshot.zones.length) setZones(snapshot.zones)
        if (snapshot.perimeter) setPerimeter(snapshot.perimeter)
        if (snapshot.center) setCenter(snapshot.center)
        setLive(true)
        const localizadas = snapshot.citizens.filter((citizen) => citizen.live).length
        setLiveNote(`API conectada · ${snapshot.citizens.length} personas, ${localizadas} compartiendo ubicación`)
      } catch (error) {
        if (cancelled || control.signal.aborted) return
        setLive(false)
        setLiveNote(
          error instanceof Error && error.message.includes('401')
            ? 'API conectada pero sin clave: añade ?key= a la URL'
            : 'Escenario local · la API no responde',
        )
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), 2000)
    return () => { cancelled = true; control.abort(); window.clearInterval(id) }
  }, [])

  useEffect(() => {
    // Con la API conectada las posiciones llegan en `GET /state`; este endpoint solo existía en
    // el servidor de desarrollo de Vite y no sobrevive a `vite build`.
    if (live) return
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
  }, [live])

  const fires = useMemo(() => showFirms ? [...SCENARIO_FIRES, ...firms] : SCENARIO_FIRES, [showFirms, firms])
  const counts = useMemo(() => ({
    total: citizens.length,
    answered: citizens.filter((citizen) => citizen.call).length,
    located: citizens.filter((citizen) => citizen.locationSource === 'gps' || citizen.locationSource === 'simulation').length,
    silent: citizens.filter((citizen) => citizen.status === 'no_answer').length,
  }), [citizens])
  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const filtered = citizens.filter((citizen) => {
    const text = `${citizen.name} ${citizen.phone} ${citizen.id} ${citizen.locality} ${STATUS_LABEL[citizen.status]}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || (filter === 'outside' ? citizen.resident === false : citizen.status === 'no_answer'))
  })
  const selectCitizen = (id: string | null) => {
    setSelectedId(id)
    setPanel(null)
    if (id) setLayers((previous) => ({ ...previous, citizens: true, references: true }))
  }
  const togglePanel = (next: 'people' | 'layers') => { setSelectedId(null); setPanel((current) => current === next ? null : next) }
  const closePanel = () => {
    if (panel === 'layers') layersButtonRef.current?.focus()
    else peopleButtonRef.current?.focus()
    setSelectedId(null)
    setPanel(null)
  }

  return (
    <div className="map-app">
      <main className="map-wrap" aria-label="Mapa de situación">
        <CommandMap token={token} citizens={citizens} fires={fires} zones={zones} center={center} livePerimeter={perimeter} selectedId={selectedId} layers={layers} onSelect={selectCitizen} />
      </main>
      <header className="floating-brand">
        <span className="brand-symbol" aria-hidden="true">V</span><strong>vigía</strong><span className="brand-divider" /><span className="place-name">Sierra de Gredos</span><span className="demo-badge">{live ? 'EN VIVO' : 'DEMO'}</span><span className="place-name" title={liveNote}>{liveNote}</span>
      </header>
      <nav className="floating-actions" aria-label="Herramientas del mapa">
        <button ref={peopleButtonRef} type="button" aria-label={`Personas ${counts.total}`} className={panel === 'people' || selected ? 'active' : ''} aria-expanded={panel === 'people' || Boolean(selected)} aria-controls="map-panel" onClick={() => togglePanel('people')}><Icon name="people" /><span>Personas</span><small>{counts.total}</small></button>
        <button ref={layersButtonRef} type="button" aria-label="Capas" className={panel === 'layers' ? 'active' : ''} aria-expanded={panel === 'layers'} aria-controls="map-panel" onClick={() => togglePanel('layers')}><Icon name="layers" /><span>Capas</span></button>
      </nav>
      <div className="minimal-legend" aria-label="Leyenda"><span><i className="legend-point hollow" />Referencia residencial</span><span><i className="legend-point" />Ubicación compartida</span><span><i className="legend-zone" />Punto de encuentro</span><span><i className="legend-fire" />Huella térmica · demo</span></div>
      {(panel || selected) && <aside id="map-panel" className="floating-panel" aria-label={selected ? 'Ficha de persona' : panel === 'layers' ? 'Capas del mapa' : 'Personas'}>
        <div className="floating-panel-heading"><h2>{selected ? 'Ficha de persona' : panel === 'layers' ? 'Capas del mapa' : 'Personas'}</h2><button type="button" aria-label="Cerrar panel" onClick={closePanel}><Icon name="close" /></button></div>
        <div className="floating-panel-body">
          {selected ? <PersonDetail citizen={selected} events={events.filter((event) => event.citizenId === selected.id)} now={now.getTime()} onClose={() => { setSelectedId(null); setPanel('people') }} /> : panel === 'layers' ? (
            <div className="layer-content">
              {LAYER_OPTIONS.map((layer) => <label className={`layer-row ${!layers[layer.key] ? 'muted-layer' : ''}`} key={layer.key}><span className={`layer-symbol ${layer.symbol}`} aria-hidden="true" /><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.detail}</small></span><input type="checkbox" aria-label={layer.name} checked={layers[layer.key]} onChange={(event) => setLayers((previous) => ({ ...previous, [layer.key]: event.target.checked }))} /></label>)}
              <details className="source-details"><summary>Fuente externa · NASA FIRMS</summary><label className="source-toggle"><span>Mostrar detecciones satélite</span><input type="checkbox" checked={showFirms} onChange={(event) => { setShowFirms(event.target.checked); if (event.target.checked) { setFirmsState('Consultando detecciones…'); setLayers((previous) => ({ ...previous, thermal: true })) } }} /></label><p className="fine" role="status">{firmsState}</p><p className="fine">No son datos en tiempo real ni delimitan un incendio.</p></details>
              <p className="panel-footnote">Las celdas rojas son ilustrativas: no delimitan una superficie quemada confirmada. La propagación opcional no procede de un modelo predictivo.</p>
            </div>
          ) : (
            <>
              <label className="search-label"><span className="sr-only">Buscar persona o localidad</span><input autoFocus className="search" placeholder="Nombre, localidad o ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className="filter-bar" role="group" aria-label="Filtrar personas">{[['all', 'Todas'], ['outside', 'Fuera del núcleo'], ['no_answer', 'Sin respuesta']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
              <div className="list-summary"><span>{filtered.length} personas</span><span>{counts.located} ubicaciones compartidas</span></div>
              <ul className="people">{filtered.map((citizen) => <li key={citizen.id}><button type="button" onClick={() => selectCitizen(citizen.id)}><span className={`dot ${citizen.status} ${citizen.locationSource === 'reference' ? 'reference-dot' : ''}`} /><span className="person-row-copy"><strong>{citizen.name}</strong><em>{citizen.locality}</em></span><span className="person-row-meta"><small>{citizen.locationSource === 'gps' ? 'GPS' : citizen.locationSource === 'simulation' ? 'SIM' : 'REF'}</small><span>{citizen.status === 'pending' ? '' : STATUS_LABEL[citizen.status]}</span></span><span className="row-chevron" aria-hidden="true">›</span></button></li>)}</ul>
              {!filtered.length && <div className="empty-state"><strong>No hay coincidencias</strong><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>Limpiar filtros</button></div>}
            </>
          )}
        </div>
      </aside>}
      <div className="simulation-dock">
        <button type="button" disabled={live} title={live ? "Con la API conectada los datos son reales" : undefined} onClick={() => setProtocolOn((active) => !active)} aria-label={protocolOn ? 'Pausar simulación' : elapsed ? 'Continuar simulación' : 'Iniciar simulación'}><Icon name={protocolOn ? 'pause' : 'play'} /><span>{protocolOn ? 'Pausar' : elapsed ? 'Continuar' : 'Simular llamadas'}</span></button>
        <span className="dock-divider" /><span className="dock-count"><strong>{counts.answered}</strong>/{counts.total}<small>respondidas</small></span>
        {counts.silent > 0 && <span className="dock-silent">{counts.silent} sin respuesta</span>}
      </div>
      <div className="map-disclaimer">Escenario ficticio · sin llamadas reales · propagación ilustrativa</div>
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
