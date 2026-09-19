import { bearingDeg, haversineMeters } from './geo'
import { RESPONSE_CENTERS } from './response'
import type { ResponseCenter } from './response'
import type { Route } from './routing'
import { fetchDrivingRoute, positionAt } from './routing'
import type { FireScenario } from './scenario'

export type UnitKind = 'ambulance' | 'police' | 'fire'
export type UnitStatus = 'requested' | 'patrolling' | 'en_route' | 'on_scene' | 'hold'
export type UnitMission = 'patrol' | 'dispatch'

export const UNIT_LABEL: Record<UnitKind, string> = { ambulance: 'Ambulancia', police: 'Patrulla', fire: 'Bomberos' }
export const UNIT_COLOR: Record<UnitKind, string> = { ambulance: '#f0a6b4', police: '#8fb6f2', fire: '#eea26a' }
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  requested: 'Calculando ruta',
  patrolling: 'Patrullando',
  en_route: 'En camino',
  on_scene: 'En el acceso',
  hold: 'Sin ruta · detenido',
}

export type DispatchTarget = {
  lng: number
  lat: number
  label: string
  citizenId?: string
}

export type UnitOrigin = {
  id: string
  name: string
  lng: number
  lat: number
  centerId?: string
}

export type DispatchUnit = {
  id: string
  callSign: string
  kind: UnitKind
  agent: string
  origin: UnitOrigin
  target: DispatchTarget
  mission: UnitMission
  revision: number
  patrol?: { stops: DispatchTarget[] }
  status: UnitStatus
  lng: number
  lat: number
  progressM: number
  heading: number
  requestedAt: number
  summary: string
  route?: Route
  etaSec?: number
  hold?: string
}

/** El reloj del despacho corre acelerado como el de las personas. */
const TIME_SCALE = 12
const PATROL_TIME_SCALE = 4
/** Velocidad de reserva si el proveedor no devuelve una duración utilizable. */
const FALLBACK_KMH = 70

function centerOrigin(centers: ResponseCenter[], kind: 'hospital' | 'fire'): UnitOrigin {
  const center = centers.find(item => item.kind === kind)
  if (!center) throw new Error(`Sin origen cartográfico para ${kind}`)
  return { id: center.id, name: center.name, lng: center.lng, lat: center.lat, centerId: center.id }
}

export function originsFrom(
  centers: ResponseCenter[],
  police: { id: string; name: string; lng: number; lat: number },
): Record<UnitKind, UnitOrigin> {
  return {
    ambulance: centerOrigin(centers, 'hospital'),
    fire: centerOrigin(centers, 'fire'),
    police: { id: police.id, name: police.name, lng: police.lng, lat: police.lat },
  }
}

/**
 * Orígenes del escenario de Gredos. El CECOP activo pasa los del incendio
 * seleccionado. Ningún punto es un cuartel validado ni una orden de servicio.
 */
export const UNIT_ORIGINS: Record<UnitKind, UnitOrigin> = originsFrom(RESPONSE_CENTERS, {
  id: 'arenas-sur-demo',
  name: 'Sur de Arenas',
  lng: -5.088,
  lat: 40.198,
})

export function unitOrigin(kind: UnitKind, origins: Record<UnitKind, UnitOrigin> = UNIT_ORIGINS): UnitOrigin {
  return origins[kind]
}

export function dispatchSummary(kind: UnitKind, origin: UnitOrigin, target: DispatchTarget, agent: string) {
  return `${agent} pide ${UNIT_LABEL[kind].toLowerCase()} en ${origin.name} para ${target.label}.`
}

function validateTarget(target: DispatchTarget) {
  if (!Number.isFinite(target.lng) || !Number.isFinite(target.lat) || Math.abs(target.lng) > 180 || Math.abs(target.lat) > 90 || !target.label.trim()) throw new Error('Destino de despacho fuera de rango')
}

