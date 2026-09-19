import { haversineMeters } from './geo'
import { exposureAt, initialFireClearance, MAX_FORECAST_MIN, routeApproachesFire, routeBlocked } from './fire-model'
import type { FireForecast } from './fire-model'
import type { Citizen, SafeZone } from './types'

export type Corridor = {
  id: string
  group: string
  zoneId: string
  from: [number, number]
  to: [number, number]
}

export type Route = {
  id: string
  group: string
  zoneId: string
  coords: [number, number][]
  cumulative: number[]
  lengthM: number
  durationSec: number
}

export type RouteIndex = Map<string, Route>

const DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving'
const CONCURRENCY = 4

function buildRoute(corridor: Corridor, coords: [number, number][], durationSec: number): Route {
  const cumulative = [0]
  for (let i = 1; i < coords.length; i += 1) {
    const previous = coords[i - 1]
    const current = coords[i]
    cumulative.push(cumulative[i - 1] + haversineMeters(previous[0], previous[1], current[0], current[1]))
  }
  return {
    id: corridor.id,
    group: corridor.group,
    zoneId: corridor.zoneId,
    coords,
    cumulative,
    lengthM: cumulative[cumulative.length - 1],
    durationSec,
  }
}

async function fetchCorridor(token: string, corridor: Corridor, signal?: AbortSignal): Promise<Route | null> {
  const pair = `${corridor.from[0]},${corridor.from[1]};${corridor.to[0]},${corridor.to[1]}`
  const url = `${DIRECTIONS}/${pair}?geometries=geojson&overview=full&access_token=${token}`
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) return null
  const payload = await response.json()
  const result = payload?.routes?.[0]
  const coords = result?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2 || !coords.every((point: unknown) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90) || !Number.isFinite(result.duration) || result.duration < 0) return null
  const coordinates = coords as [number, number][]
  const endM = haversineMeters(...coordinates[coordinates.length - 1], ...corridor.to)
  if (haversineMeters(...coordinates[0], ...corridor.from) > 100 || endM > 100) return null
  return buildRoute(corridor, [...coordinates, corridor.to], result.duration + endM / (4000 / 3600))
}

