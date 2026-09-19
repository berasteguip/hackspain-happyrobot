import { useEffect, useMemo, useState } from 'react'
import { EXPOSURE_COLOR, EXPOSURE_LABEL, exposureAt } from './fire-model'
import type { FireForecast, FireSettings } from './fire-model'
import { haversineMeters } from './geo'
import { fetchRefugeRoutes, rankRefugeRoutes } from './routing'
import type { RefugeRoute } from './routing'
import type { Settlement } from './scenario'
import { CENTER_LABEL, createNotice, NOTICE_LABEL, SITE_EMOJI, transitionNotice } from './response'
import type { ResponseCenter } from './response'
import type { DemoNotice } from './response'
import { ALERT_ACTION_LABEL, SEVERITY_LABEL } from './alerts'
import type { AlertAction, CommandAlert } from './alerts'
import { UNIT_LABEL, UNIT_STATUS_LABEL, unitEta } from './units'
import type { DispatchUnit, UnitKind } from './units'
import type { Citizen, SafeZone } from './types'

export function FireSimBar({ settings, horizon, playing, windShifted, showWind, onPlay, onShiftWind, onReset, onWind }: {
  settings: FireSettings; horizon: number; playing: boolean; windShifted: boolean; showWind: boolean
  onPlay: () => void; onShiftWind: () => void; onReset: () => void; onWind: () => void
}) {
  const status = horizon <= 0 ? 'Foco inicial' : `+${Math.round(horizon)} min`
  return <div className="sim-bar">
    <p className="sim-readout"><span><strong>{settings.windKmh} km/h</strong><small>Viento hacia {windCardinal(settings.windTowardDeg)} · demo</small></span><span role="status">{status}</span></p>
    <div className="sim-actions">
      <button type="button" className={playing ? 'is-on' : undefined} onClick={onPlay} disabled={!playing && horizon >= 120} aria-label={playing ? 'Pausar propagación' : 'Avanzar propagación'}>{playing ? 'Pausar' : 'Avanzar'}</button>
      <button type="button" className={windShifted ? 'is-on' : undefined} onClick={onShiftWind} disabled={windShifted} aria-label="Girar viento hacia el nordeste">Girar a NE</button>
      {(horizon > 0 || windShifted) && <button type="button" onClick={onReset}>Reiniciar</button>}
      <button type="button" className="sim-wind" role="switch" aria-checked={showWind} aria-label="Mostrar viento en el mapa" onClick={onWind}>Ver viento</button>
    </div>
  </div>
}

export function FireControls({ settings, horizon, playing, onPlay, onReset, showWind, onWind, onShiftWind, windShifted, marginM, forecast, onFocus, zones }: {
  settings: FireSettings; horizon: number; playing: boolean; onPlay: () => void; onReset: () => void
  showWind: boolean; onWind: () => void; onShiftWind: () => void; windShifted: boolean; marginM: number
  forecast: FireForecast; onFocus: (point: { lng: number; lat: number }) => void; zones: SafeZone[]
}) {
  return <div className="cop-content">
    <FireSimBar settings={settings} horizon={horizon} playing={playing} windShifted={windShifted} showWind={showWind} onPlay={onPlay} onShiftWind={onShiftWind} onReset={onReset} onWind={onWind} />
    <h3>Exposición</h3>
    <div className="cop-list">{zones.map(zone => {
      const exposure = exposureAt(forecast, zone.lng, zone.lat, horizon, marginM + zone.radiusM)
      return <button type="button" key={zone.id} onClick={() => onFocus(zone)}><span className="exposure-dot" style={{ background: EXPOSURE_COLOR[exposure.level] }} /><span><strong>{zone.code} · {zone.name}</strong><small>{EXPOSURE_LABEL[exposure.level]}</small></span></button>
    })}</div>
    <p className="fine">Ilustrativo. No es un pronóstico.</p>
  </div>
}

