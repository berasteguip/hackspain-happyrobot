export type CitizenStatus =
  | 'pending'
  | 'ringing'
  | 'no_answer'
  | 'informed'
  | 'tracking'
  | 'evacuating'
  | 'safe'
  | 'refused'
  | 'routing'
  | 'preparing'
  | 'assistance'

export type Coordinate = [number, number]

export type TravelGroup = {
  adults: number
  children: number
  olderAdults: number
  mobility: 'walking' | 'assisted' | 'vehicle' | 'pickup'
  preparationSec: number
}

export type RouteOption = {
  zoneId: string
  coordinates: Coordinate[]
  distanceM: number
  accessM: number
  profile: 'walking' | 'driving'
}

export type Journey = RouteOption & {
  distanceTravelledM: number
  departureAt: number
  arrivedAt?: number
}

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
  outcome: 'tracking' | 'informed' | 'no_answer' | 'refused'
  live?: boolean
  locationSource?: 'reference' | 'simulation' | 'gps' | 'unknown'
  locationUpdatedAt?: number
  accuracyM?: number
  locality?: string
  resident?: boolean
  group?: TravelGroup
  journey?: Journey
  routeOptions?: RouteOption[]
  routeState?: 'loading' | 'ready' | 'error'
  assistanceReason?: string
  confirmedAt?: number
  household?: { name: string; situation: string; source: string }[]
  call?: {
    answeredAt: number
    agent: string
    summary: string
    consent: 'granted' | 'declined' | 'not_requested'
    needs: string[]
  }
  hrCall?: {
    state: 'queued' | 'talking' | 'done' | 'failed'
    transcript: { ts: string; speaker: string; text: string }[]
    runUrl?: string
    endReason?: string
    outcomeApplied?: boolean
    zoneId?: string
  }
}

export type MapLayers = {
  perimeter: boolean
  spread: boolean
  thermal: boolean
  citizens: boolean
  references: boolean
  zones: boolean
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
  accessible: boolean
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
