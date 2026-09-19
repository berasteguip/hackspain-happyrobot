import type { FeatureCollection, Polygon } from 'geojson'
import { destination, haversineMeters, nearestZone } from './geo'
import type { Corridor } from './routing'
import type { Citizen, FireSpot, RiskArea, SafeZone } from './types'

export const INCIDENT = {
  code: 'AV-GRD-2026-0919',
  name: 'Incendio forestal — Sierra de Gredos',
  area: 'Valle del Tiétar · Ávila',
  cecop: 'CECOP Ávila · INFOCAL',
  declaredAt: '2026-09-19T01:12:00+02:00',
  center: [-5.112, 40.232] as [number, number],
  zoom: 13,
}

/**
 * El escenario original ocupaba todo el valle y dejaba los puntos de encuentro
 * a 7-11 km del fuego, fuera de plano. Se compacta en torno a un centro nuevo
 * para que el incidente y sus salidas quepan en la misma vista.
 */
const FIRE_SCALE = 0.4
const FIRE_ORIGIN = { lng: -5.1315, lat: 40.2449 }
const FIRE_CENTER = { lng: -5.1165, lat: 40.2345 }

function compact(lng: number, lat: number): [number, number] {
  return [
    FIRE_CENTER.lng + (lng - FIRE_ORIGIN.lng) * FIRE_SCALE,
    FIRE_CENTER.lat + (lat - FIRE_ORIGIN.lat) * FIRE_SCALE,
  ]
}

export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'z-arenas',
    name: 'Pabellón municipal · Arenas de San Pedro',
    lng: -5.0874,
    lat: 40.2042,
    radiusM: 150,
    capacity: 420,
  },
  {
    id: 'z-arenal',
    name: 'Polideportivo · El Arenal',
    lng: -5.0858,
    lat: 40.2657,
    radiusM: 130,
    capacity: 220,
  },
  {
    id: 'z-parra',
    name: 'Área recreativa · La Parra',
    lng: -5.0745,
    lat: 40.2281,
    radiusM: 130,
    capacity: 260,
  },
]

export const RISK_AREA: RiskArea = {
  id: 'risk-gredos',
  name: 'Perímetro de riesgo',
  coordinates: ([
    [-5.195, 40.255],
    [-5.145, 40.272],
    [-5.09, 40.268],
    [-5.05, 40.248],
    [-5.055, 40.218],
    [-5.1, 40.2],
    [-5.16, 40.208],
    [-5.195, 40.255],
  ] as [number, number][]).map(([lng, lat]) => compact(lng, lat)),
}

const SCENARIO_FIRE_SPOTS: FireSpot[] = [
  { id: 'f1', lng: -5.138, lat: 40.242, frp: 86.4, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f2', lng: -5.129, lat: 40.249, frp: 124.1, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f3', lng: -5.118, lat: 40.238, frp: 67.2, confidence: 'high', source: 'scenario', acquiredAt: '01:11' },
  { id: 'f4', lng: -5.147, lat: 40.236, frp: 41.8, confidence: 'nominal', source: 'scenario', acquiredAt: '01:11' },
  { id: 'f5', lng: -5.108, lat: 40.251, frp: 93.5, confidence: 'high', source: 'scenario', acquiredAt: '01:14' },
  { id: 'f6', lng: -5.161, lat: 40.244, frp: 28.6, confidence: 'nominal', source: 'scenario', acquiredAt: '01:14' },
  { id: 'f7', lng: -5.122, lat: 40.228, frp: 54.0, confidence: 'high', source: 'scenario', acquiredAt: '01:17' },
  { id: 'f8', lng: -5.099, lat: 40.241, frp: 19.3, confidence: 'low', source: 'scenario', acquiredAt: '01:17' },
  { id: 'f9', lng: -5.154, lat: 40.257, frp: 72.9, confidence: 'high', source: 'scenario', acquiredAt: '01:21' },
  { id: 'f10', lng: -5.134, lat: 40.261, frp: 38.1, confidence: 'nominal', source: 'scenario', acquiredAt: '01:21' },
  { id: 'f11', lng: -5.113, lat: 40.259, frp: 15.7, confidence: 'low', source: 'scenario', acquiredAt: '01:24' },
  { id: 'f12', lng: -5.141, lat: 40.232, frp: 48.4, confidence: 'nominal', source: 'scenario', acquiredAt: '01:24' },
]

