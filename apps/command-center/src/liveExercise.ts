import type { FeatureCollection, Polygon } from 'geojson'
import type { FireScenario } from './scenario'
import type { FireSettings } from './fire-model'
import { destination } from './geo'

/** Incendio de ejercicio cerca del censo; no añade personas ni centros ficticios. */
export function liveExerciseScenario(base: FireScenario, anchor: { lng: number; lat: number } | null): FireScenario {
  if (!anchor) return { ...base, citizens: [], centers: [], safeZones: [], settlements: [] }
  const center = destination(anchor.lng, anchor.lat, 0, 650)
  const ring = Array.from({ length: 16 }, (_, index) => destination(center[0], center[1], index * 360 / 16, 180))
  ring.push([...ring[0]])
  return {
    ...base,
    id: `${base.id}-live-exercise`,
    incident: { ...base.incident, name: 'Incendio de prueba junto al censo', area: 'Ejercicio con HappyRobot', center, zoom: 14 },
    fireCells: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] },
    fires: [{ ...base.fires[0], id: 'live-exercise-fire', lng: center[0], lat: center[1] }],
    citizens: [], centers: [], safeZones: [], settlements: [],
  }
}

/** La API acepta un único Polygon: envolvente del frente inicial y su avance local. */
export function exerciseFireEvent(cells: FeatureCollection<Polygon>, projection: FeatureCollection<Polygon>, settings: FireSettings) {
  const points = [...cells.features, ...projection.features].flatMap(feature => feature.geometry.coordinates[0]).map(point => [point[0], point[1]])
  const unique = [...new Map(points.map(point => [point.join(','), point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (unique.length < 3) throw new Error('El incendio no tiene un perímetro válido.')
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const half = (vertices: number[][]) => {
    const result: number[][] = []
    for (const point of vertices) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop()
      result.push(point)
    }
    return result.slice(0, -1)
  }
  const ring = [...half(unique), ...half([...unique].reverse())]
  if (ring.length < 3) throw new Error('El incendio no tiene un perímetro válido.')
  ring.push([...ring[0]])
  return {
    perimeter: { type: 'Polygon' as const, coordinates: [ring] },
    wind: { direction_deg: (settings.windTowardDeg + 180) % 360, speed_kmh: settings.windKmh },
    spread_rate_mh: settings.spreadMPerMin * 60,
    head_bearing_deg: settings.windTowardDeg,
  }
}

export async function publishExerciseFire(key: string, event: ReturnType<typeof exerciseFireEvent>, signal?: AbortSignal) {
  if (!key.trim()) throw new Error('Introduce la clave de operador.')
  const response = await fetch('/events/fire', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify(event), signal,
  })
  if (response.status === 401) throw new Error('La clave de operador no es válida.')
  if (!response.ok) throw new Error(`No se pudo activar el incendio en la API (HTTP ${response.status}).`)
  const result = await response.json()
  if (!result || result.ok !== true) throw new Error('La API no confirmó la actualización del incendio.')
}
