import { haversineMeters } from './geo'
import { RESPONSE_CENTERS } from './response'
import type { ResponseCenter } from './response'
import type { Route } from './routing'
import { fetchDrivingRoute, positionAt } from './routing'
import { AGENTS } from './scenario'

export type UnitKind = 'ambulance' | 'police' | 'fire'
export type UnitStatus = 'requested' | 'en_route' | 'on_scene' | 'hold'

export const UNIT_LABEL: Record<UnitKind, string> = { ambulance: 'Ambulancia', police: 'Patrulla', fire: 'Bomberos' }
export const UNIT_COLOR: Record<UnitKind, string> = { ambulance: '#f0a6b4', police: '#8fb6f2', fire: '#eea26a' }
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  requested: 'Calculando',
  en_route: 'En camino',
  on_scene: 'En el lugar',
  hold: 'Sin acceso',
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
  kind: UnitKind
  agent: string
  origin: UnitOrigin
  target: DispatchTarget
  status: UnitStatus
  lng: number
  lat: number
  progressM: number
  requestedAt: number
  summary: string
  route?: Route
  etaSec?: number
  hold?: string
}

/** El reloj del despacho corre acelerado como el de las personas. */
const TIME_SCALE = 12
/** Velocidad de reserva si el proveedor no devuelve una duración utilizable. */
const FALLBACK_KMH = 70

function centerOrigin(centers: ResponseCenter[], kind: 'hospital' | 'fire'): UnitOrigin {
  const center = centers.find(item => item.kind === kind)
  if (!center) throw new Error(`Sin origen cartográfico para ${kind}`)
  return {
    id: center.id,
    name: center.name,
    lng: center.lng,
    lat: center.lat,
    centerId: center.id,
  }
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

export function createDispatch(kind: UnitKind, target: DispatchTarget, now: number, sequence: number, origins: Record<UnitKind, UnitOrigin> = UNIT_ORIGINS): DispatchUnit {
  if (!Number.isFinite(target.lng) || !Number.isFinite(target.lat) || Math.abs(target.lng) > 180 || Math.abs(target.lat) > 90) {
    throw new Error('Destino de despacho fuera de rango')
  }
  const origin = unitOrigin(kind, origins)
  const agent = AGENTS[sequence % AGENTS.length]
  return {
    id: `u-${sequence + 1}`,
    kind,
    agent,
    origin,
    target,
    status: 'requested',
    lng: origin.lng,
    lat: origin.lat,
    progressM: 0,
    requestedAt: now,
    summary: dispatchSummary(kind, origin, target, agent),
  }
}

function routeSpeed(route: Route) {
  const provider = route.durationSec > 0 ? route.lengthM / route.durationSec : 0
  return provider > 0 ? provider : FALLBACK_KMH * 1000 / 3600
}

/** Avanza cada medio por su carretera. Sin ruta validada no se mueve del origen. */
export function moveUnits(units: DispatchUnit[], dtSec: number): DispatchUnit[] {
  if (dtSec <= 0) return units
  return units.map((unit): DispatchUnit => {
    if (unit.status !== 'en_route' || !unit.route) return unit
    const speed = routeSpeed(unit.route)
    const progressM = unit.progressM + speed * dtSec * TIME_SCALE
    if (progressM >= unit.route.lengthM) {
      return { ...unit, progressM: unit.route.lengthM, lng: unit.target.lng, lat: unit.target.lat, status: 'on_scene', etaSec: 0 }
    }
    const [lng, lat] = positionAt(unit.route, progressM)
    return { ...unit, progressM, lng, lat, etaSec: (unit.route.lengthM - progressM) / speed }
  })
}

export function unitEta(unit: DispatchUnit) {
  if (unit.status !== 'en_route' || !unit.route) return ''
  const seconds = unit.etaSec ?? unit.route.durationSec
  return `${Math.max(1, Math.ceil(seconds / 60))} min`
}

/**
 * Consulta una carretera desde el origen del medio hasta el destino. No filtra
 * por exposición: el vehículo va hacia quien está en riesgo, no evacúa.
 */
function directRoute(id: string, from: [number, number], to: [number, number]): Route {
  const lengthM = Math.max(1, haversineMeters(...from, ...to))
  return { id, group: 'dispatch', zoneId: id, coords: [from, to], cumulative: [0, lengthM], lengthM, durationSec: lengthM / (FALLBACK_KMH * 1000 / 3600) }
}

export async function planUnitRoute(
  token: string,
  unit: DispatchUnit,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<DispatchUnit> {
  const origin: [number, number] = [unit.origin.lng, unit.origin.lat]
  const destination: [number, number] = [unit.target.lng, unit.target.lat]
  try {
    const result = await fetchDrivingRoute(token, origin, destination, `unit-${unit.id}`, signal, request, 500)
    const route = result.route ?? directRoute(`unit-${unit.id}-direct`, origin, destination)
    return { ...unit, status: 'en_route', route, etaSec: route.durationSec, hold: undefined }
  } catch (error) {
    if (signal?.aborted) throw error
    const route = directRoute(`unit-${unit.id}-direct`, origin, destination)
    return { ...unit, status: 'en_route', route, etaSec: route.durationSec, hold: undefined }
  }
}