export const SCENARIO_FIRES: FireSpot[] = SCENARIO_FIRE_SPOTS.map((fire) => {
  const [lng, lat] = compact(fire.lng, fire.lat)
  return { ...fire, lng, lat }
})

export const FIRE_CELL_SIZE_M = 25

export const SCENARIO_FIRE_CELLS: FeatureCollection<Polygon> = (() => {
  const metersPerLng = 111_320 * Math.cos(40.24 * Math.PI / 180)
  const widthM = 9100 * FIRE_SCALE
  const heightM = 6200 * FIRE_SCALE
  const west = FIRE_CENTER.lng - widthM / 2 / metersPerLng
  const south = FIRE_CENTER.lat - heightM / 2 / 111_320
  const dx = FIRE_CELL_SIZE_M / metersPerLng
  const dy = FIRE_CELL_SIZE_M / 111_320
  const columns = Math.ceil(widthM / FIRE_CELL_SIZE_M)
  const rows = Math.ceil(heightM / FIRE_CELL_SIZE_M)
  const footprints: [number, number][][] = [
    [[2, 7], [7, 6], [9, 9], [12, 8], [15, 5], [20, 6], [23, 9], [28, 8], [29, 12], [35, 11], [37, 14], [42, 15], [45, 19], [42, 22], [38, 22], [38, 26], [33, 25], [30, 28], [26, 26], [23, 28], [18, 26], [14, 27], [12, 23], [9, 23], [9, 30], [6, 30], [5, 25], [6, 22], [3, 20], [4, 16], [1, 14]],
    [[38, 19], [44, 20], [48, 24], [52, 23], [55, 25], [60, 24], [63, 27], [66, 27], [67, 31], [72, 29], [75, 32], [80, 31], [81, 35], [77, 36], [77, 40], [73, 39], [72, 42], [68, 41], [65, 37], [62, 37], [60, 34], [55, 35], [52, 32], [48, 33], [46, 30], [42, 29], [41, 25], [37, 24]],
    [[62, 34], [61, 39], [64, 40], [63, 43], [60, 45], [62, 48], [65, 47], [66, 49], [63, 51], [59, 50], [59, 54], [62, 55], [62, 57], [68, 56], [70, 58], [74, 56], [78, 56], [78, 52], [76, 51], [76, 47], [72, 46], [75, 44], [73, 41], [69, 42], [68, 38], [66, 35]],
    [[76, 34], [80, 35], [82, 38], [81, 42], [84, 43], [84, 48], [87, 48], [88, 52], [91, 51], [91, 55], [94, 55], [95, 58], [98, 57], [98, 60], [94, 61], [92, 59], [89, 60], [87, 57], [86, 54], [83, 54], [83, 50], [80, 49], [80, 44], [77, 44], [78, 39], [75, 37]],
    [[64, 18], [68, 18], [69, 16], [73, 17], [75, 19], [78, 17], [80, 19], [80, 23], [77, 22], [74, 24], [71, 22], [68, 23], [65, 21]],
    [[29, 39], [32, 40], [34, 39], [35, 41], [39, 42], [38, 45], [36, 44], [34, 46], [32, 44], [30, 44]],
    [[23, 39], [26, 38], [28, 40], [27, 42], [24, 42]],
    [[51, 44], [54, 43], [55, 45], [53, 47], [51, 46]],
    [[85, 36], [88, 36], [89, 38], [87, 40], [85, 39]],
    [[93, 46], [96, 45], [97, 48], [95, 49], [94, 48]],
  ]
  const gaps: [number, number][][] = [
    [[9, 13], [12, 13], [12, 15], [14, 15], [14, 17], [11, 17], [11, 19], [9, 18]],
    [[17, 10], [18, 12], [21, 12], [21, 14], [19, 14], [19, 16], [17, 15]],
    [[24, 15], [27, 15], [27, 18], [29, 18], [28, 20], [25, 20], [25, 18], [23, 18]],
    [[33, 18], [35, 17], [37, 19], [36, 21], [33, 20]],
    [[57, 28], [59, 27], [61, 28], [60, 30], [58, 30]],
    [[66, 44], [69, 44], [69, 46], [71, 46], [71, 49], [69, 49], [68, 47], [66, 47]],
    [[69, 52], [72, 52], [72, 54], [70, 54]],
  ]
  const inside = (x: number, y: number, ring: [number, number][]) => {
    let result = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i]
      const [bx, by] = ring[j]
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) result = !result
    }
    return result
  }
  const noise = (x: number, y: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return value - Math.floor(value)
  }
  const occupied = (column: number, row: number) => {
    const x = (column + 0.5) * FIRE_CELL_SIZE_M / (91 * FIRE_SCALE)
    const y = (row + 0.5) * FIRE_CELL_SIZE_M / (100 * FIRE_SCALE)
    const wx = x + 0.65 * Math.sin(y * 1.7) + 0.3 * Math.sin(x * 3.1 + y)
    const wy = y + 0.65 * Math.sin(x * 1.35) + 0.35 * Math.cos(y * 2.7 - x)
    const tileX = Math.floor(x / 2.1)
    const tileY = Math.floor(y / 1.8)
    const localX = x / 2.1 - tileX
    const localY = y / 1.8 - tileY
    const holeX = localX - 0.25 - 0.5 * noise(tileX + 17, tileY)
    const holeY = localY - 0.25 - 0.5 * noise(tileX, tileY + 31)
    const holeWidth = 0.1 + 0.2 * noise(tileX + 9, tileY + 4)
    const holeHeight = 0.08 + 0.22 * noise(tileX + 2, tileY + 8)
    const fragmented = noise(tileX, tileY) > 0.85
      && Math.abs(holeX + 0.07 * Math.sin(localY * 14 + tileX)) < holeWidth
      && Math.abs(holeY + 0.06 * Math.cos(localX * 17 + tileY)) < holeHeight
    const covered = footprints.some((ring) => inside(wx, wy, ring))
    if (covered) return !fragmented && !gaps.some((ring) => inside(wx, wy, ring))
    const fringe = noise(tileX, tileY) > 0.76 && localX > 0.27 && localX < 0.74 && localY > 0.23 && localY < 0.75
    return fringe && [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].some(([ox, oy]) => footprints.some((ring) => inside(wx + ox, wy + oy, ring)))
  }
  const features: FeatureCollection<Polygon>['features'] = []
  for (let row = 0; row < rows; row += 1) {
    let start = -1
    for (let column = 0; column <= columns; column += 1) {
      const filled = column < columns && occupied(column, row)
      if (filled && start < 0) start = column
      if (filled || start < 0) continue
      const lng = west + start * dx
      const endLng = west + column * dx
      const lat = south + row * dy
      features.push({
        type: 'Feature',
        id: `demo-cell-run-${start}-${row}`,
        properties: { source: 'scenario', column: start, row, cellCount: column - start, cellSizeM: FIRE_CELL_SIZE_M },
        geometry: {
          type: 'Polygon',
          coordinates: [[[lng, lat], [endLng, lat], [endLng, lat + dy], [lng, lat + dy], [lng, lat]]],
        },
      })
      start = -1
    }
  }
  return { type: 'FeatureCollection', features }
})()

