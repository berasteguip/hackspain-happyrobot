import { useEffect, useMemo, useState } from 'react'
import { EXPOSURE_COLOR, EXPOSURE_LABEL, exposureAt } from './fire-model'
import type { FireForecast, FireSettings } from './fire-model'
import { haversineMeters } from './geo'
import { fetchRefugeRoutes, rankRefugeRoutes } from './routing'
import type { RefugeRoute } from './routing'
import { SAFE_ZONES, SETTLEMENTS } from './scenario'
import { CENTER_LABEL, CENTER_SYMBOL, createNotice, NOTICE_LABEL, RESPONSE_CENTERS, transitionNotice } from './response'
import type { DemoNotice } from './response'
import type { Citizen } from './types'

export function FireControls({ settings, horizon, onSimulate, onReset, showWind, onWind, marginM, forecast, onFocus, fireMinute, fireRunning, onFireToggle }: {
  settings: FireSettings; horizon: number; onSimulate: () => void; onReset: () => void
  fireMinute: number; fireRunning: boolean; onFireToggle: () => void
  showWind: boolean; onWind: () => void; marginM: number
  forecast: FireForecast; onFocus: (point: { lng: number; lat: number }) => void
}) {
  return <div className="cop-content">
    <div className="setting-row"><span><strong>Viento</strong><small>Hacia el sudoeste · {settings.windKmh} km/h</small></span><button type="button" className="wind-toggle" role="switch" aria-label="Mostrar viento en el mapa" aria-checked={showWind} onClick={onWind}>{showWind ? 'Visible' : 'Oculto'}</button></div>
    <div className="setting-row"><span><strong>Avance del incendio</strong><small>+{fireMinute.toFixed(1)} min · reloj de demo ×12</small></span><button type="button" className="wind-toggle" role="switch" aria-label="Avance del incendio" aria-checked={fireRunning} onClick={onFireToggle}>{fireRunning ? 'Activo' : 'Pausado'}</button></div>
    <h3>Momento del escenario</h3>
    <div className="segmented-control" role="group" aria-label="Horizonte de simulación"><button type="button" aria-label="Volver al incendio inicial" aria-pressed={horizon === 0} onClick={onReset}>Ahora</button><button type="button" aria-label="Simular incendio dentro de 1 hora" aria-pressed={horizon > 0} onClick={onSimulate}>Dentro de 1 h</button></div>
    <p className="fine" role="status">{horizon ? 'Exposición estimada a +1 h.' : 'Exposición del escenario inicial.'} No dibuja una zona de riesgo sobre el mapa.</p>
    <h3>Puntos de encuentro</h3>
    <div className="cop-list">{SAFE_ZONES.map(zone => {
      const exposure = exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)
      return <button type="button" key={zone.id} onClick={() => onFocus(zone)}><span className="exposure-dot" style={{ background: EXPOSURE_COLOR[exposure.level] }} /><span><strong>{zone.code} · {zone.name}</strong><small>{EXPOSURE_LABEL[exposure.level]}</small></span></button>
    })}</div>
    <p className="detail-warning">Simulación ilustrativa, no pronóstico. Viento prefijado, no meteorología en vivo; no modela terreno, combustible ni humedad. Azul no significa seguridad confirmada.</p>
    <p className="fine">La selección de rutas evalúa siempre la próxima hora, aunque se muestre el incendio inicial. Las personas solo salen tras responder y consentir, hacia el refugio más cercano por recorrido admisible. Si la carretera o el destino están expuestos, quedan pendientes de revisión.</p>
  </div>
}

