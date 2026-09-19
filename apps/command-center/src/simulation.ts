import { positionAlongRoute } from './geo'
import { AGENTS, SAFE_ZONES } from './scenario'
import type { CallEvent, Citizen, SafeZone } from './types'

export const DEMO_TIME_SCALE = 20
const RING_SEC = 40

export function groupSize(citizen: Pick<Citizen, 'group'>) {
  const group = citizen.group
  return group ? group.adults + group.children + group.olderAdults : 1
}

export function zoneUsage(citizens: Citizen[], zoneId: string) {
  const groups = citizens.filter((citizen) => !citizen.live && citizen.locationSource === 'simulation' && citizen.journey?.zoneId === zoneId && ['preparing', 'evacuating', 'safe'].includes(citizen.status))
  const arrived = groups.filter((citizen) => citizen.status === 'safe')
  const reservedPeople = groups.reduce((sum, citizen) => sum + groupSize(citizen), 0)
  const arrivedPeople = arrived.reduce((sum, citizen) => sum + groupSize(citizen), 0)
  return { reservedPeople, arrivedPeople, inboundPeople: reservedPeople - arrivedPeople, groups: groups.length, arrivedGroups: arrived.length }
}

export function advanceProtocol(
  citizens: Citizen[],
  elapsedSec: number,
  prevEvents: CallEvent[],
  zones: SafeZone[] = SAFE_ZONES,
): { citizens: Citizen[]; events: CallEvent[] } {
  const events = [...prevEvents]
  const reserved = new Map(zones.map((zone) => [zone.id, zoneUsage(citizens, zone.id).reservedPeople]))
  const emit = (citizen: Citizen, stage: string, detail: string, agent = citizen.call?.agent ?? 'Coordinación · demo') => {
    events.push({ id: `${citizen.id}-${stage}`, ts: Date.now(), agent, citizenId: citizen.id, name: citizen.name, detail })
  }
  const next = citizens.map((citizen, index): Citizen => {
    if (citizen.live || citizen.locationSource === 'gps') return citizen
    // Un grupo con conversación real de HappyRobot en curso espera su resultado;
    // no lo mueve la máquina simulada. Al terminar (done/failed) vuelve al flujo.
    if (citizen.hrCall && citizen.hrCall.state !== 'done' && citizen.hrCall.state !== 'failed') return citizen
    if (['safe', 'refused', 'no_answer', 'informed', 'assistance'].includes(citizen.status)) return citizen
    if (['routing', 'preparing', 'evacuating'].includes(citizen.status) && (citizen.call?.consent !== 'granted' || citizen.locationSource !== 'simulation')) return citizen

    if (citizen.status === 'pending' && elapsedSec >= citizen.callDelaySec) {
      emit(citizen, 'ring', 'Contacto con el representante · simulación', AGENTS[index % AGENTS.length])
      return { ...citizen, status: 'ringing' }
    }
    if (citizen.status === 'ringing' && elapsedSec >= citizen.callDelaySec + RING_SEC + index % 4 * 5) {
      const answered = citizen.outcome !== 'no_answer'
      const tracking = citizen.outcome === 'tracking'
      const members = groupSize(citizen)
      const summary = !answered ? 'Sin respuesta; no se confirma la posición ni se inicia movimiento.'
        : tracking ? `Guion de demo: el representante confirma su ubicación y un grupo de ${members} persona${members === 1 ? '' : 's'}. ${citizen.group?.mobility === 'pickup' ? 'Solicita recogida; no puede desplazarse de forma autónoma.' : 'Confirma que el grupo puede desplazarse y espera un punto de encuentro.'}`
          : citizen.outcome === 'informed' ? 'Guion de demo: recibe el aviso, pero no comparte ubicación. No se simula un desplazamiento.'
            : 'Guion de demo: rechaza compartir ubicación. No se simula un desplazamiento.'
      emit(citizen, 'out', summary, AGENTS[index % AGENTS.length])
      return {
        ...citizen,
        status: citizen.outcome,
        confirmedAt: answered ? elapsedSec : undefined,
        locationSource: tracking ? 'simulation' : citizen.locationSource,
        locationUpdatedAt: tracking ? Date.now() : citizen.locationUpdatedAt,
        call: answered ? {
          answeredAt: Date.now(), agent: AGENTS[index % AGENTS.length], summary,
          consent: tracking ? 'granted' : 'declined',
          needs: citizen.group?.mobility === 'pickup' ? ['Recogida pendiente de un operador']
            : citizen.group?.mobility === 'assisted' ? ['Desplazamiento acompañado, según guion de demo'] : [],
        } : undefined,
        household: answered && citizen.group ? [
          { name: 'Adultos', situation: `${citizen.group.adults}, incluido el representante`, source: 'Confirmación simulada del interlocutor' },
          ...(citizen.group.children ? [{ name: 'Menores acompañados', situation: `${citizen.group.children} con el grupo`, source: 'Confirmación simulada del interlocutor' }] : []),
          ...(citizen.group.olderAdults ? [{ name: 'Personas mayores', situation: `${citizen.group.olderAdults} con el grupo`, source: 'Confirmación simulada del interlocutor' }] : []),
        ] : undefined,
      }
    }
    if (citizen.status === 'tracking' && citizen.call?.consent === 'granted' && citizen.locationSource === 'simulation') {
      if (citizen.group?.mobility === 'pickup') {
        const reason = 'Recogida solicitada. El grupo permanece localizado hasta que un operador organice la asistencia.'
        emit(citizen, 'assistance', reason)
        return { ...citizen, status: 'assistance', assistanceReason: reason }
      }
      return { ...citizen, status: 'routing', routeState: undefined }
    }
    if (citizen.status === 'routing' && citizen.routeState === 'ready') {
      const option = [...(citizen.routeOptions ?? [])].sort((a, b) => a.distanceM - b.distanceM).find((route) => {
        const zone = zones.find((item) => item.id === route.zoneId)
        return zone && (reserved.get(zone.id) ?? 0) + groupSize(citizen) <= zone.capacity
      })
      if (!option) {
        const reason = citizen.assistanceReason ?? 'Los puntos consultados no tienen plazas para el grupo completo. Requiere coordinación.'
        emit(citizen, 'assistance', reason)
        return { ...citizen, status: 'assistance', assistanceReason: reason, safeZoneId: '' }
      }
      const zone = zones.find((item) => item.id === option.zoneId)!
      reserved.set(zone.id, (reserved.get(zone.id) ?? 0) + groupSize(citizen))
      const preparation = citizen.group?.preparationSec ?? 45
      emit(citizen, 'assigned', `${zone.code} · ${zone.name}. ${groupSize(citizen)} plazas reservadas en la demo; el grupo se prepara.`)
      return {
        ...citizen, status: 'preparing', safeZoneId: zone.id,
        routeOptions: undefined, assistanceReason: undefined,
        journey: { ...option, departureAt: elapsedSec + preparation, distanceTravelledM: 0 },
        call: citizen.call ? { ...citizen.call, summary: `${citizen.call.summary} Punto comunicado en la demo: ${zone.name}. El grupo confirma el destino y prepara la salida.` } : undefined,
      }
    }
    if ((citizen.status === 'preparing' || citizen.status === 'evacuating') && citizen.journey) {
      const journey = citizen.journey
      if (elapsedSec <= journey.departureAt) return citizen
      if (citizen.speedKmh <= 0) return citizen
      if (citizen.status === 'preparing') emit(citizen, 'depart', `El grupo inicia el recorrido simulado a ${citizen.speedKmh.toFixed(1)} km/h.`)
      const distanceTravelledM = Math.min(journey.distanceM, (elapsedSec - journey.departureAt) * citizen.speedKmh * 1000 / 3600)
      const [lng, lat] = positionAlongRoute(journey.coordinates, distanceTravelledM)
      const arrived = distanceTravelledM >= journey.distanceM
      if (arrived) emit(citizen, 'arrive', `Llegada simulada de ${groupSize(citizen)} personas al punto de encuentro. No es una confirmación operativa real.`)
      return {
        ...citizen, lng, lat, status: arrived ? 'safe' : 'evacuating', locationUpdatedAt: Date.now(),
        journey: { ...journey, distanceTravelledM, arrivedAt: arrived ? elapsedSec : undefined },
      }
    }
    return citizen
  })
  return { citizens: next, events: events.slice(-1800) }
}