export const FIRE_PERIMETER: RiskArea = {
  id: 'fire-perimeter',
  name: 'Superficie afectada · escenario',
  coordinates: ([
    [-5.172, 40.244], [-5.166, 40.250], [-5.162, 40.251],
    [-5.161, 40.256], [-5.155, 40.262], [-5.148, 40.261],
    [-5.142, 40.268], [-5.132, 40.265], [-5.128, 40.267],
    [-5.119, 40.262], [-5.113, 40.264], [-5.107, 40.258],
    [-5.097, 40.256], [-5.101, 40.250], [-5.091, 40.245],
    [-5.094, 40.239], [-5.103, 40.237], [-5.108, 40.231],
    [-5.117, 40.232], [-5.120, 40.222], [-5.129, 40.225],
    [-5.134, 40.223], [-5.139, 40.228], [-5.146, 40.227],
    [-5.152, 40.231], [-5.155, 40.237], [-5.164, 40.236],
    [-5.163, 40.241], [-5.172, 40.244],
  ] as [number, number][]).map(([lng, lat]) => compact(lng, lat)),
}

export const FIRE_FRONT: [number, number][] = ([
  [-5.142, 40.268], [-5.132, 40.265], [-5.128, 40.267],
  [-5.119, 40.262], [-5.113, 40.264], [-5.107, 40.258],
  [-5.097, 40.256], [-5.101, 40.250], [-5.091, 40.245],
] as [number, number][]).map(([lng, lat]) => compact(lng, lat))

