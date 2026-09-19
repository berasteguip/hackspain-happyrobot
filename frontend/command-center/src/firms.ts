import type { FireSpot } from './types'

const EUROPE_CSV =
  '/firms/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv'

const SPAIN = { west: -9.6, south: 35.9, east: 4.4, north: 43.9 }

function parseConfidence(raw: string): FireSpot['confidence'] {
  const value = raw.trim().toLowerCase()
  if (value === 'h' || value === 'high') return 'high'
  if (value === 'l' || value === 'low') return 'low'
  return 'nominal'
}

export async function fetchFirmsSpain(): Promise<FireSpot[]> {
  const res = await fetch(EUROPE_CSV)
  if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`)
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const latI = header.indexOf('latitude')
  const lngI = header.indexOf('longitude')
  const frpI = header.indexOf('frp')
  const confI = header.indexOf('confidence')
  const dateI = header.indexOf('acq_date')
  const timeI = header.indexOf('acq_time')
  if (latI < 0 || lngI < 0) return []

  const spots: FireSpot[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',')
    const lat = Number(cols[latI])
    const lng = Number(cols[lngI])
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lng < SPAIN.west ||
      lng > SPAIN.east ||
      lat < SPAIN.south ||
      lat > SPAIN.north
    ) {
      continue
    }
    const time = (cols[timeI] ?? '').padStart(4, '0')
    spots.push({
      id: `firms-${i}`,
      lng,
      lat,
      frp: Number(cols[frpI] ?? 0) || 0,
      confidence: parseConfidence(cols[confI] ?? ''),
      source: 'firms',
      acquiredAt: `${cols[dateI] ?? ''} ${time.slice(0, 2)}:${time.slice(2)}`,
    })
    if (spots.length >= 250) break
  }
  return spots
}
