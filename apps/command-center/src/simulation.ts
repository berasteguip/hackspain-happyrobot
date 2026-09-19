import { destination, haversineMeters, bearingDeg, pointInRing } from './geo'
import { nearestOnRoute, positionAt } from './routing'
import type { Route, RouteIndex } from './routing'
import { AGENTS, SETTLEMENTS } from './scenario'
import type { CallArea, CallEvent, Citizen, RiskArea, SafeZone } from './types'

const RING_SEC = 2.4
/** Tiempo entre el fin de la llamada y la salida de casa. */
const DEPARTURE_SEC = 6
/** El reloj de la demo corre acelerado para que un trayecto real quepa en la presentación. */
const TIME_SCALE = 12
/** Trayecto a pie desde el punto de partida hasta la carretera más cercana. */
const ACCESS_SPEED_KMH = 5

export function selectAreaIds(citizens: Citizen[], area: CallArea | null): string[] {
  if (!area || ![area.lng, area.lat, area.radiusM].every(Number.isFinite) || Math.abs(area.lng) > 180 || Math.abs(area.lat) > 90 || area.radiusM <= 0 || area.radiusM > 20000) return []
  return citizens.filter(citizen => haversineMeters(area.lng, area.lat, citizen.lng, citizen.lat) <= area.radiusM + 1e-6).map(citizen => citizen.id)
}

export function selectContactLocalities(recommended: RiskArea | null, manual: CallArea[]): string[] {
  return SETTLEMENTS.filter(place => recommended && pointInRing(place.lng, place.lat, recommended.coordinates) || manual.some(area => [area.lng, area.lat, area.radiusM].every(Number.isFinite) && Math.abs(area.lng) <= 180 && Math.abs(area.lat) <= 90 && area.radiusM > 0 && area.radiusM <= 20000 && haversineMeters(area.lng, area.lat, place.lng, place.lat) <= area.radiusM)).map(place => place.name)
}

export function contactCandidateIds(citizens: Citizen[], localities: string[]) {
  const selected = new Set(localities)
  return citizens.filter(citizen => citizen.resident !== false && selected.has(citizen.locality ?? '')).map(citizen => citizen.id)
}

export function hasSharedLocation(citizen: Citizen) {
  if (!Number.isFinite(citizen.lng) || !Number.isFinite(citizen.lat)) return false
  if (citizen.locationSource === 'gps') return true
  return citizen.locationSource === 'simulation' && Boolean(citizen.live || citizen.call?.consent === 'granted' && (!citizen.hrCall || citizen.hrCall.outcomeApplied === true))
}

export function prepareAreaCampaign(citizens: Citizen[], selectedIds: string[], elapsedSec: number, enrolled: ReadonlySet<string>) {
  const selected = new Set(selectedIds)
  const addedIds = citizens.filter(citizen => selected.has(citizen.id) && !enrolled.has(citizen.id) && !citizen.live && citizen.status === 'pending').map(citizen => citizen.id)
  const offset = citizens.reduce((latest, citizen) => enrolled.has(citizen.id) && ['pending', 'ringing'].includes(citizen.status) ? Math.max(latest, citizen.callDelaySec + RING_SEC) : latest, elapsedSec)
  const schedule = new Map(addedIds.map((id, index) => [id, offset + 1 + Math.floor(index / AGENTS.length) * (RING_SEC + 0.6)]))
  return {
    citizens: citizens.map(citizen => schedule.has(citizen.id) ? { ...citizen, callDelaySec: schedule.get(citizen.id)! } : citizen),
    ids: [...new Set([...enrolled, ...addedIds])],
    addedIds,
  }
}

