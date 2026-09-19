export type CitizenStatus =
  | 'pending'
  | 'ringing'
  | 'no_answer'
  | 'informed'
  | 'tracking'
  | 'evacuating'
  | 'safe'
  | 'refused'
  | 'assistance'
  | 'routing'

export type Citizen = {
  id: string
  name: string
  phone: string
  lng: number
  lat: number
  originLng?: number
  originLat?: number
  status: CitizenStatus
  vulnerable: boolean
  safeZoneId: string
  speedKmh: number
  callDelaySec: number
  outcome: Exclude<CitizenStatus, 'pending' | 'ringing' | 'evacuating' | 'assistance' | 'routing'>
  live?: boolean
  routeId?: string
  routeProgressM?: number
  routePhase?: 'access' | 'road'
  routeHoldReason?: string
  locationSource?: 'reference' | 'simulation' | 'gps' | 'unknown'
  locationUpdatedAt?: number
  accuracyM?: number
  locality?: string
  resident?: boolean
  household?: { name: string; situation: string; source: string }[]
  call?: {
    answeredAt: number
    agent: string
    summary: string
    consent: 'granted' | 'declined' | 'not_requested'
    needs: string[]
  }
}

export type CallArea = { lng: number; lat: number; radiusM: number }

export type MapLayers = {
  perimeter: boolean
  spread: boolean
  thermal: boolean
  citizens: boolean
  references: boolean
  zones: boolean
  hospitals: boolean
  healthCenters: boolean
  fireStations: boolean
  routes: boolean
}

export type LocationPing = {
  id: string
  name: string
  lng: number
  lat: number
  ts: number
  source?: 'gps' | 'simulation' | 'unknown'
  accuracyM?: number
}

export type SafeZone = {
  id: string
  name: string
  lng: number
  lat: number
  radiusM: number
  capacity: number
  code: string
  services: string[]
  description: string
  sourceUrl: string
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
