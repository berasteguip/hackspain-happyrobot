import { haversineMeters, routeLength } from './geo'
import { groupSize, zoneUsage } from './simulation'
import type { Citizen, Coordinate, RouteOption, SafeZone } from './types'

export type RouteResult = { options: RouteOption[]; reason?: string; serviceError?: boolean }

export function createRoutePlanner(token: string, blocked: (path: Coordinate[]) => boolean, request: typeof fetch = fetch) {
  const cache = new Map<string, RouteOption[]>()
  let serviceFault = ''
  let nextRequestAt = 0
  return async (citizen: Citizen, zones: SafeZone[], population: Citizen[], signal: AbortSignal): Promise<RouteResult> => {
    if (citizen.live || citizen.locationSource !== 'simulation' || citizen.call?.consent !== 'granted') {
      return { options: [], reason: 'No hay confirmación de ubicación y consentimiento para esta simulación.' }
    }
    if (citizen.group?.mobility === 'pickup') return { options: [], reason: 'El grupo solicita recogida. No se simula un desplazamiento autónomo.' }
    const start: Coordinate = [citizen.lng, citizen.lat]
    if (blocked([start])) return { options: [], reason: 'La posición está dentro o demasiado cerca de la huella simulada. Requiere revisión humana.' }
    const profile = citizen.group?.mobility === 'vehicle' ? 'driving' : 'walking'
    const maxDistance = profile === 'driving' ? 20_000 : citizen.group?.mobility === 'assisted' ? 2_500 : 5_000
    const candidates = zones.filter((zone) => (
      !blocked([[zone.lng, zone.lat]]) && zoneUsage(population, zone.id).reservedPeople + groupSize(citizen) <= zone.capacity
      && (citizen.group?.mobility !== 'assisted' || zone.accessible)
      && haversineMeters(...start, zone.lng, zone.lat) <= maxDistance
    )).sort((a, b) => haversineMeters(...start, a.lng, a.lat) - haversineMeters(...start, b.lng, b.lat))
    if (!candidates.length) return { options: [], reason: 'Sin punto admisible con capacidad y distancia compatibles con el grupo.' }
    const options: RouteOption[] = []
    for (const zone of candidates) {
      signal.throwIfAborted()
      if (serviceFault) return { options: [], reason: serviceFault, serviceError: true }
      const key = `${profile}:${start.join(',')}:${zone.id}`
      const cached = cache.get(key)
      if (cached) { options.push(...cached); continue }
      const end: Coordinate = [zone.lng, zone.lat]
      const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${start.join(',')};${end.join(',')}`)
      url.search = new URLSearchParams({ access_token: token, geometries: 'geojson', overview: 'full', alternatives: 'true', steps: 'false', radiuses: '40;40' }).toString()
      const waitMs = Math.max(0, nextRequestAt - Date.now())
      nextRequestAt = Math.max(Date.now(), nextRequestAt) + 250
      if (waitMs > 0) await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, waitMs)
        signal.addEventListener('abort', abort, { once: true })
      })
      signal.throwIfAborted()
      if (serviceFault) return { options: [], reason: serviceFault, serviceError: true }
      let response: Response
      try {
        response = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) })
      } catch {
        signal.throwIfAborted()
        return { options: [], reason: 'No se pudo consultar Mapbox Directions. El grupo permanece en su posición.', serviceError: true }
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) serviceFault = 'Mapbox Directions no autoriza este token. No se inventarán rutas.'
        else if (response.status === 429) serviceFault = 'Mapbox Directions ha alcanzado su límite de consultas. Rutas detenidas.'
        else serviceFault = `Mapbox Directions no está disponible (HTTP ${response.status}).`
        return { options: [], reason: serviceFault, serviceError: true }
      }
      const data = await response.json() as { code?: string; routes?: { geometry?: { coordinates?: unknown } }[] }
      if (data.code !== 'Ok' && data.code !== 'NoRoute' && data.code !== 'NoSegment') {
        return { options: [], reason: 'Respuesta de rutas no válida. Requiere revisión.', serviceError: true }
      }
      const admissible: RouteOption[] = []
      for (const route of data.routes ?? []) {
        const points = route.geometry?.coordinates
        if (!Array.isArray(points) || points.length < 2 || points.length > 20_000) continue
        if (!points.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] > -5.6 && p[0] < -4.7 && p[1] > 39.9 && p[1] < 40.6)) continue
        const path: Coordinate[] = points.map((p) => [p[0], p[1]])
        const originAccess = haversineMeters(...start, ...path[0])
        const destinationAccess = haversineMeters(...end, ...path[path.length - 1])
        if (originAccess > 40 || destinationAccess > 40) continue
        const coordinates: Coordinate[] = [start, ...path, end]
        const distanceM = routeLength(coordinates)
        if (distanceM > maxDistance || blocked(coordinates)) continue
        admissible.push({ zoneId: zone.id, coordinates, distanceM, accessM: originAccess + destinationAccess, profile })
      }
      const best = admissible.sort((a, b) => a.distanceM - b.distanceM).slice(0, 1)
      cache.set(key, best)
      options.push(...best)
    }
    return options.length ? { options: options.sort((a, b) => a.distanceM - b.distanceM) } : {
      options: [], reason: 'Las rutas consultadas cruzan la huella, exceden la distancia de la demo o no tienen un acceso cercano. Pendiente de asistencia.',
    }
  }
}
