import { haversineMeters } from './geo'

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