export function RefugeRoutesPanel({ citizen, token, forecast, horizon, marginM, onRoute, zones }: {
  citizen: Citizen; token: string; forecast: FireForecast; horizon: number; marginM: number; onRoute: (route: RefugeRoute | null) => void; zones: SafeZone[]
}) {
  const [profile, setProfile] = useState<'walking' | 'driving'>('driving')
  const [request, setRequest] = useState<{ origin: [number, number]; profile: 'walking' | 'driving' } | null>(null)
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchRefugeRoutes>> | null>(null)
  const [state, setState] = useState('')
  const [chosen, setChosen] = useState('')
  const stale = Boolean(request && (request.profile !== profile || haversineMeters(...request.origin, citizen.lng, citizen.lat) > 50))
  const ranked = useMemo(() => rankRefugeRoutes(result?.routes ?? [], zones, forecast, horizon, marginM), [result, zones, forecast, horizon, marginM])
  const active = stale ? null : ranked.routes.find(route => route.id === chosen) ?? ranked.routes[0] ?? null
  useEffect(() => {
    onRoute(active)
    return () => onRoute(null)
  }, [active, onRoute])
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    fetchRefugeRoutes(token, request.origin, zones, request.profile, controller.signal).then(value => {
      if (!controller.signal.aborted) { setResult(value); setState('Consulta terminada') }
    }).catch(() => { if (!controller.signal.aborted) setState('No se pudo consultar el proveedor. No se ha trazado una ruta.') })
    return () => controller.abort()
  }, [request, token, zones])
  return <section className="cop-content route-planner">
    <h3>Rutas a puntos de encuentro</h3>
    <p className="fine">Desde la posición de {citizen.name}.</p>
    <div className="segmented-control" role="group" aria-label="Modo de traslado">{(['driving', 'walking'] as const).map(mode => <button type="button" key={mode} aria-pressed={profile === mode} onClick={() => { setProfile(mode); setResult(null); setRequest(null); setState('') }}>{mode === 'driving' ? 'Vehículo' : 'A pie'}</button>)}</div>
    <button type="button" className="cop-primary" onClick={() => { setResult(null); setChosen(''); setState('Consultando Mapbox…'); setRequest({ origin: [citizen.lng, citizen.lat], profile }) }}>Comparar rutas · Mapbox</button>
    <p className="fine">Mapbox Directions. Acceso máximo 100 m.</p>
    <p role="status" className="fine">{stale ? 'La posición o el modo ha cambiado. Vuelve a calcular.' : state}</p>
    {!stale && result && <>
      <p className="fine">{ranked.rejected} alternativas descartadas por exposición o por superar 120 min. {result.failed > 0 && `${result.failed} destinos no pudieron consultarse; comparación parcial.`} {result.unsuitable > 0 && `${result.unsuitable} respuestas sin geometría o acceso admisible.`}</p>
      {result.errors.length > 0 && <p className="need-note">{result.errors.join(' · ')}</p>}
      {!ranked.routes.length && <p className="need-note">Sin ruta admisible entre las alternativas obtenidas. Requiere revisión humana; no se inventa un recorrido.</p>}
      <div className="cop-list">{ranked.routes.map((route, i) => <button type="button" key={route.id} aria-pressed={active?.id === route.id} onClick={() => setChosen(route.id)}><span className="route-number">{i + 1}</span><span><strong>{zones.find(zone => zone.id === route.zoneId)?.name}</strong><small>{Math.ceil(route.durationSec / 60)} min estimados · {(route.distanceM / 1000).toFixed(1)} km</small><small>{i === 0 ? 'Menor tiempo entre las consultadas' : 'Alternativa'} · acceso aprox. {Math.round(route.accessM)} m</small></span></button>)}</div>
    </>}
    <p className="fine">Se descartan destinos o tramos que entren en la proyección.</p>
  </section>
}

