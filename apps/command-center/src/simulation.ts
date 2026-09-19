import { destination, haversineMeters, bearingDeg } from './geo'
import { AGENTS } from './scenario'
import type { CallEvent, Citizen, SafeZone } from './types'

const RING_SEC = 2.4

export function advanceProtocol(
  citizens: Citizen[],
  elapsedSec: number,
  prevEvents: CallEvent[],
): { citizens: Citizen[]; events: CallEvent[] } {
  const events = [...prevEvents]
  const next = citizens.map((citizen, index): Citizen => {
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
            ? 'En el guion de demostración, la persona recibe el aviso y comparte una ubicación dentro de su localidad. No se infiere que haya salido ni se le asigna un destino.'
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
    if (citizen.live || citizen.status !== 'evacuating') return citizen
    const zone = zones.find((item) => item.id === citizen.safeZoneId)
    if (!zone) return citizen

    const dist = haversineMeters(citizen.lng, citizen.lat, zone.lng, zone.lat)
    const step = (citizen.speedKmh * 1000 * dtSec) / 3600
    if (dist <= Math.max(zone.radiusM * 0.45, 30) || step >= dist) {
      return { ...citizen, lng: zone.lng, lat: zone.lat, status: 'safe' as const }
    }
    const brg = bearingDeg(citizen.lng, citizen.lat, zone.lng, zone.lat)
    const [lng, lat] = destination(citizen.lng, citizen.lat, brg, step)
    return { ...citizen, lng, lat, locationUpdatedAt: Date.now() }
  })
}