export function advanceProtocol(
  citizens: Citizen[],
  elapsedSec: number,
  prevEvents: CallEvent[],
  campaignIds?: ReadonlySet<string>,
): { citizens: Citizen[]; events: CallEvent[] } {
  const events = [...prevEvents]
  const next = citizens.map((citizen, index): Citizen => {
    if (citizen.live || citizen.locationSource === 'gps' || campaignIds && !campaignIds.has(citizen.id)) return citizen
    if (citizen.hrCall && (!citizen.hrCall.outcomeApplied || citizen.hrCall.state !== 'done' || citizen.hrCall.willEvacuate !== true)) return citizen
    if (citizen.status === 'safe' || citizen.status === 'refused') return citizen
    if (citizen.status === 'no_answer') return citizen
    if (citizen.status === 'informed') return citizen

    if (citizen.status === 'pending' && elapsedSec >= citizen.callDelaySec) {
      events.push({
        id: `${citizen.id}-ring`,
        ts: Date.now(),
        agent: AGENTS[index % AGENTS.length],
        citizenId: citizen.id,
        name: citizen.name,
        detail: citizen.vulnerable
          ? 'llamando · prioridad alta'
          : 'llamando',
      })
      return { ...citizen, status: 'ringing' as const }
    }

    if (
      citizen.status === 'ringing' &&
      elapsedSec >= citizen.callDelaySec + RING_SEC
    ) {
      const detail =
        citizen.outcome === 'tracking'
          ? 'contestada · comparte ubicación en la demo'
          : citizen.outcome === 'informed'
            ? 'contestada · informado, no comparte ubicación'
            : citizen.outcome === 'no_answer'
              ? 'sin respuesta · pendiente de revisión'
              : 'contestada · rechaza seguimiento'
      events.push({
        id: `${citizen.id}-out`,
        ts: Date.now(),
        agent: AGENTS[index % AGENTS.length],
        citizenId: citizen.id,
        name: citizen.name,
        detail,
      })
      const status: Citizen['status'] = citizen.outcome
      const answered = citizen.outcome !== 'no_answer'
      return {
        ...citizen,
        status,
        locationSource: citizen.outcome === 'tracking' ? 'simulation' : citizen.locationSource,
        locationUpdatedAt: citizen.outcome === 'tracking' ? Date.now() : citizen.locationUpdatedAt,
        call: answered ? {
          answeredAt: Date.now(),
          agent: AGENTS[index % AGENTS.length],
          summary: citizen.outcome === 'tracking'
            ? 'En el guion de demostración, la persona recibe el aviso y comparte su ubicación. Solo se simula la salida con consentimiento y un recorrido a un refugio fuera de la zona expuesta. No es un desplazamiento real.'
            : citizen.outcome === 'informed'
              ? 'En el guion de demostración, la persona recibe el aviso. No se obtiene una nueva ubicación.'
              : 'En el guion de demostración, la persona rechaza compartir su ubicación. Se conserva únicamente la referencia inicial.',
          consent: citizen.outcome === 'tracking' ? 'granted' : 'declined',
          needs: citizen.vulnerable ? ['Necesidad de apoyo pendiente de valoración humana'] : [],
        } : undefined,
        household: answered && citizen.id === 'c-01' ? [
          { name: 'Familiar A · dato ficticio', situation: 'La interlocutora indica que está con ella', source: 'Guion de llamada · sin confirmación independiente' },
          { name: 'Familiar B · dato ficticio', situation: 'Ubicación desconocida', source: 'Guion de llamada · pendiente de contacto' },
        ] : citizen.household,
      }
    }

    if (
      citizen.status === 'tracking' &&
      elapsedSec >= (citizen.hrCall?.departureAt ?? citizen.callDelaySec + RING_SEC + DEPARTURE_SEC)
    ) {
      if (!citizen.call || citizen.call.consent !== 'granted' || !citizen.routeId || !citizen.safeZoneId) return { ...citizen, status: 'assistance', routeHoldReason: citizen.routeHoldReason ?? 'Esperando un recorrido validado. No se inicia el desplazamiento.' }
      events.push({
        id: `${citizen.id}-move`,
        ts: Date.now(),
        agent: AGENTS[index % AGENTS.length],
        citizenId: citizen.id,
        name: citizen.name,
        detail: 'sale hacia el punto de encuentro · simulación',
      })
      return { ...citizen, status: 'evacuating' as const }
    }

    return citizen
  })

  return { citizens: next, events: events.slice(-80) }
}

function hash01(value: string, salt: number) {
  let acc = salt
  for (let i = 0; i < value.length; i += 1) acc = (acc * 31 + value.charCodeAt(i)) % 100_003
  return acc / 100_003
}