/** Resolves road geometry for every corridor. Failures are skipped so the demo still runs offline. */
export async function loadCorridorRoutes(
  token: string,
  corridors: Corridor[],
  signal?: AbortSignal,
): Promise<RouteIndex> {
  const index: RouteIndex = new Map()
  let cursor = 0
  const worker = async () => {
    while (cursor < corridors.length) {
      if (signal?.aborted) return
      const corridor = corridors[cursor]
      cursor += 1
      try {
        const route = await fetchCorridor(token, corridor, signal)
        if (route) index.set(route.id, route)
      } catch {
        // A missing corridor only means those people fall back to a direct heading.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, corridors.length) }, worker))
  return index
}

/**
 * Se queda con el punto de encuentro más corto por carretera para cada núcleo y
 * descarta los corredores del resto. Devuelve la asignación núcleo → zona.
 */
export function resolveGroupZones(routes: RouteIndex): Map<string, string> {
  const shortest = new Map<string, { zoneId: string; lengthM: number }>()
  for (const route of routes.values()) {
    const current = shortest.get(route.group)
    if (!current || route.lengthM < current.lengthM) {
      shortest.set(route.group, { zoneId: route.zoneId, lengthM: route.lengthM })
    }
  }
  for (const [id, route] of routes) {
    if (shortest.get(route.group)?.zoneId !== route.zoneId) routes.delete(id)
  }
  return new Map([...shortest].map(([group, best]) => [group, best.zoneId]))
}

export function nearestOnRoute(route: Route, lng: number, lat: number) {
  let alongM = 0
  let gapM = Infinity
  const scale = Math.cos(lat * Math.PI / 180)
  for (let i = 1; i < route.coords.length; i += 1) {
    const [ax, ay] = route.coords[i - 1]
    const [bx, by] = route.coords[i]
    const dx = (bx - ax) * scale
    const dy = by - ay
    const length = dx * dx + dy * dy
    const fraction = length ? Math.max(0, Math.min(1, ((lng - ax) * scale * dx + (lat - ay) * dy) / length)) : 0
    const gap = haversineMeters(lng, lat, ax + (bx - ax) * fraction, ay + (by - ay) * fraction)
    if (gap < gapM) {
      gapM = gap
      alongM = route.cumulative[i - 1] + (route.cumulative[i] - route.cumulative[i - 1]) * fraction
    }
  }
  return { alongM, gapM }
}

export function positionAt(route: Route, alongM: number): [number, number] {
  if (alongM <= 0) return route.coords[0]
  if (alongM >= route.lengthM) return route.coords[route.coords.length - 1]
  let low = 0
  let high = route.cumulative.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (route.cumulative[mid] <= alongM) low = mid
    else high = mid
  }
  const span = route.cumulative[high] - route.cumulative[low]
  const ratio = span > 0 ? (alongM - route.cumulative[low]) / span : 0
  const [fromLng, fromLat] = route.coords[low]
  const [toLng, toLat] = route.coords[high]
  return [fromLng + (toLng - fromLng) * ratio, fromLat + (toLat - fromLat) * ratio]
}

export type RefugeRoute = {
  id: string
  zoneId: string
  coordinates: [number, number][]
  durationSec: number
  distanceM: number
  accessM: number
}

export async function fetchRefugeRoutes(
  token: string,
  origin: [number, number],
  zones: SafeZone[],
  profile: 'walking' | 'driving',
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<{ routes: RefugeRoute[]; failed: number; unsuitable: number }> {
  const results = await Promise.all(zones.map(async zone => {
    try {
      const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${origin.join(',')};${zone.lng},${zone.lat}`)
      url.search = new URLSearchParams({ access_token: token, geometries: 'geojson', overview: 'full', alternatives: 'true' }).toString()
      const timeout = AbortSignal.timeout(12000)
      const response = await request(url.toString(), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
      if (!response.ok) return { routes: [], failed: 1, unsuitable: 0 }
      const payload = await response.json()
      if (!Array.isArray(payload.routes)) return { routes: [], failed: 1, unsuitable: 0 }
      const routes: RefugeRoute[] = []
      let unsuitable = 0
      for (const [i, route] of payload.routes.entries()) {
        const coords = route?.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2 || !coords.every((point: unknown) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90) || !Number.isFinite(route.duration) || route.duration < 0 || !Number.isFinite(route.distance) || route.distance < 0) {
          unsuitable += 1
          continue
        }
        const coordinates = coords as [number, number][]
        const start = coordinates[0]
        const end = coordinates[coordinates.length - 1]
        const startM = haversineMeters(...origin, ...start)
        const endM = haversineMeters(...end, zone.lng, zone.lat)
        if (startM > 100 || endM > 100) {
          unsuitable += 1
          continue
        }
        const accessM = startM + endM
        routes.push({ id: `${zone.id}-${i}`, zoneId: zone.id, coordinates: [origin, ...coordinates, [zone.lng, zone.lat]], durationSec: route.duration + accessM / (4000 / 3600), distanceM: route.distance + accessM, accessM })
      }
      return { routes, failed: 0, unsuitable }
    } catch (error) {
      if (signal?.aborted) throw error
      return { routes: [], failed: 1, unsuitable: 0 }
    }
  }))
  return { routes: results.flatMap(result => result.routes), failed: results.reduce((sum, result) => sum + result.failed, 0), unsuitable: results.reduce((sum, result) => sum + result.unsuitable, 0) }
}

export function rankRefugeRoutes(routes: RefugeRoute[], zones: SafeZone[], forecast: FireForecast, horizon: number, marginM: number) {
  const admitted = routes.filter(route => {
    const zone = zones.find(item => item.id === route.zoneId)
    const throughMinute = Math.max(60, horizon, Math.ceil(route.durationSec / 60))
    return zone && throughMinute <= MAX_FORECAST_MIN
      && exposureAt(forecast, zone.lng, zone.lat, throughMinute, marginM + zone.radiusM).level === 'clear'
      && !routeBlocked(forecast, route.coordinates, throughMinute, marginM)
      && !routeApproachesFire(forecast, route.coordinates)
  }).sort((a, b) => a.durationSec - b.durationSec)
  return { routes: admitted, rejected: routes.length - admitted.length }
}

export function assignEvacuationRoutes(citizens: Citizen[], routes: RouteIndex, zones: SafeZone[], forecast: FireForecast, marginM: number): Citizen[] {
  const candidates = [...routes.values()].map(route => ({ id: route.id, zoneId: route.zoneId, coordinates: route.coords, durationSec: route.durationSec, distanceM: route.lengthM, accessM: 0 }))
  const admitted = new Set(rankRefugeRoutes(candidates, zones, forecast, 60, marginM).routes.map(route => route.id))
  const byGroup = new Map<string, Route[]>()
  for (const route of routes.values()) {
    if (!admitted.has(route.id)) continue
    const group = byGroup.get(route.group) ?? []
    group.push(route)
    byGroup.set(route.group, group)
  }
  return citizens.map(citizen => {
    if (citizen.live || citizen.status === 'safe') return citizen
    let best: { route: Route; alongM: number; durationSec: number } | undefined
    const origin: [number, number] = [citizen.lng, citizen.lat]
    const clearance = initialFireClearance(forecast, ...origin)
    for (const route of byGroup.get(citizen.locality ?? '') ?? []) {
      const zone = zones.find(item => item.id === route.zoneId)!
      if (initialFireClearance(forecast, zone.lng, zone.lat) + 1 < clearance) continue
      const { alongM, gapM } = nearestOnRoute(route, ...origin)
      if (gapM > 100) continue
      const access: [number, number][] = [origin, positionAt(route, alongM)]
      if (routeBlocked(forecast, access, Math.max(60, Math.ceil(route.durationSec / 60)), marginM) || routeApproachesFire(forecast, access)) continue
      const durationSec = route.durationSec * (1 - alongM / Math.max(1, route.lengthM)) + gapM / (4000 / 3600)
      if (!best || durationSec < best.durationSec) best = { route, alongM, durationSec }
    }
    if (!best) return { ...citizen, safeZoneId: '', routeId: undefined, routeProgressM: undefined, routePhase: undefined, routeHoldReason: 'Sin recorrido que evite acercarse al fuego en la próxima hora. Pendiente de revisión del mando.', status: ['tracking', 'evacuating', 'assistance'].includes(citizen.status) ? 'assistance' : citizen.status }
    return { ...citizen, safeZoneId: best.route.zoneId, routeId: best.route.id, routeProgressM: best.alongM, routePhase: 'access', routeHoldReason: undefined, status: citizen.status === 'assistance' ? 'tracking' : citizen.status }
  })
}
