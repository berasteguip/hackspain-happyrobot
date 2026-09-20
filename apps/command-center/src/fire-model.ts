import type { FeatureCollection, Point, Polygon } from 'geojson'

export type FireSettings = { windTowardDeg: number; windKmh: number; spreadMPerMin: number }
export type Exposure = { level: 'danger' | 'warning' | 'clear' | 'unknown'; minute: number }
type Cell = { x: number; y: number; minute: number }
export type FireForecast = {
  origin: [number, number]
  lngScale: number
  cellSizeM: number
  cells: Map<string, Cell>
  initialCells: Cell[]
}
export const MAX_FORECAST_MIN = 120
/** Minutos de simulación que tarda una celda en aparecer o apagarse en el mapa. Solo visual. */
export const HEAT_BLOOM_MIN = 12
export const EXPOSURE_LABEL = { danger: 'Peligro en el escenario', warning: 'Exposición futura simulada', clear: 'Sin afectación calculada', unknown: 'Sin evaluación' }
export const EXPOSURE_COLOR = { danger: '#f36d69', warning: '#f3bd61', clear: '#83bedf', unknown: '#a3acb7' }
const key = (x: number, y: number) => `${x}:${y}`

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number) {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return value - Math.floor(value)
}

/** Intensidad 0–1 para pintar el frente. No cambia exposición ni rutas. */
export function cellVisualHeat(minute: number, horizon: number) {
  if (minute === 0) return 1
  const age = horizon - minute
  const bloom = smoothstep((age + HEAT_BLOOM_MIN * 0.45) / HEAT_BLOOM_MIN)
  if (bloom <= 0) return 0
  return bloom * (0.38 + 0.62 * smoothstep(age / 18))
}

export function forecastHeatPoints(forecast: FireForecast, horizon: number): FeatureCollection<Point> {
  const features: FeatureCollection<Point>['features'] = []
  const jitter = forecast.cellSizeM * 0.28
  for (const cell of forecast.cells.values()) {
    if (cell.minute === 0) continue
    const heat = cellVisualHeat(cell.minute, horizon)
    if (heat <= 0.03) continue
    const lng = forecast.origin[0] + (cell.x + 0.5 + (hash(cell.x, cell.y) - 0.5) * 0.56) * forecast.cellSizeM / forecast.lngScale
    const lat = forecast.origin[1] + (cell.y + 0.5 + (hash(cell.x + 4.2, cell.y + 1.8) - 0.5) * 0.56) * forecast.cellSizeM / 111320
    const front = horizon - cell.minute < 16 ? 1 : 0
    features.push({
      type: 'Feature',
      properties: { heat, front },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    })
    if (heat > 0.55) {
      features.push({
        type: 'Feature',
        properties: { heat: heat * 0.7, front },
        geometry: { type: 'Point', coordinates: [
          lng + (hash(cell.x, cell.y + 9) - 0.5) * 2 * jitter / forecast.lngScale,
          lat + (hash(cell.x + 8, cell.y) - 0.5) * 2 * jitter / 111320,
        ] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

class Queue {
  items: Cell[] = []
  push(cell: Cell) {
    let i = this.items.push(cell) - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].minute <= cell.minute) break
      this.items[i] = this.items[parent]
      i = parent
    }
    this.items[i] = cell
  }
  pop() {
    const first = this.items[0]
    const last = this.items.pop()!
    if (this.items.length) {
      let i = 0
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1
        if (child + 1 < this.items.length && this.items[child + 1].minute < this.items[child].minute) child += 1
        if (last.minute <= this.items[child].minute) break
        this.items[i] = this.items[child]
        i = child
      }
      this.items[i] = last
    }
    return first
  }
}

export function buildFireForecast(footprint: FeatureCollection<Polygon>, settings: FireSettings): FireForecast {
  const { windTowardDeg, windKmh, spreadMPerMin } = settings
  if (![windTowardDeg, windKmh, spreadMPerMin].every(Number.isFinite) || windKmh < 0 || windKmh > 60 || spreadMPerMin < 0 || spreadMPerMin > 20) throw new Error('Parámetros fuera del rango de simulación')
  const first = footprint.features[0]?.geometry.coordinates[0][0]
  const origin: [number, number] = first ? [first[0], first[1]] : [0, 0]
  const cellSizeM = 100
  const lngScale = 111320 * Math.cos(origin[1] * Math.PI / 180)
  const cells = new Map<string, Cell>()
  const queue = new Queue()
  for (const feature of footprint.features) {
    const ring = feature.geometry.coordinates[0]
    const xs = ring.map(([lng]) => (lng - origin[0]) * lngScale / cellSizeM)
    const ys = ring.map(([, lat]) => (lat - origin[1]) * 111320 / cellSizeM)
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y += 1) {
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x += 1) {
        const id = key(x, y)
        if (!cells.has(id)) {
          const cell = { x, y, minute: 0 }
          cells.set(id, cell)
          queue.push(cell)
        }
      }
    }
  }
  const initialCells = [...cells.values()]
  if (spreadMPerMin > 0) {
    const angle = windTowardDeg * Math.PI / 180
    const steps = [-1, 0, 1].flatMap(y => [-1, 0, 1].filter(x => x || y).map(x => {
      const length = Math.hypot(x, y)
      const alignment = Math.max(0, (x * Math.sin(angle) + y * Math.cos(angle)) / length)
      return { x, y, minutes: length * cellSizeM / (spreadMPerMin * (1 + windKmh / 20 * alignment)) }
    }))
    while (queue.items.length) {
      const current = queue.pop()
      if (cells.get(key(current.x, current.y)) !== current) continue
      for (const step of steps) {
        const minute = current.minute + step.minutes
        if (minute > MAX_FORECAST_MIN) continue
        const x = current.x + step.x
        const y = current.y + step.y
        const id = key(x, y)
        if ((cells.get(id)?.minute ?? Infinity) <= minute) continue
        const next = { x, y, minute }
        cells.set(id, next)
        queue.push(next)
      }
    }
  }
  return { origin, lngScale, cellSizeM, cells, initialCells }
}

