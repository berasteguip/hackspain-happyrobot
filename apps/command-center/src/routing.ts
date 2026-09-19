import { haversineMeters } from './geo'
import { exposureAt, MAX_FORECAST_MIN, routeBlocked } from './fire-model'
import type { FireForecast } from './fire-model'
import type { SafeZone } from './types'

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
}

export type RouteIndex = Map<string, Route>

const DIRECTIONS = 'https://api.mapbox.com/directions/v5/mapbox/driving'
const CONCURRENCY = 4

function buildRoute(corridor: Corridor, coords: [number, number][]): Route {
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
  }
}

async function fetchCorridor(token: string, corridor: Corridor, signal?: AbortSignal): Promise<Route | null> {
  const pair = `${corridor.from[0]},${corridor.from[1]};${corridor.to[0]},${corridor.to[1]}`
  const url = `${DIRECTIONS}/${pair}?geometries=geojson&overview=full&access_token=${token}`
  const response = await fetch(url, { signal })
  if (!response.ok) return null
  const payload = await response.json()
  const coords = payload?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  return buildRoute(corridor, coords as [number, number][])
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
  let index = 0
  let gapM = Infinity
  for (let i = 0; i < route.coords.length; i += 1) {
    const gap = haversineMeters(lng, lat, route.coords[i][0], route.coords[i][1])
    if (gap < gapM) {
      gapM = gap
      index = i
    }
  }
  return { alongM: route.cumulative[index], gapM }
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
    const throughMinute = Math.max(horizon, Math.ceil(route.durationSec / 60))
    return zone && throughMinute <= MAX_FORECAST_MIN
      && exposureAt(forecast, zone.lng, zone.lat, throughMinute, marginM + zone.radiusM).level === 'clear'
      && !routeBlocked(forecast, route.coordinates, throughMinute, marginM)
  }).sort((a, b) => a.durationSec - b.durationSec)
  return { routes: admitted, rejected: routes.length - admitted.length }
}