export const SPREAD_AREA: RiskArea = {
  id: 'spread-scenario',
  name: 'Posible propagación · hipótesis ilustrativa',
  coordinates: ([
    [-5.148, 40.263], [-5.145, 40.277], [-5.133, 40.287],
    [-5.115, 40.291], [-5.103, 40.286], [-5.087, 40.278],
    [-5.081, 40.267], [-5.069, 40.261], [-5.075, 40.250],
    [-5.091, 40.245], [-5.101, 40.250], [-5.097, 40.256],
    [-5.107, 40.258], [-5.113, 40.264], [-5.119, 40.262],
    [-5.128, 40.267], [-5.132, 40.265], [-5.142, 40.268],
    [-5.148, 40.263],
  ] as [number, number][]).map(([lng, lat]) => compact(lng, lat)),
}

export const SETTLEMENTS = [
  { name: 'Arenas de San Pedro', lng: -5.0911, lat: 40.2089, count: 156, radiusM: 360 },
  { name: 'Guisando', lng: -5.1395, lat: 40.2223, count: 48, radiusM: 155 },
  { name: 'El Hornillo', lng: -5.1036, lat: 40.2497, count: 36, radiusM: 135 },
  { name: 'El Arenal', lng: -5.0872, lat: 40.2647, count: 48, radiusM: 220 },
]

const NAMES = ['Carmen', 'Antonio', 'María', 'José', 'Elena', 'Pedro', 'Isabel', 'Luis', 'Rosa', 'Miguel', 'Pilar', 'Francisco', 'Ana', 'Javier', 'Teresa', 'Raúl', 'Lucía', 'Manuel', 'Sofía', 'Diego']
const SURNAMES = ['López', 'Ruiz', 'Fernández', 'Prieto', 'Navarro', 'Sánchez', 'Martín', 'Ortega', 'Jiménez', 'Soto', 'Gómez', 'Herrera', 'Cruz', 'Molina', 'Blanco']

function person(index: number, lng: number, lat: number, locality: string, resident: boolean): Citizen {
  return {
    id: `c-${String(index + 1).padStart(2, '0')}`,
    name: `${NAMES[index % NAMES.length]} ${SURNAMES[Math.floor(index / NAMES.length) % SURNAMES.length]}`,
    phone: `demo-${String(index + 1).padStart(3, '0')}`,
    lng, lat, locality, resident,
    status: resident ? 'pending' : 'tracking',
    vulnerable: index % 17 === 0,
    safeZoneId: nearestZone(lng, lat, SAFE_ZONES).zone.id,
    speedKmh: 26 + (index % 7) * 4,
    callDelaySec: 1 + (index % 48) * 1.4,
    outcome: index % 11 === 7 ? 'no_answer' : index % 13 === 9 ? 'refused' : index % 7 === 4 ? 'informed' : 'tracking',
    locationSource: resident ? 'reference' : 'simulation',
    locationUpdatedAt: resident ? undefined : Date.now(),
    call: resident ? undefined : {
      answeredAt: Date.now(), agent: 'HappyRobot · demo',
      summary: 'Guion ficticio: la persona atiende la llamada desde fuera del núcleo urbano y comparte dónde se encuentra. No se le ha asignado una ruta ni un destino de evacuación.',
      consent: 'granted', needs: [],
    },
  }
}