export function ResponsePanel({ selectedId, onSelect, scenario, notices, onNotices, centers, settlements }: {
  selectedId: string | null; onSelect: (id: string) => void; scenario: string
  notices: DemoNotice[]; onNotices: (value: DemoNotice[]) => void
  centers: ResponseCenter[]; settlements: Settlement[]
}) {
  const [filter, setFilter] = useState('all')
  const center = centers.find(item => item.id === selectedId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sector, setSector] = useState(settlements[0]?.name ?? '')
  const messageKey = `${selectedId}:${center?.kind === 'fire' ? sector : ''}`
  const message = drafts[messageKey] ?? (center?.kind === 'fire'
    ? `Solicitud de apoyo en el sector ${sector}. Confirmar disponibilidad y acceso.`
    : 'Preaviso de posible llegada de personas afectadas. Número, gravedad y ETA pendientes.')
  return <div className="cop-content">
    <div className="segmented-control" role="group" aria-label="Tipo de centro">{[['all', 'Todos'], ...Object.entries(CENTER_LABEL)].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="cop-list">{centers.filter(item => filter === 'all' || item.kind === filter).map(item => <button type="button" key={item.id} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><span className="site-emoji" aria-hidden="true">{SITE_EMOJI[item.kind]}</span><span><strong>{item.name}</strong><small>{CENTER_LABEL[item.kind]}</small></span></button>)}</div>
    {center && <section className="center-detail">
      <h3>{center.name}</h3><p className="fine">{center.address}</p><p className="fine">{center.note}</p>
      <p className="fine">Fuentes consultadas: {center.verifiedAt}.</p>
      <div className="source-links">{center.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div>
      <h3>{center.kind === 'fire' ? 'Preparar solicitud de apoyo' : 'Preparar preaviso sanitario'}</h3>
      {center.kind === 'fire' && <label className="control-label">Sector a valorar<select value={sector} onChange={e => setSector(e.target.value)}>{settlements.map(place => <option key={place.name}>{place.name}</option>)}</select></label>}
      <label className="control-label">Mensaje<textarea rows={6} maxLength={2000} value={message} onChange={e => setDrafts(previous => ({ ...previous, [messageKey]: e.target.value }))} /></label>
      <button type="button" className="cop-primary" disabled={!message.trim() || notices.length >= 50} onClick={() => onNotices([createNotice(center, message, scenario), ...notices])}>Crear borrador para revisión</button>
      {notices.length >= 50 && <p className="fine">Límite de 50 avisos de esta sesión alcanzado.</p>}
    </section>}
    <h3>Bandeja · {notices.length}</h3>
    <ol className="notice-list" aria-live="polite">{notices.map(notice => <li key={notice.id}>
      <strong>{centers.find(item => item.id === notice.centerId)?.name}</strong><span className={`notice-status ${notice.status}`}>{NOTICE_LABEL[notice.status]}</span><p>{notice.message}</p><time>{new Date(notice.updatedAt).toLocaleTimeString('es-ES')}</time>
      {notice.status !== 'acknowledged' && <button type="button" onClick={() => onNotices(notices.map(item => item.id === notice.id ? transitionNotice(item, item.status === 'draft' ? 'simulated' : 'acknowledged') : item))}>{notice.status === 'draft' ? 'Enviar' : 'Acusar recibo'}</button>}
    </li>)}</ol>
  </div>
}

function windCardinal(deg: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

function UnitMark({ kind }: { kind: UnitKind }) {
  if (kind === 'police') return <svg className="unit-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 10 2-5h10l2 5M4 10h16v8H4ZM6 18v3m12-3v3M7 14h2m6 0h2" /><path d="M9 2h3" stroke="#72a9ed" /><path d="M12 2h3" stroke="#e38589" /></svg>
  const symbol = kind === 'ambulance' ? 'M8 7v6m-3-3h6' : 'M8 5c3 3 4 5 4 6a4 4 0 0 1-8 0c0-2 2-3 4-6Z'
  return <svg className="unit-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M2 3h13v14H2Zm13 5h4l3 5v4h-7M6 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm15 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /><path d={symbol} /></svg>
}

export function DispatchActions({ kinds, disabled, onDispatch }: { kinds: UnitKind[]; disabled?: boolean; onDispatch: (kind: UnitKind) => void }) {
  return <div className="dispatch-actions">{kinds.map(kind => <button type="button" key={kind} className="dispatch-action" disabled={disabled} onClick={() => onDispatch(kind)}><UnitMark kind={kind} /><span>{UNIT_LABEL[kind]}</span></button>)}</div>
}

export function AlertsPanel({ alerts, units, selectedUnitId, unitsPaused, onToggleUnits, onRetryUnit, onAction, onDispatch, onFocus, onFocusUnit }: {
  alerts: CommandAlert[]
  units: DispatchUnit[]
  selectedUnitId: string | null
  unitsPaused: boolean
  onToggleUnits: () => void
  onRetryUnit: (id: string) => void
  onAction: (alert: CommandAlert, action: AlertAction) => void
  onDispatch: (alert: CommandAlert, kind: UnitKind) => void
  onFocus: (alert: CommandAlert) => void
  onFocusUnit: (id: string) => void
}) {
  const sendable = alerts.filter(alert => alert.focus || alert.citizenIds.length > 0)
  const [sendId, setSendId] = useState(sendable[0]?.id)
  const send = sendable.find(alert => alert.id === sendId) ?? sendable[0]
  const selectedUnit = units.find(unit => unit.id === selectedUnitId)
  return <div className="cop-content">
    <div className="unit-fleet-toolbar"><span className="eyebrow">Medios de demostración</span><button type="button" className="cop-secondary" aria-pressed={unitsPaused} onClick={onToggleUnits}>{unitsPaused ? 'Reanudar medios' : 'Pausar medios'}</button></div>
    <p className="fine">{units.filter(unit => unit.mission === 'patrol').length} sin asignar · {units.filter(unit => unit.mission === 'dispatch').length} asignados. {unitsPaused ? 'Movimiento en pausa.' : 'Patrullaje simulado por calles.'}</p>
    {selectedUnit && <section className="unit-detail" aria-label={`Unidad ${selectedUnit.callSign}`}><div className="unit-detail-heading"><UnitMark kind={selectedUnit.kind} /><div><strong>{selectedUnit.callSign} · {UNIT_LABEL[selectedUnit.kind]}</strong><span className={`unit-state ${selectedUnit.status}`}>{UNIT_STATUS_LABEL[selectedUnit.status]}</span></div></div><p className="fine">{selectedUnit.mission === 'patrol' ? 'Recorrido urbano · sin tarea asignada' : `Destino: ${selectedUnit.target.label}`}</p>{selectedUnit.mission === 'dispatch' && <p className="fine">{selectedUnit.summary}</p>}{selectedUnit.hold && <p className="need-note">{selectedUnit.hold}</p>}{selectedUnit.status === 'hold' && <button type="button" className="cop-secondary" onClick={() => onRetryUnit(selectedUnit.id)}>Reintentar ruta del medio</button>}<p className="fine">Posición simulada, no GPS real. La decisión del agente no está conectada.</p></section>}
    {!alerts.length && <p className="fine" role="status">Sin avisos</p>}
    <ol className="alert-list">{alerts.map(alert => (
      <li key={alert.id} className={`alert-card ${alert.severity}`}>
        <button type="button" className="alert-main" aria-pressed={send?.id === alert.id} onClick={() => { setSendId(alert.id); onFocus(alert) }}>
          <span className="alert-severity">{SEVERITY_LABEL[alert.severity]}</span>
          <strong>{alert.title}</strong>
          {alert.detail && <p>{alert.detail}</p>}
        </button>
        {alert.action && !alert.action.startsWith('dispatch-') && <button type="button" className="alert-action" onClick={() => onAction(alert, alert.action!)}>{ALERT_ACTION_LABEL[alert.action]}</button>}
      </li>
    ))}</ol>
    <h3>Enviar{send ? ` · ${send.title}` : ''}</h3>
    {send ? <DispatchActions kinds={['ambulance', 'police', 'fire']} onDispatch={kind => onDispatch(send, kind)} /> : <p className="fine">Pulsa un aviso con posición para enviar un medio.</p>}
    <h3>Medios{units.length ? ` · ${units.length}` : ''}</h3>
    {!units.length && <p className="fine">Ninguno enviado</p>}
    <div className="cop-list">{units.map(unit => {
      const eta = unitEta(unit)
      return <button type="button" key={unit.id} aria-pressed={unit.id === selectedUnitId} onClick={() => onFocusUnit(unit.id)}>
        <UnitMark kind={unit.kind} />
        <span><strong>{unit.callSign} · {UNIT_LABEL[unit.kind]}</strong><small>{UNIT_STATUS_LABEL[unit.status]}{eta ? ` · ${eta}` : ''}</small><small>{unit.mission === 'patrol' ? 'Circuito urbano · demo' : unit.target.label}</small></span>
      </button>
    })}</div>
  </div>
}
