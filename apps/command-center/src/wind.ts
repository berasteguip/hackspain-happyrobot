import { destination } from './geo'

type Position = [number, number]

export function windVisualStyle(zoom: number, windKmh: number, width: number, height: number) {
  const scale = 2 ** ((Math.max(4, Math.min(19, zoom)) - 11) * 0.18)
  const active = windKmh > 0 && width > 0 && height > 0
  return {
    speedPx: active ? Math.min(28, (6 + windKmh * 0.2) * scale * 1.2) : 0,
    trailPx: Math.max(18, Math.min(56, (22 + windKmh * 0.3) * scale)),
    count: active ? Math.max(35, Math.min(650, Math.round(width * height / (3000 * Math.sqrt(scale))))) : 0,
  }
}

export function advanceWindPosition(position: Position, directionDeg: number, speedMps: number, deltaSec: number): Position {
  return deltaSec > 0 && speedMps > 0 ? destination(...position, directionDeg, speedMps * deltaSec) : position
}

export function windParticleOpacity(age: number, lifetime: number) {
  const progress = Math.max(0, Math.min(1, age / lifetime))
  return Math.sin(Math.PI * progress) ** 1.5 * (progress < 1 ? 1 : 0)
}
