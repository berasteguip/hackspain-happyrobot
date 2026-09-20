import { exposureAt } from './fire-model'
import type { FireForecast } from './fire-model'
import { SAFE_ZONES, SETTLEMENTS } from './scenario'
import type { Settlement } from './scenario'
import type { Citizen, SafeZone } from './types'

export type AlertKind = 'wind-shift' | 'fire-spread' | 'route-cut' | 'stalled' | 'no-answer'
export type AlertSeverity = 'critical' | 'warning' | 'info'
/** Acción que el mando puede lanzar desde el aviso. Ninguna se ejecuta sola. */
export type AlertAction = 'call-area' | 'dispatch-police' | 'dispatch-ambulance' | 'dispatch-fire' | 'review-routes'

export type CommandAlert = {
  id: string
  kind: AlertKind
  severity: AlertSeverity
  title: string
  detail: string
  ts: number
  citizenIds: string[]
  focus?: { lng: number; lat: number }
  radiusM?: number
  action?: AlertAction
}

/** Memoria de lo ya avisado: los detectores solo emiten cambios, no el estado. */
export type AlertWatch = {
  seq: number
  wind: number
  exposed: Set<string>
  cut: Set<string>
  stalled: Set<string>
  silent: Set<string>
}

export type AlertInput = {
  citizens: Citizen[]
  forecast: FireForecast
  marginM: number
  horizon: number
  windTowardDeg: number
  campaignIds: ReadonlySet<string>
  now: number
  settlements?: Settlement[]
  safeZones?: SafeZone[]
}

const MAX_ALERTS = 60

function lookAhead(horizon: number) {
  return Number.isFinite(horizon) && horizon > 0 ? horizon : 0
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Crítico', warning: 'Atención', info: 'Info',
}
export const ALERT_ACTION_LABEL: Record<AlertAction, string> = {
  'call-area': 'Llamar zona',
  'dispatch-police': 'Patrulla',
  'dispatch-ambulance': 'Ambulancia',
  'dispatch-fire': 'Bomberos',
  'review-routes': 'Ver rutas',
}

type Place = {
  id: string
  name: string
  lng: number
  lat: number
  marginM: number
  radiusM: number
  settlement: boolean
}

function places(input: AlertInput): Place[] {
  const settlements = input.settlements ?? SETTLEMENTS
  const zones = input.safeZones ?? SAFE_ZONES
  return [
    ...settlements.map(place => ({
      id: `nucleo-${place.name}`, name: place.name, lng: place.lng, lat: place.lat,
      marginM: input.marginM + place.radiusM, radiusM: place.radiusM, settlement: true,
    })),
    ...zones.map(zone => ({
      id: `refugio-${zone.id}`, name: zone.name, lng: zone.lng, lat: zone.lat,
      marginM: input.marginM + zone.radiusM, radiusM: zone.radiusM, settlement: false,
    })),
  ]
}

function exposedPlaces(input: AlertInput) {
  const result = new Map<string, { place: Place; minute: number }>()
  for (const place of places(input)) {
    const exposure = exposureAt(input.forecast, place.lng, place.lat, lookAhead(input.horizon), place.marginM)
    if (exposure.level !== 'clear') result.set(place.id, { place, minute: exposure.minute })
  }
  return result
}

function centroid(citizens: Citizen[]) {
  if (!citizens.length) return undefined
  const lng = citizens.reduce((sum, citizen) => sum + citizen.lng, 0) / citizens.length
  const lat = citizens.reduce((sum, citizen) => sum + citizen.lat, 0) / citizens.length
  return { lng, lat }
}

function localities(citizens: Citizen[]) {
  return [...new Set(citizens.map(citizen => citizen.locality).filter(Boolean))].join(', ')
}

/**
 * Estado de partida: lo que ya está expuesto al abrir no se anuncia como novedad.
 */
export function initialWatch(input: AlertInput): AlertWatch {
  return {
    seq: 0,
    wind: input.windTowardDeg,
    exposed: new Set(exposedPlaces(input).keys()),
    cut: new Set(),
    stalled: new Set(),
    silent: new Set(),
  }
}

/**
 * Compara el estado actual con lo ya avisado y devuelve solo los cambios. No
 * decide nada por el mando: cada aviso propone una acción que él dispara.
 */