export function RefugeRoutesPanel({ citizen, token, forecast, horizon, marginM, onRoute }: {
  citizen: Citizen; token: string; forecast: FireForecast; horizon: number; marginM: number; onRoute: (route: RefugeRoute | null) => void
}) {
  const [profile, setProfile] = useState<'walking' | 'driving'>('driving')
  const [request, setRequest] = useState<{ origin: [number, number]; profile: 'walking' | 'driving' } | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchRefugeRoutes>> | null>(null)
  const [state, setState] = useState('')
  const [chosen, setChosen] = useState('')
  const stale = Boolean(request && (request.profile !== profile || haversineMeters(...request.origin, citizen.lng, citizen.lat) > 50))
  const ranked = useMemo(() => rankRefugeRoutes(result?.routes ?? [], SAFE_ZONES, forecast, horizon, marginM), [result, forecast, horizon, marginM])
  const active = stale ? null : ranked.routes.find(route => route.id === chosen) ?? ranked.routes[0] ?? null
  useEffect(() => {
    onRoute(active)
    return () => onRoute(null)
  }, [active, onRoute])
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    fetchRefugeRoutes(token, request.origin, SAFE_ZONES, request.profile, controller.signal).then(value => {
      if (!controller.signal.aborted) { setResult(value); setState('Consulta terminada') }
    }).catch(() => { if (!controller.signal.aborted) setState('No se pudo consultar el proveedor. No se ha trazado una ruta.') })
    return () => controller.abort()
  }, [request, token])
  return <section className="cop-content route-planner">
    <h3>Rutas a puntos de encuentro</h3>
    <p className="fine">Comparación manual: una alternativa no cambia el destino comunicado ni el recorrido asignado.</p>
    <p className="fine">Desde la posición mostrada de {citizen.name}. {citizen.locationSource === 'reference' ? 'Es una referencia residencial, no su ubicación confirmada.' : 'La posición puede ser aproximada o simulada.'}</p>
    <div className="segmented-control" role="group" aria-label="Modo de traslado">{(['driving', 'walking'] as const).map(mode => <button type="button" key={mode} aria-pressed={profile === mode} onClick={() => { setProfile(mode); setResult(null); setRequest(null); setState('') }}>{mode === 'driving' ? 'Vehículo' : 'A pie'}</button>)}</div>
    <button type="button" className="cop-primary" onClick={() => { setResult(null); setChosen(''); setState('Consultando Mapbox…'); setRequest({ origin: [citizen.lng, citizen.lat], profile }) }}>Comparar rutas · Mapbox</button>
    <p className="fine">Consulta externa que consume cuota. Duración del proveedor + accesos aproximados a pie (máximo 100 m por extremo). No usa tráfico en vivo.</p>
    <p role="status" className="fine">{stale ? 'La posición o el modo ha cambiado. Vuelve a calcular.' : state}</p>
    {!stale && result && <>
      <p className="fine">{ranked.rejected} alternativas descartadas por exposición o por superar 120 min. {result.failed > 0 && `${result.failed} destinos no pudieron consultarse; comparación parcial.`} {result.unsuitable > 0 && `${result.unsuitable} respuestas sin geometría o acceso admisible.`}</p>
      {result.errors.length > 0 && <p className="need-note">{result.errors.join(' · ')}</p>}
      {!ranked.routes.length && <p className="need-note">Sin ruta admisible entre las alternativas obtenidas. Requiere revisión humana; no se inventa un recorrido.</p>}
      <div className="cop-list">{ranked.routes.map((route, i) => <button type="button" key={route.id} aria-pressed={active?.id === route.id} onClick={() => setChosen(route.id)}><span className="route-number">{i + 1}</span><span><strong>{SAFE_ZONES.find(zone => zone.id === route.zoneId)?.name}</strong><small>{Math.ceil(route.durationSec / 60)} min estimados · {(route.distanceM / 1000).toFixed(1)} km</small><small>{i === 0 ? 'Menor tiempo entre las consultadas' : 'Alternativa'} · acceso aprox. {Math.round(route.accessM)} m</small></span></button>)}</div>
    </>}
    <p className="detail-warning">Refugios evaluados al menos a una hora. Cada tramo se compara con la llegada simulada del fuego según su tiempo de paso y un margen de demo de 2 min. Se permite salir de la proyección futura antes de que llegue el fuego. No garantiza una evacuación segura ni confirma carreteras abiertas.</p>
  </section>
}