const OUTSIDE_LOCATIONS: [number, number, string][] = [
  [-5.1502, 40.2146, 'Entorno de Guisando'],
  [-5.1574, 40.2197, 'Entorno de Guisando'],
  [-5.1285, 40.2158, 'Entre Guisando y Arenas'],
  [-5.1208, 40.2125, 'Entre Guisando y Arenas'],
  [-5.1095, 40.2175, 'Entorno de Arenas'],
  [-5.1015, 40.2512, 'Entorno de El Hornillo'],
  [-5.0851, 40.2346, 'Entorno de La Parra'],
  [-5.0754, 40.2248, 'Entorno de La Parra'],
  [-5.0736, 40.2537, 'Entorno de El Arenal'],
  [-5.0798, 40.2752, 'Entorno de El Arenal'],
  [-5.0964, 40.1952, 'Sur de Arenas'],
  [-5.0658, 40.2037, 'Este de Arenas'],
]

function closestZones(lng: number, lat: number, count: number) {
  return [...SAFE_ZONES]
    .sort((a, b) => haversineMeters(lng, lat, a.lng, a.lat) - haversineMeters(lng, lat, b.lng, b.lat))
    .slice(0, count)
}

/**
 * Cada corredor se resuelve contra la API de Directions para que las personas
 * avancen por carretera y no en línea recta sobre el monte. Se piden los dos
 * puntos de encuentro más próximos porque en este valle la distancia por
 * carretera y la distancia en línea recta no coinciden.
 */
export const EVACUATION_CORRIDORS: Corridor[] = (() => {
  const bearings = [30, 150, 270]
  const corridors: Corridor[] = []
  for (const settlement of SETTLEMENTS) {
    for (const zone of closestZones(settlement.lng, settlement.lat, 2)) {
      for (const bearing of bearings) {
        corridors.push({
          id: `${settlement.name}-${zone.id}-${bearing}`,
          group: settlement.name,
          zoneId: zone.id,
          from: destination(settlement.lng, settlement.lat, bearing, settlement.radiusM * 0.6),
          to: [zone.lng, zone.lat],
        })
      }
    }
  }
  for (const [lng, lat, locality] of OUTSIDE_LOCATIONS) {
    for (const zone of closestZones(lng, lat, 2)) {
      corridors.push({
        id: `${locality}-${lng.toFixed(4)}-${zone.id}`,
        group: locality,
        zoneId: zone.id,
        from: [lng, lat],
        to: [zone.lng, zone.lat],
      })
    }
  }
  return corridors
})()

export const INITIAL_CITIZENS: Citizen[] = (() => {
  const residents: Citizen[] = []
  for (const settlement of SETTLEMENTS) {
    for (let i = 0; i < settlement.count; i += 1) {
      const seed = residents.length + 1
      const noise = (value: number) => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n) }
      const angle = noise(seed) * Math.PI * 2
      const distance = settlement.radiusM * Math.sqrt(noise(seed + 4096)) * (0.8 + 0.2 * Math.sin(angle * 3))
      const east = Math.cos(angle) * distance
      const north = Math.sin(angle) * distance * 0.65
      residents.push(person(
        residents.length,
        settlement.lng + east / (111_320 * Math.cos(settlement.lat * Math.PI / 180)),
        settlement.lat + north / 111_320,
        settlement.name,
        true,
      ))
    }
  }
  return [...residents, ...OUTSIDE_LOCATIONS.map(([lng, lat, locality], index) => person(residents.length + index, lng, lat, locality, false))]
})()

export const AGENTS = [
  'HappyRobot-1',
  'HappyRobot-2',
  'HappyRobot-3',
  'HappyRobot-4',
]
