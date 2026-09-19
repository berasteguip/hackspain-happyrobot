export type CitizenStatus =
  | 'pending'
  | 'ringing'
  | 'no_answer'
  | 'informed'
  | 'tracking'
  | 'evacuating'
  | 'safe'
  | 'refused'

export type Citizen = {
  id: string
  name: string
  phone: string
  lng: number
  lat: number
  originLng: number
  originLat: number
  status: CitizenStatus
  vulnerable: boolean
  safeZoneId: string
  speedKmh: number
  callDelaySec: number
  outcome: Exclude<CitizenStatus, 'pending' | 'ringing' | 'evacuating'>
  live?: boolean
}

export type SafeZone = {
  id: string
  name: string
  lng: number
  lat: number
  radiusM: number
  capacity: number
}

export type FireSpot = {
  id: string
  lng: number
  lat: number
  frp: number
  confidence: 'low' | 'nominal' | 'high'
  source: 'scenario' | 'firms'
  acquiredAt: string
}

export type CallEvent = {
  id: string
  ts: number
  agent: string
  citizenId: string
  name: string
  detail: string
}

export type RiskArea = {
  id: string
  name: string
  coordinates: [number, number][]
}