export function ResponsePanel({ selectedId, onSelect, scenario, notices, onNotices }: {
  selectedId: string | null; onSelect: (id: string) => void; scenario: string
  notices: DemoNotice[]; onNotices: (value: DemoNotice[]) => void
}) {
  const [filter, setFilter] = useState('all')
  const center = RESPONSE_CENTERS.find(item => item.id === selectedId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sector, setSector] = useState('Guisando')
  const messageKey = `${selectedId}:${center?.kind === 'fire' ? sector : ''}`
  const message = drafts[messageKey] ?? (center?.kind === 'fire'
    ? `EJERCICIO VIGÍA. Solicitud de valoración de apoyo en el sector ${sector}. Confirmar disponibilidad y acceso con el mando. No es una orden de despliegue.`
    : 'EJERCICIO VIGÍA. Preaviso de posible llegada de personas afectadas por el escenario de incendio. Número, gravedad y ETA pendientes de confirmación humana. Solicitar valoración de disponibilidad.')
  return <div className="cop-content">
    <p className="eyebrow">CENTROS DEL ESCENARIO · COMUNICACIONES SIMULADAS</p>
    <p className="fine">Hospital y bomberos se han acercado al incendio con posiciones ficticias para la demo. El centro de salud conserva su referencia cartográfica. No es un inventario operativo.</p>
    <div className="segmented-control" role="group" aria-label="Tipo de centro">{[['all', 'Todos'], ...Object.entries(CENTER_LABEL)].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="cop-list">{RESPONSE_CENTERS.filter(item => filter === 'all' || item.kind === filter).map(item => <button type="button" key={item.id} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><span className={`center-symbol ${item.kind}`}>{CENTER_SYMBOL[item.kind]}</span><span><strong>{item.name}</strong><small>{CENTER_LABEL[item.kind]} · {item.locationSource === 'demo' ? 'POSICIÓN DEMO' : 'referencia OSM'}</small></span></button>)}</div>
    {center && <section className="center-detail">
      <h3>{center.name}</h3><p className="fine">Dirección del centro real: {center.address}</p><p className="detail-warning">{center.note}</p>
      {center.realLocation && <p className="fine">Referencia real conservada: {center.realLocation.lat.toFixed(5)}, {center.realLocation.lng.toFixed(5)}. El marcador del mapa no representa esa ubicación.</p>}
      <p className="fine">Fuentes del centro real consultadas: {center.verifiedAt}. {center.locationSource === 'demo' ? 'La posición mostrada es exclusivamente de demostración.' : 'Coordenadas aproximadas del recinto, no del acceso de emergencias.'}</p>
      <div className="source-links">{center.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div>
      <h3>{center.kind === 'fire' ? 'Preparar solicitud de apoyo' : 'Preparar preaviso sanitario'}</h3>
      {center.kind === 'fire' && <label className="control-label">Sector a valorar<select value={sector} onChange={e => setSector(e.target.value)}>{SETTLEMENTS.map(place => <option key={place.name}>{place.name}</option>)}</select></label>}
      <label className="control-label">Mensaje de ejercicio<textarea rows={6} maxLength={2000} value={message} onChange={e => setDrafts(previous => ({ ...previous, [messageKey]: e.target.value }))} /></label>
      <button type="button" className="cop-primary" disabled={!message.trim() || notices.length >= 50} onClick={() => onNotices([createNotice(center, message, scenario), ...notices])}>Crear borrador para revisión</button>
      {notices.length >= 50 && <p className="fine">Límite de 50 avisos de esta sesión alcanzado.</p>}
    </section>}
    <h3>Bandeja de coordinación · {notices.length}</h3>
    <p className="fine">Solo memoria de esta sesión. No se realizan llamadas, peticiones de envío ni notificaciones externas. «Acuse» también es una acción de demostración.</p>
    <ol className="notice-list" aria-live="polite">{notices.map(notice => <li key={notice.id}>
      <strong>{RESPONSE_CENTERS.find(item => item.id === notice.centerId)?.name}</strong><span className={`notice-status ${notice.status}`}>{NOTICE_LABEL[notice.status]}</span><p>{notice.message}</p><small>{notice.scenario}</small><time>{new Date(notice.updatedAt).toLocaleTimeString('es-ES')}</time>
      {notice.status !== 'acknowledged' && <button type="button" onClick={() => onNotices(notices.map(item => item.id === notice.id ? transitionNotice(item, item.status === 'draft' ? 'simulated' : 'acknowledged') : item))}>{notice.status === 'draft' ? 'He revisado · simular envío' : 'Simular acuse de recibo'}</button>}
    </li>)}</ol>
  </div>
}
