const R = 6_371_000

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number) {
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