export function forecastGeo(forecast: FireForecast, horizon: number): FeatureCollection<Polygon> {
  const features: FeatureCollection<Polygon>['features'] = []
  const rows = new Map<string, Cell[]>()
  for (const cell of forecast.cells.values()) {
    if (cell.minute === 0 || cell.minute > horizon) continue
    const band = cell.minute <= 30 ? 30 : cell.minute <= 60 ? 60 : 120
    const id = `${cell.y}:${band}`
    const row = rows.get(id) ?? []
    row.push(cell)
    rows.set(id, row)
  }
  for (const [id, row] of rows) {
    row.sort((a, b) => a.x - b.x)
    for (let start = 0; start < row.length;) {
      let end = start
      while (end + 1 < row.length && row[end + 1].x === row[end].x + 1) end += 1
      const west = forecast.origin[0] + row[start].x * forecast.cellSizeM / forecast.lngScale
      const east = forecast.origin[0] + (row[end].x + 1) * forecast.cellSizeM / forecast.lngScale
      const south = forecast.origin[1] + row[start].y * forecast.cellSizeM / 111320
      const north = south + forecast.cellSizeM / 111320
      features.push({ type: 'Feature', properties: { band: Number(id.split(':')[1]) }, geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } })
      start = end + 1
    }
  }
  return { type: 'FeatureCollection', features }
}

export function exposureAt(forecast: FireForecast, lng: number, lat: number, horizon: number, marginM: number): Exposure {
  if (!forecast.cells.size || !Number.isFinite(lng) || !Number.isFinite(lat)) return { level: 'unknown', minute: Infinity }
  const px = (lng - forecast.origin[0]) * forecast.lngScale
  const py = (lat - forecast.origin[1]) * 111320
  const size = forecast.cellSizeM
  let minute = Infinity
  for (let y = Math.floor((py - marginM) / size); y <= Math.floor((py + marginM) / size); y += 1) {
    for (let x = Math.floor((px - marginM) / size); x <= Math.floor((px + marginM) / size); x += 1) {
      const cell = forecast.cells.get(key(x, y))
      if (!cell) continue
      const distance = Math.hypot(Math.max(x * size - px, 0, px - (x + 1) * size), Math.max(y * size - py, 0, py - (y + 1) * size))
      if (distance <= marginM) minute = Math.min(minute, cell.minute)
    }
  }
  return { level: minute === 0 ? 'danger' : minute <= horizon ? 'warning' : 'clear', minute }
}

function intersectsBox(ax: number, ay: number, bx: number, by: number, west: number, south: number, east: number, north: number) {
  let low = 0
  let high = 1
  for (const [origin, delta, min, max] of [[ax, bx - ax, west, east], [ay, by - ay, south, north]]) {
    if (delta === 0) {
      if (origin < min || origin > max) return false
    } else {
      const a = (min - origin) / delta
      const b = (max - origin) / delta
      low = Math.max(low, Math.min(a, b))
      high = Math.min(high, Math.max(a, b))
      if (low > high) return false
    }
  }
  return true
}

export function routeBlocked(forecast: FireForecast, coordinates: [number, number][], horizon: number, marginM: number) {
  if (!forecast.cells.size || coordinates.length < 2) return true
  const points = coordinates.map(([lng, lat]) => [(lng - forecast.origin[0]) * forecast.lngScale, (lat - forecast.origin[1]) * 111320])
  const size = forecast.cellSizeM
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    if (![ax, ay, bx, by].every(Number.isFinite)) return true
    if (horizon === 0 && marginM >= size) {
      if (forecast.initialCells.some(({ x, y }) => intersectsBox(ax, ay, bx, by, x * size - marginM, y * size - marginM, (x + 1) * size + marginM, (y + 1) * size + marginM))) return true
      continue
    }
    for (let y = Math.floor((Math.min(ay, by) - marginM) / size); y <= Math.floor((Math.max(ay, by) + marginM) / size); y += 1) {
      for (let x = Math.floor((Math.min(ax, bx) - marginM) / size); x <= Math.floor((Math.max(ax, bx) + marginM) / size); x += 1) {
        const cell = forecast.cells.get(key(x, y))
        if (cell && cell.minute <= horizon && intersectsBox(ax, ay, bx, by, x * size - marginM, y * size - marginM, (x + 1) * size + marginM, (y + 1) * size + marginM)) return true
      }
    }
  }
  return false
}
