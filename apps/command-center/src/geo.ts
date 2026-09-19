import type { FeatureCollection, Polygon } from 'geojson'
import type { Coordinate } from './types'

const R = 6_371_000

export function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function toDeg(rad: number) {
  return (rad * 180) / Math.PI
}

export function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
) {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lng2 - lng1)
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingDeg(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
) {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function destination(
  lng: number,
  lat: number,
  bearing: number,
  distM: number,
): [number, number] {
  const δ = distM / R
  const θ = toRad(bearing)
  const φ1 = toRad(lat)
  const λ1 = toRad(lng)
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return [toDeg(λ2), toDeg(φ2)]
}

export function pointInRing(lng: number, lat: number, ring: number[][]) {
  const last = ring[ring.length - 1]
  const closed = last && last[0] === ring[0][0] && last[1] === ring[0][1]
  const verts = closed ? ring.slice(0, -1) : ring
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i][0]
    const yi = verts[i][1]
    const xj = verts[j][0]
    const yj = verts[j][1]
    const crosses = yi > lat !== yj > lat
    if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function nearestZone<T extends { lng: number; lat: number }>(
  lng: number,
  lat: number,
  zones: T[],
) {
  let best = zones[0]
  let bestD = Infinity
  for (const zone of zones) {
    const d = haversineMeters(lng, lat, zone.lng, zone.lat)
    if (d < bestD) {
      best = zone
      bestD = d
    }
  }
  return { zone: best, distanceM: bestD }
}

export function routeLength(coordinates: Coordinate[]) {
  return coordinates.slice(1).reduce((distance, point, index) => distance + haversineMeters(...coordinates[index], ...point), 0)
}

export function positionAlongRoute(coordinates: Coordinate[], distanceM: number): Coordinate {
  if (!coordinates.length) throw new Error('Empty route')
  let remaining = Math.max(0, distanceM)
  for (let i = 1; i < coordinates.length; i += 1) {
    const start = coordinates[i - 1]
    const end = coordinates[i]
    const length = haversineMeters(...start, ...end)
    if (length > 0 && remaining < length) {
      const t = remaining / length
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
    }
    remaining -= length
  }
  return [...coordinates[coordinates.length - 1]]
}

export function createFireChecker(fire: FeatureCollection<Polygon>, marginM = 35) {
  type Box = { minX: number; maxX: number; minY: number; maxY: number }
  const project = ([lng, lat]: Coordinate): Coordinate => [lng * 111_320 * Math.cos(toRad(40.24)), lat * 111_320]
  const buckets = new Map<string, Box[]>()
  const bucketSize = 150
  for (const feature of fire.features) {
    const ring = feature.geometry.coordinates[0].map((point) => project(point as Coordinate))
    const box = {
      minX: Math.min(...ring.map(([x]) => x)) - marginM,
      maxX: Math.max(...ring.map(([x]) => x)) + marginM,
      minY: Math.min(...ring.map(([, y]) => y)) - marginM,
      maxY: Math.max(...ring.map(([, y]) => y)) + marginM,
    }
    for (let x = Math.floor(box.minX / bucketSize); x <= Math.floor(box.maxX / bucketSize); x += 1) {
      for (let y = Math.floor(box.minY / bucketSize); y <= Math.floor(box.maxY / bucketSize); y += 1) {
        const key = `${x}:${y}`
        const list = buckets.get(key) ?? []
        list.push(box)
        buckets.set(key, list)
      }
    }
  }
  const intersects = (a: Coordinate, b: Coordinate, box: Box) => {
    let enter = 0
    let exit = 1
    for (const [origin, delta, min, max] of [[a[0], b[0] - a[0], box.minX, box.maxX], [a[1], b[1] - a[1], box.minY, box.maxY]]) {
      if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return false; continue }
      const t1 = (min - origin) / delta
      const t2 = (max - origin) / delta
      enter = Math.max(enter, Math.min(t1, t2))
      exit = Math.min(exit, Math.max(t1, t2))
      if (enter > exit) return false
    }
    return true
  }
  return (coordinates: Coordinate[]) => {
    const points = coordinates.map(project)
    if (points.length === 1) points.push(points[0])
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      const checked = new Set<Box>()
      for (let x = Math.floor(Math.min(a[0], b[0]) / bucketSize); x <= Math.floor(Math.max(a[0], b[0]) / bucketSize); x += 1) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / bucketSize); y <= Math.floor(Math.max(a[1], b[1]) / bucketSize); y += 1) {
          for (const box of buckets.get(`${x}:${y}`) ?? []) {
            if (checked.has(box)) continue
            checked.add(box)
            if (intersects(a, b, box)) return true
          }
        }
      }
    }
    return false
  }
}