export function createDispatch(kind: UnitKind, target: DispatchTarget, now: number, sequence: number, origins: Record<UnitKind, UnitOrigin> = UNIT_ORIGINS): DispatchUnit {
  validateTarget(target)
  const origin = unitOrigin(kind, origins)
  const agent = 'Operador · demo'
  return {
    id: `u-${sequence + 1}`, callSign: `${kind === 'police' ? 'P' : kind === 'ambulance' ? 'A' : 'B'}-${String(sequence + 1).padStart(2, '0')}`,
    kind, agent, origin, target: { ...target }, mission: 'dispatch', revision: 1,
    status: 'requested', lng: origin.lng, lat: origin.lat, progressM: 0, heading: 0, requestedAt: now,
    summary: dispatchSummary(kind, origin, target, agent),
  }
}

export function createPatrolFleet(scenario: FireScenario): DispatchUnit[] {
  const origins = originsFrom(scenario.centers, scenario.police)
  const hospital = origins.ambulance
  const candidates = [scenario.police, scenario.safeZones[0], hospital, ...scenario.safeZones.slice(1)].filter(Boolean)
  const anchors = candidates.filter((point, index) => candidates.slice(0, index).every(other => haversineMeters(point.lng, point.lat, other.lng, other.lat) > 50))
  if (anchors.length < 3) return []
  return (['police', 'police', 'ambulance', 'ambulance'] as const).map((kind, index) => {
    const stops = [0, 1, 2].map(step => {
      const point = anchors[(index + step) % anchors.length]
      return { lng: point.lng, lat: point.lat, label: point.name }
    })
    const unit = createDispatch(kind, stops[1], 0, index, origins)
    return {
      ...unit, id: `${scenario.id}-patrol-${kind}-${index % 2 + 1}`,
      callSign: `${kind === 'police' ? 'P' : 'A'}-0${index % 2 + 1}`,
      mission: 'patrol', agent: 'Patrullaje simulado', patrol: { stops }, lng: stops[0].lng, lat: stops[0].lat,
      summary: 'Circuito de demostración por calles. Disponible para una asignación manual; sin decisión de agente conectada.',
    }
  })
}

export function redirectUnit(unit: DispatchUnit, target: DispatchTarget, now: number, requestedBy = 'Operador · demo'): DispatchUnit {
  validateTarget(target)
  return {
    ...unit, target: { ...target }, mission: 'dispatch', revision: unit.revision + 1, requestedAt: now,
    agent: requestedBy, status: 'requested', route: undefined, etaSec: undefined, hold: undefined, progressM: 0,
    summary: `${requestedBy} redirige ${unit.callSign} desde su posición actual hacia ${target.label}.`,
  }
}

export function retryUnitRoute(unit: DispatchUnit): DispatchUnit {
  return { ...unit, revision: unit.revision + 1, status: 'requested', route: undefined, etaSec: undefined, hold: undefined, progressM: 0 }
}

export function pickAvailableUnit(units: DispatchUnit[], kind: UnitKind, target: DispatchTarget): DispatchUnit | undefined {
  return units.filter(unit => unit.kind === kind && unit.mission === 'patrol')
    .sort((a, b) => haversineMeters(a.lng, a.lat, target.lng, target.lat) - haversineMeters(b.lng, b.lat, target.lng, target.lat))[0]
}

export function applyUnitPlan(units: DispatchUnit[], planned: DispatchUnit): DispatchUnit[] {
  return units.map(unit => unit.id === planned.id && unit.revision === planned.revision && unit.status === 'requested' ? planned : unit)
}

export function routeHeading(route: Route, progressM: number, loop = false): number {
  if (route.lengthM <= 0) return 0
  const look = Math.min(8, route.lengthM / 4)
  const distance = (value: number) => loop ? (value % route.lengthM + route.lengthM) % route.lengthM : Math.max(0, Math.min(route.lengthM, value))
  return bearingDeg(...positionAt(route, distance(progressM - look)), ...positionAt(route, distance(progressM + look)))
}

function routeSpeed(route: Route) {
  const provider = route.durationSec > 0 ? route.lengthM / route.durationSec : 0
  return provider > 0 ? provider : FALLBACK_KMH * 1000 / 3600
}