/** Reparte a los que llegan dentro del recinto para que no se apilen en un único píxel. */
function parkingSpot(zone: SafeZone, id: string): [number, number] {
  const bearing = hash01(id, 7) * 360
  const spread = zone.radiusM * 0.8 * Math.sqrt(hash01(id, 733))
  return destination(zone.lng, zone.lat, bearing, spread)
}

/** Corredor con el asfalto más cercano a la persona, entre los que llevan a su punto de encuentro. */
function pickRoute(citizen: Citizen, routes: RouteIndex) {
  let best: { route: Route; alongM: number; gapM: number } | null = null
  for (const route of routes.values()) {
    if (route.id !== citizen.routeId || route.zoneId !== citizen.safeZoneId || route.group !== (citizen.locality ?? '')) continue
    const { alongM, gapM } = nearestOnRoute(route, citizen.lng, citizen.lat)
    if (!best || gapM < best.gapM) best = { route, alongM, gapM }
  }
  return best
}

export function moveEvacuees(
  citizens: Citizen[],
  routes: RouteIndex,
  zones: SafeZone[],
  dtSec: number,
): Citizen[] {
  if (dtSec <= 0) return citizens
  return citizens.map((citizen): Citizen => {
    if (citizen.live || citizen.locationSource === 'gps' || citizen.status !== 'evacuating') return citizen
    if (citizen.hrCall && (!citizen.hrCall.outcomeApplied || citizen.hrCall.state !== 'done' || citizen.hrCall.willEvacuate !== true || !['car', 'walking'].includes(citizen.mobility ?? '') || citizen.hrCall.zoneId !== citizen.safeZoneId)) return citizen
    if (!citizen.call || citizen.call.consent !== 'granted') return { ...citizen, status: 'assistance', routeHoldReason: 'Sin llamada respondida y consentimiento. No se inicia el movimiento.' }
    const zone = zones.find((item) => item.id === citizen.safeZoneId)
    if (!zone) return { ...citizen, status: 'assistance', routeHoldReason: 'Sin destino validado. Pendiente de revisión del mando.' }

    let route = citizen.routeId ? routes.get(citizen.routeId) : undefined
    let progressM = citizen.routeProgressM ?? 0
    let phase = citizen.routePhase ?? 'access'
    if (!route) {
      const picked = pickRoute(citizen, routes)
      if (picked) {
        route = picked.route
        progressM = picked.alongM
        phase = 'access'
      }
    }

    // Sin cartografía de rutas (API caída u offline) se mantiene la posición.
    if (!route || route.zoneId !== citizen.safeZoneId || route.group !== (citizen.locality ?? '')) {
      return { ...citizen, status: 'assistance', routeHoldReason: 'Sin recorrido validado para esta persona. Pendiente de revisión del mando.' }
    }

    if (phase === 'access') {
      const [targetLng, targetLat] = positionAt(route, progressM)
      const gap = haversineMeters(citizen.lng, citizen.lat, targetLng, targetLat)
      const step = (ACCESS_SPEED_KMH * 1000 * dtSec * TIME_SCALE) / 3600
      const reached = step >= gap
      const [lng, lat] = reached
        ? [targetLng, targetLat]
        : destination(citizen.lng, citizen.lat, bearingDeg(citizen.lng, citizen.lat, targetLng, targetLat), step)
      return {
        ...citizen,
        lng, lat,
        routeId: route.id,
        routeProgressM: progressM,
        routePhase: reached ? 'road' : 'access',
        locationUpdatedAt: Date.now(),
      }
    }

    const nextProgress = progressM + (citizen.speedKmh * 1000 * dtSec * TIME_SCALE) / 3600
    if (nextProgress >= route.lengthM) {
      const [lng, lat] = parkingSpot(zone, citizen.id)
      return {
        ...citizen,
        lng, lat,
        status: 'safe',
        routeId: route.id,
        routeProgressM: route.lengthM,
        routePhase: 'road',
        locationUpdatedAt: Date.now(),
      }
    }
    const [lng, lat] = positionAt(route, nextProgress)
    return {
      ...citizen,
      lng, lat,
      routeId: route.id,
      routeProgressM: nextProgress,
      routePhase: 'road',
      locationUpdatedAt: Date.now(),
    }
  })
}
