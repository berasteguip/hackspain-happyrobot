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

export function FireControls({ settings, onSettings, horizon, onHorizon, marginM, onMargin, forecast, onFocus }: {
  settings: FireSettings; onSettings: (value: FireSettings) => void
  horizon: number; onHorizon: (value: number) => void
  marginM: number; onMargin: (value: number) => void
  forecast: FireForecast; onFocus: (point: { lng: number; lat: number }) => void
}) {
  return <div className="cop-content">
    <p className="eyebrow">ESCENARIO CONFIGURABLE · NO ES UN PRONÓSTICO</p>
    <p className="fine">La huella inicial permanece. El avance se expande sobre una cuadrícula de 100 m, favoreciendo la dirección del viento. No modela terreno, combustible, humedad ni saltos de fuego.</p>
    <label className="control-label">Horizonte desde el inicio <strong>+{horizon} min</strong><input aria-label="Horizonte en minutos" type="range" min="0" max="120" step="15" value={horizon} onChange={e => onHorizon(Number(e.target.value))} /></label>
    <div className="time-presets">{[0, 15, 30, 60, 120].map(value => <button type="button" key={value} aria-pressed={horizon === value} onClick={() => onHorizon(value)}>{value ? `+${value} min` : 'Inicio'}</button>)}</div>
    <label className="control-label">Viento hacia<select value={settings.windTowardDeg} onChange={e => onSettings({ ...settings, windTowardDeg: Number(e.target.value) })}>{[[0, 'Norte'], [45, 'Nordeste'], [90, 'Este'], [135, 'Sudeste'], [180, 'Sur'], [225, 'Sudoeste'], [270, 'Oeste'], [315, 'Noroeste']].map(([value, label]) => <option key={value} value={value}>{label} · {value}°</option>)}</select></label>
    <label className="control-label">Velocidad de viento ficticia <strong>{settings.windKmh} km/h</strong><input aria-label="Velocidad del viento" type="range" min="0" max="60" step="5" value={settings.windKmh} onChange={e => onSettings({ ...settings, windKmh: Number(e.target.value) })} /></label>
    <label className="control-label">Avance base del fuego <strong>{settings.spreadMPerMin} m/min</strong><input aria-label="Avance base del fuego" type="range" min="0" max="20" step="1" value={settings.spreadMPerMin} onChange={e => onSettings({ ...settings, spreadMPerMin: Number(e.target.value) })} /></label>
    <label className="control-label">Margen de proximidad de demo <strong>{marginM} m</strong><input aria-label="Margen de proximidad" type="range" min="50" max="500" step="50" value={marginM} onChange={e => onMargin(Number(e.target.value))} /></label>
    <p className="fine">«Hacia» indica el destino del viento, no su procedencia meteorológica. El viento solo aplica un sesgo gráfico al avance base. El margen no es una distancia de seguridad oficial.</p>
    <h3>Exposición de los puntos de encuentro</h3>
    <div className="cop-list">{SAFE_ZONES.map(zone => {
      const exposure = exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)
      return <button type="button" key={zone.id} onClick={() => onFocus(zone)}><span className="exposure-dot" style={{ background: EXPOSURE_COLOR[exposure.level] }} /><span><strong>{zone.code} · {zone.name}</strong><small>{EXPOSURE_LABEL[exposure.level]}</small><small>{Number.isFinite(exposure.minute) ? `Margen alcanzado a +${Math.ceil(exposure.minute)} min · sim.` : 'Sin alcance calculado hasta +120 min'}</small></span></button>
    })}</div>
    <p className="detail-warning">Rojo: huella inicial o proximidad. Ámbar: exposición dentro del horizonte elegido. Azul: sin afectación calculada, no seguridad confirmada. El análisis sigue activo aunque ocultes la capa.</p>
    <p className="fine">El reloj de las llamadas es independiente. Los desplazamientos ficticios se detienen ante un destino o un siguiente tramo expuesto, o si no hay corredor disponible; no se redirigen automáticamente. La comparación de rutas de cada persona sirve para revisión del mando.</p>
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
    <p className="fine">Desde la posición mostrada de {citizen.name}. {citizen.locationSource === 'reference' ? 'Es una referencia residencial, no su ubicación confirmada.' : 'La posición puede ser aproximada o simulada.'}</p>
    <label className="control-label">Modo de traslado<select value={profile} onChange={e => { setProfile(e.target.value as typeof profile); setResult(null); setRequest(null); setState('') }}><option value="driving">Vehículo</option><option value="walking">A pie</option></select></label>
    <button type="button" className="cop-primary" onClick={() => { setResult(null); setChosen(''); setState('Consultando Mapbox…'); setRequest({ origin: [citizen.lng, citizen.lat], profile }) }}>Comparar rutas · Mapbox</button>
    <p className="fine">Consulta externa que consume cuota. Duración del proveedor + accesos aproximados a pie (máximo 100 m por extremo). No usa tráfico en vivo.</p>
    <p role="status" className="fine">{stale ? 'La posición o el modo ha cambiado. Vuelve a calcular.' : state}</p>
    {!stale && result && <>
      <p className="fine">{ranked.rejected} alternativas descartadas por exposición o por superar 120 min. {result.failed > 0 && `${result.failed} destinos no pudieron consultarse; comparación parcial.`} {result.unsuitable > 0 && `${result.unsuitable} respuestas sin geometría o acceso admisible.`}</p>
      {!ranked.routes.length && <p className="need-note">Sin ruta admisible entre las alternativas obtenidas. Requiere revisión humana; no se inventa un recorrido.</p>}
      <div className="cop-list">{ranked.routes.map((route, i) => <button type="button" key={route.id} aria-pressed={active?.id === route.id} onClick={() => setChosen(route.id)}><span className="route-number">{i + 1}</span><span><strong>{SAFE_ZONES.find(zone => zone.id === route.zoneId)?.name}</strong><small>{Math.ceil(route.durationSec / 60)} min estimados · {(route.distanceM / 1000).toFixed(1)} km</small><small>{i === 0 ? 'Menor tiempo entre las consultadas' : 'Alternativa'} · acceso aprox. {Math.round(route.accessM)} m</small></span></button>)}</div>
    </>}
    <p className="detail-warning">Filtro conservador hasta el mayor valor entre el horizonte elegido y la duración del trayecto. No garantiza una evacuación segura ni confirma carreteras abiertas.</p>
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
    <p className="eyebrow">CENTROS REALES · COMUNICACIONES SIMULADAS</p>
    <p className="fine">Ubicaciones aproximadas de OpenStreetMap, contrastadas con directorios cuando están disponibles. No es un inventario exhaustivo ni un estado de recursos en tiempo real.</p>
    <label className="control-label">Tipo de centro<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option>{Object.entries(CENTER_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="cop-list">{RESPONSE_CENTERS.filter(item => filter === 'all' || item.kind === filter).map(item => <button type="button" key={item.id} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><span className={`center-symbol ${item.kind}`}>{CENTER_SYMBOL[item.kind]}</span><span><strong>{item.name}</strong><small>{CENTER_LABEL[item.kind]} · disponibilidad sin verificar</small></span></button>)}</div>
    {center && <section className="center-detail">
      <h3>{center.name}</h3><p className="fine">{center.address}</p><p className="detail-warning">{center.note}</p>
      <p className="fine">Fuentes consultadas: {center.verifiedAt}. Coordenadas del recinto, no del acceso de emergencias.</p>
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
