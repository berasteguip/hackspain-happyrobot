import { MAX_FORECAST_MIN, exposureAt, routeBlocked } from './fire-model'
import type { FireForecast } from './fire-model'
import type { RouteIndex } from './routing'
import type { Settlement } from './scenario'
import type { Citizen, SafeZone } from './types'

export type RankedCitizen = Citizen & { minute: number; rank: number }

export type PlanDiff = {
  fromDeg: number
  toDeg: number
  peopleWorse: number
  peopleBetter: number
  zonesNewlyExposed: string[]
  routesCut: number
  summary: string
}

export type Convoy = {
  id: string
  locality: string
  guide: Citizen
  members: Citizen[]
  minute: number
}

export type SectorPriority = {
  name: string
  count: number
  minute: number
  lng: number
  lat: number
}

const DANGER_WINDOW_MIN = 20

export function minutesToFront(forecast: FireForecast, lng: number, lat: number, marginM: number) {
  return exposureAt(forecast, lng, lat, MAX_FORECAST_MIN, marginM).minute
}

export function formatFrontEta(minute: number) {
  if (!Number.isFinite(minute)) return '>2 h'
  if (minute <= 0) return 'ahora'
  if (minute < 60) return `${Math.round(minute)} min`
  return `${Math.floor(minute / 60)} h ${Math.round(minute % 60)} min`
}

export function isSilentHouse(citizen: Citizen) {
  return citizen.status === 'no_answer' || citizen.callState === 'no_answer'
}

export function rankCitizens(citizens: Citizen[], forecast: FireForecast, marginM: number): RankedCitizen[] {
  return [...citizens]
    .map(citizen => ({ ...citizen, minute: minutesToFront(forecast, citizen.lng, citizen.lat, marginM), rank: 0 }))
    .sort((a, b) => a.minute - b.minute || Number(isSilentHouse(b)) - Number(isSilentHouse(a)) || a.name.localeCompare(b.name, 'es'))
    .map((citizen, index) => ({ ...citizen, rank: index + 1 }))
}

export function silentHouses(ranked: RankedCitizen[]) {
  return ranked.filter(isSilentHouse)
}

export function imminentCount(ranked: RankedCitizen[], windowMin = DANGER_WINDOW_MIN) {
  return ranked.filter(citizen => citizen.minute < windowMin).length
}

export function planDiff(input: {
  previous: FireForecast
  next: FireForecast
  fromDeg: number
  toDeg: number
  citizens: Citizen[]
  zones: SafeZone[]
  routes: RouteIndex
  horizon: number
  marginM: number
}): PlanDiff {
  const lookAhead = Math.min(MAX_FORECAST_MIN, Math.max(input.horizon, 60))
  let peopleWorse = 0
  let peopleBetter = 0
  for (const citizen of input.citizens) {
    const before = minutesToFront(input.previous, citizen.lng, citizen.lat, input.marginM)
    const after = minutesToFront(input.next, citizen.lng, citizen.lat, input.marginM)
    if (after < before - 0.5) peopleWorse += 1
    else if (after > before + 0.5) peopleBetter += 1
  }
  const zonesNewlyExposed = input.zones.filter(zone => {
    const before = exposureAt(input.previous, zone.lng, zone.lat, lookAhead, input.marginM + zone.radiusM).level
    const after = exposureAt(input.next, zone.lng, zone.lat, lookAhead, input.marginM + zone.radiusM).level
    return before === 'clear' && after !== 'clear'
  }).map(zone => zone.code)
  let routesCut = 0
  for (const citizen of input.citizens) {
    if (!citizen.routeId) continue
    const route = input.routes.get(citizen.routeId)
    if (!route || route.coords.length < 2) continue
    if (!routeBlocked(input.previous, route.coords, lookAhead, input.marginM) && routeBlocked(input.next, route.coords, lookAhead, input.marginM)) {
      routesCut += 1
    }
  }
  const parts = [
    peopleWorse ? `${peopleWorse} ${peopleWorse === 1 ? 'persona peor' : 'personas peor'}` : '',
    peopleBetter ? `${peopleBetter} ${peopleBetter === 1 ? 'persona mejor' : 'personas mejor'}` : '',
    zonesNewlyExposed.length ? `${zonesNewlyExposed.length} ${zonesNewlyExposed.length === 1 ? 'refugio en ámbar' : 'refugios en ámbar'}` : '',
    routesCut ? `${routesCut} ${routesCut === 1 ? 'ruta cortada' : 'rutas cortadas'}` : '',
  ].filter(Boolean)
  return {
    fromDeg: input.fromDeg,
    toDeg: input.toDeg,
    peopleWorse,
    peopleBetter,
    zonesNewlyExposed,
    routesCut,
    summary: parts.length ? parts.join(' · ') : 'El frente no cambia la cola ni los refugios en esta ventana',
  }
}

export function formConvoys(ranked: RankedCitizen[]): Convoy[] {
  const groups = new Map<string, RankedCitizen[]>()
  for (const citizen of ranked) {
    if (citizen.status === 'safe' || citizen.status === 'pending' || citizen.status === 'ringing') continue
    const locality = citizen.locality?.trim() || 'Sin núcleo'
    const group = groups.get(locality) ?? []
    group.push(citizen)
    groups.set(locality, group)
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([locality, members]) => {
      const guide = members.find(citizen => citizen.locationSource === 'gps') ?? members[0]
      return { id: `convoy-${locality}`, locality, guide, members, minute: Math.min(...members.map(citizen => citizen.minute)) }
    })
    .sort((a, b) => a.minute - b.minute)
}

export function aerialSectors(ranked: RankedCitizen[], settlements: Settlement[]): SectorPriority[] {
  if (!settlements.length) return []
  return settlements.map(place => {
    const inside = ranked.filter(citizen => {
      if (citizen.status === 'safe') return false
      const locality = citizen.locality ?? ''
      return locality === place.name || Math.hypot(citizen.lng - place.lng, citizen.lat - place.lat) < 0.015
    })
    return {
      name: place.name,
      count: inside.length,
      minute: inside.length ? Math.min(...inside.map(citizen => citizen.minute)) : Infinity,
      lng: place.lng,
      lat: place.lat,
    }
  }).filter(sector => sector.count > 0).sort((a, b) => b.count - a.count || a.minute - b.minute)
}
