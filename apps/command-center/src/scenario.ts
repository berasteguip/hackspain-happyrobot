import { nearestZone, pointInRing } from './geo'
import type { Citizen, FireSpot, RiskArea, SafeZone } from './types'

export const INCIDENT = {
  code: 'AV-GRD-2026-0919',
  name: 'Incendio forestal — Sierra de Gredos',
  area: 'Valle del Tiétar · Ávila',
  cecop: 'CECOP Ávila · INFOCAL',
  declaredAt: '2026-09-19T01:12:00+02:00',
  center: [-5.115, 40.235] as [number, number],
  zoom: 12.15,
}

export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'z-norte',
    name: 'Zona segura norte · Mombeltrán',
    lng: -5.102,
    lat: 40.274,
    radiusM: 90,
    capacity: 400,
  },
  {
    id: 'z-sur',
    name: 'Zona segura sur · Arenas de San Pedro',
    lng: -5.115,
    lat: 40.197,
    radiusM: 90,
    capacity: 420,
  },
]

export const RISK_AREA: RiskArea = {
  id: 'risk-gredos',
  name: 'Perímetro de riesgo',
  coordinates: [
    [-5.195, 40.255],
    [-5.145, 40.272],
    [-5.09, 40.268],
    [-5.05, 40.248],
    [-5.055, 40.218],
    [-5.1, 40.2],
    [-5.16, 40.208],
    [-5.195, 40.255],
  ],
}

export const SCENARIO_FIRES: FireSpot[] = [
  { id: 'f1', lng: -5.133, lat: 40.245, frp: 124.1, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f2', lng: -5.126, lat: 40.241, frp: 86.4, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f3', lng: -5.138, lat: 40.239, frp: 67.2, confidence: 'high', source: 'scenario', acquiredAt: '01:11' },
  { id: 'f4', lng: -5.120, lat: 40.248, frp: 54.0, confidence: 'nominal', source: 'scenario', acquiredAt: '01:14' },
  { id: 'f5', lng: -5.129, lat: 40.233, frp: 41.8, confidence: 'nominal', source: 'scenario', acquiredAt: '01:17' },
]

const NAMES = [
  'Carmen', 'Antonio', 'María', 'José', 'Elena', 'Pedro', 'Isabel', 'Luis',
  'Rosa', 'Miguel', 'Pilar', 'Francisco', 'Ana', 'Javier', 'Teresa', 'Raúl',
  'Lucía', 'Manuel', 'Sofía', 'Diego', 'Nuria', 'Álvaro', 'Laura', 'Pablo',
  'Marta', 'Sergio', 'Inés', 'Hugo', 'Clara', 'Andrés',
]

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function scatter(
  count: number,
  center: { lng: number; lat: number },
  spread: number,
  seed: number,
  prefix: string,
): Citizen[] {
  const rand = mulberry32(seed)
  const people: Citizen[] = []
  let attempts = 0
  while (people.length < count && attempts < count * 80) {
    attempts += 1
    const lng = center.lng + (rand() - 0.5) * spread
    const lat = center.lat + (rand() - 0.5) * spread
    if (!pointInRing(lng, lat, RISK_AREA.coordinates)) continue
    const zone = nearestZone(lng, lat, SAFE_ZONES).zone
    const stays = rand() < 0.08
    const i = people.length
    people.push({
      id: `${prefix}-${String(i + 1).padStart(2, '0')}`,
      name: NAMES[i % NAMES.length],
      phone: '',
      lng,
      lat,
      originLng: lng,
      originLat: lat,
      status: 'pending',
      vulnerable: rand() < 0.12,
      safeZoneId: zone.id,
      speedKmh: 110 + rand() * 70,
      callDelaySec: rand() * 4,
      outcome: stays ? 'no_answer' : 'tracking',
    })
  }
  return people
}

export function createPopulation(): Citizen[] {
  return [
    ...scatter(38, { lng: -5.118, lat: 40.256 }, 0.028, 20260919, 'n'),
    ...scatter(38, { lng: -5.128, lat: 40.222 }, 0.028, 20260920, 's'),
  ]
}

export const INITIAL_CITIZENS = createPopulation()

export const AGENTS = [
  'HappyRobot-1',
  'HappyRobot-2',
  'HappyRobot-3',
  'HappyRobot-4',
]
