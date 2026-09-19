import { destination, haversineMeters, bearingDeg, nearestZone } from './geo'
import { AGENTS } from './scenario'
import type { CallEvent, Citizen, SafeZone } from './types'

const RING_SEC = 2.4

export function advanceProtocol(
  citizens: Citizen[],
  zones: SafeZone[],
  elapsedSec: number,
  prevEvents: CallEvent[],
): { citizens: Citizen[]; events: CallEvent[] } {
  const events = [...prevEvents]
  const next = citizens.map((citizen, index) => {
    if (citizen.live) return citizen
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
          ? 'contestada · consiente ubicación · zona segura asignada'
          : citizen.outcome === 'informed'
            ? 'contestada · informado, no comparte ubicación'
            : citizen.outcome === 'no_answer'
              ? 'sin respuesta · reintento en cola'
              : 'contestada · rechaza seguimiento'
      events.push({
        id: `${citizen.id}-out`,
        ts: Date.now(),
        agent: AGENTS[index % AGENTS.length],
        citizenId: citizen.id,
        name: citizen.name,
        detail,
      })
      const nearest = nearestZone(citizen.lng, citizen.lat, zones)
      const status: Citizen['status'] =
        citizen.outcome === 'tracking' ? 'evacuating' : citizen.outcome
      return { ...citizen, status, safeZoneId: nearest.zone.id }
    }

    return citizen
  })

  return { citizens: next, events: events.slice(-80) }
}

export function moveEvacuees(
  citizens: Citizen[],
  zones: SafeZone[],
  dtSec: number,
): Citizen[] {
  return citizens.map((citizen) => {
    if (citizen.status !== 'evacuating') return citizen
    const zone = zones.find((item) => item.id === citizen.safeZoneId)
    if (!zone) return citizen

    const dist = haversineMeters(citizen.lng, citizen.lat, zone.lng, zone.lat)
    const step = (citizen.speedKmh * 1000 * dtSec) / 3600
    if (dist <= Math.max(zone.radiusM * 0.45, 30) || step >= dist) {
      return { ...citizen, lng: zone.lng, lat: zone.lat, status: 'safe' as const }
    }
    const brg = bearingDeg(citizen.lng, citizen.lat, zone.lng, zone.lat)
    const [lng, lat] = destination(citizen.lng, citizen.lat, brg, step)
    return { ...citizen, lng, lat }
  })
}