export function detectAlerts(input: AlertInput, watch: AlertWatch): { alerts: CommandAlert[]; watch: AlertWatch } {
  const alerts: CommandAlert[] = []
  const next: AlertWatch = {
    seq: watch.seq,
    wind: input.windTowardDeg,
    exposed: new Set(watch.exposed),
    cut: new Set(watch.cut),
    stalled: new Set(watch.stalled),
    silent: new Set(watch.silent),
  }
  const push = (alert: Omit<CommandAlert, 'id' | 'ts'>) => {
    next.seq += 1
    alerts.push({ ...alert, id: `${alert.kind}-${next.seq}`, ts: input.now })
  }
  const inCampaign = input.citizens.filter(citizen => !citizen.live && input.campaignIds.has(citizen.id))

  if (Number.isFinite(input.windTowardDeg) && input.windTowardDeg !== watch.wind) {
    const ahead = Math.max(60, lookAhead(input.horizon))
    const uncalled = input.citizens.filter(citizen => !citizen.live && citizen.status === 'pending'
      && exposureAt(input.forecast, citizen.lng, citizen.lat, ahead, input.marginM).level !== 'clear')
    push({
      kind: 'wind-shift',
      severity: uncalled.length ? 'critical' : 'warning',
      title: `Viento ${Math.round(input.windTowardDeg)}°`,
      detail: uncalled.length ? `${uncalled.length} sin contactar · ${localities(uncalled)}` : 'Sin personas nuevas en riesgo',
      citizenIds: uncalled.map(citizen => citizen.id),
      focus: centroid(uncalled),
      radiusM: uncalled.length ? 1200 : undefined,
      action: uncalled.length ? 'call-area' : undefined,
    })
  }

  for (const [placeId, { place, minute }] of exposedPlaces(input)) {
    if (watch.exposed.has(placeId)) continue
    next.exposed.add(placeId)
    const inside = input.citizens.filter(citizen => !citizen.live && citizen.locality === place.name
      && citizen.status !== 'safe')
    const when = minute === 0 ? 'Dentro ahora' : `+${minute} min`
    push({
      kind: 'fire-spread',
      severity: place.settlement && inside.length ? 'critical' : 'warning',
      title: place.name,
      detail: place.settlement ? `${when} · ${inside.length} personas` : `${when} · refugio`,
      citizenIds: inside.map(citizen => citizen.id),
      focus: { lng: place.lng, lat: place.lat },
      radiusM: place.settlement ? Math.max(900, place.radiusM * 2) : undefined,
      action: place.settlement ? (inside.some(citizen => citizen.status === 'pending') ? 'call-area' : 'review-routes') : 'review-routes',
    })
  }

  const held = inCampaign.filter(citizen => citizen.status === 'assistance')
  const stalled = held.filter(citizen => citizen.routePhase && !next.stalled.has(citizen.id))
  const cut = held.filter(citizen => !citizen.routePhase && !next.cut.has(citizen.id))
  for (const citizen of stalled) next.stalled.add(citizen.id)
  for (const citizen of cut) next.cut.add(citizen.id)
  if (stalled.length) {
    push({
      kind: 'stalled',
      severity: 'critical',
      title: `${stalled.length} detenidas en ruta`,
      detail: localities(stalled),
      citizenIds: stalled.map(citizen => citizen.id),
      focus: centroid(stalled),
      action: 'dispatch-ambulance',
    })
  }
  if (cut.length) {
    push({
      kind: 'route-cut',
      severity: 'warning',
      title: `${cut.length} sin ruta`,
      detail: localities(cut),
      citizenIds: cut.map(citizen => citizen.id),
      focus: centroid(cut),
      action: 'review-routes',
    })
  }

  const silent = inCampaign.filter(citizen => citizen.status === 'no_answer' && !next.silent.has(citizen.id))
  for (const citizen of silent) next.silent.add(citizen.id)
  if (silent.length) {
    push({
      kind: 'no-answer',
      severity: 'warning',
      title: `${silent.length} sin respuesta`,
      detail: localities(silent),
      citizenIds: silent.map(citizen => citizen.id),
      focus: centroid(silent),
      action: 'dispatch-police',
    })
  }

  return { alerts, watch: next }
}

export function mergeAlerts(previous: CommandAlert[], incoming: CommandAlert[]) {
  return [...incoming].reverse().concat(previous).slice(0, MAX_ALERTS)
}
