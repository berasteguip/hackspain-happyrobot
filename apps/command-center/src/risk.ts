import type { FeatureCollection, Polygon } from 'geojson'
import { destination, haversineMeters } from './geo'
import { forecastGeo } from './fire-model'
import type { FireForecast } from './fire-model'
import type { CallArea } from './types'

export type RecommendedAreas = {
  /** Quien está junto al fuego ahora: es a quien hay que llamar primero. */
  risk: CallArea
  /** Hasta dónde puede llegar el frente en una hora con el viento actual. */
  affected: CallArea
  affectedMinutes: number
}

const RISK_MARGIN_M = 500
/** Ninguna zona de riesgo baja de esto: a menos de un kilómetro de un frente se avisa a todos. */
const RISK_MIN_RADIUS_M = 1000
const AFFECTED_MARGIN_M = 400
const AFFECTED_MINUTES = 60
const MAX_RADIUS_M = 20000

function enclosingCircle(footprint: FeatureCollection<Polygon>, marginM: number, bias?: { bearing: number; fraction: number }, minRadiusM = 50): CallArea | null {
  const points = footprint.features.flatMap(feature => feature.geometry.coordinates[0] ?? [])
  if (!points.length) return null
  const centroid = points.reduce((acc, [lng, lat]) => ({ lng: acc.lng + lng / points.length, lat: acc.lat + lat / points.length }), { lng: 0, lat: 0 })
  const reach = Math.max(...points.map(([lng, lat]) => haversineMeters(centroid.lng, centroid.lat, lng, lat)))
  const [lng, lat] = bias ? destination(centroid.lng, centroid.lat, bias.bearing, reach * bias.fraction) : [centroid.lng, centroid.lat]
  const shifted = bias ? Math.max(...points.map(([x, y]) => haversineMeters(lng, lat, x, y))) : reach
  return { lng, lat, radiusM: Math.min(MAX_RADIUS_M, Math.max(minRadiusM, Math.round(shifted + marginM))) }
}

/**
 * Propone al mando dos círculos sin que tenga que dibujar: la zona de riesgo que ya envuelve
 * el fuego (desplazada a favor del viento, que es hacia donde va) y la zona que la previsión
 * alcanza en una hora. Son una recomendación de demo derivada del modelo de propagación, no
 * un perímetro oficial.
 */
export function recommendAreas(fireCells: FeatureCollection<Polygon>, forecast: FireForecast, windTowardDeg: number): RecommendedAreas | null {
  const risk = enclosingCircle(fireCells, RISK_MARGIN_M, Number.isFinite(windTowardDeg) ? { bearing: windTowardDeg, fraction: 0.35 } : undefined, RISK_MIN_RADIUS_M)
  if (!risk) return null
  const projected = enclosingCircle(forecastGeo(forecast, AFFECTED_MINUTES), AFFECTED_MARGIN_M)
  const affected = projected && projected.radiusM > risk.radiusM ? projected : { ...risk, radiusM: Math.min(MAX_RADIUS_M, risk.radiusM * 2) }
  return { risk, affected, affectedMinutes: AFFECTED_MINUTES }
}