/** Avanza cada medio por su carretera. Sin ruta validada no se mueve del origen. */
export function moveUnits(units: DispatchUnit[], dtSec: number): DispatchUnit[] {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return units
  return units.map((unit): DispatchUnit => {
    if (!['en_route', 'patrolling'].includes(unit.status) || !unit.route || unit.route.lengthM <= 0) return unit
    const speed = routeSpeed(unit.route)
    let progressM = unit.progressM + speed * dtSec * (unit.mission === 'patrol' ? PATROL_TIME_SCALE : TIME_SCALE)
    if (unit.mission === 'patrol') progressM %= unit.route.lengthM
    else if (progressM >= unit.route.lengthM) {
      const [lng, lat] = positionAt(unit.route, unit.route.lengthM)
      return { ...unit, progressM: unit.route.lengthM, lng, lat, heading: routeHeading(unit.route, unit.route.lengthM), status: 'on_scene', etaSec: 0 }
    }
    const [lng, lat] = positionAt(unit.route, progressM)
    return { ...unit, progressM, lng, lat, heading: routeHeading(unit.route, progressM, unit.mission === 'patrol'), etaSec: unit.mission === 'patrol' ? undefined : (unit.route.lengthM - progressM) / speed }
  })
}

export function unitEta(unit: DispatchUnit) {
  if (unit.status !== 'en_route' || !unit.route) return ''
  const seconds = unit.etaSec ?? unit.route.durationSec
  return `${Math.max(1, Math.ceil(seconds / 60))} min`
}

async function patrolRoute(token: string, unit: DispatchUnit, signal: AbortSignal | undefined, request: typeof fetch): Promise<{ route?: Route; error?: string }> {
  const stops = unit.patrol?.stops
  if (!stops || stops.length < 3) return { error: 'Sin circuito de patrullaje.' }
  const coords: [number, number][] = []
  let durationSec = 0
  let from: [number, number] = [unit.lng, unit.lat]
  for (let i = 1; i <= stops.length; i++) {
    signal?.throwIfAborted()
    const to: [number, number] = i === stops.length && coords.length ? coords[0] : [stops[i % stops.length].lng, stops[i % stops.length].lat]
    const result = await fetchDrivingRoute(token, from, to, `patrol-${unit.id}-${i}`, signal, request, 100, true)
    if (!result.route || result.route.lengthM <= 0) return { error: result.error ?? 'Tramo de patrullaje sin recorrido.' }
    const road = result.route
    if (coords.length && haversineMeters(...coords[coords.length - 1], ...road.coords[0]) > 2) return { error: 'Los tramos de carretera no conectan. Requiere revisión.' }
    coords.push(...(coords.length ? road.coords.slice(1) : road.coords))
    durationSec += road.durationSec
    from = road.coords[road.coords.length - 1]
  }
  if (haversineMeters(...coords[0], ...coords[coords.length - 1]) > 2) return { error: 'El circuito no cierra por carretera. Requiere revisión.' }
  coords[coords.length - 1] = [...coords[0]]
  const cumulative = [0]
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + haversineMeters(...coords[i - 1], ...coords[i]))
  return { route: { id: `patrol-${unit.id}`, group: 'patrol', zoneId: unit.id, coords, cumulative, lengthM: cumulative[cumulative.length - 1], durationSec } }
}

/**
 * Consulta una carretera desde el origen del medio hasta el destino. No filtra
 * por exposición: el vehículo va hacia quien está en riesgo, no evacúa.
 */
export async function planUnitRoute(
  token: string,
  unit: DispatchUnit,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<DispatchUnit> {
  signal?.throwIfAborted()
  const result = unit.mission === 'patrol'
    ? await patrolRoute(token, unit, signal, request)
    : await fetchDrivingRoute(token, [unit.lng, unit.lat], [unit.target.lng, unit.target.lat], `unit-${unit.id}-${unit.revision}`, signal, request, 100, true)
  if (!result.route || result.route.lengthM <= 0) return { ...unit, status: 'hold', route: undefined, etaSec: undefined, hold: result.error ?? 'Sin carretera disponible. El medio permanece detenido.' }
  const route = result.route
  const [lng, lat] = route.coords[0]
  return { ...unit, status: unit.mission === 'patrol' ? 'patrolling' : 'en_route', route, lng, lat, heading: routeHeading(route, 0, unit.mission === 'patrol'), progressM: 0, etaSec: unit.mission === 'patrol' ? undefined : route.durationSec, hold: undefined }
}
