// Puente con la centralita HappyRobot (sim/centralita/server.mjs).
// El mapa envía una "ola" de personas; el puente ejecuta una conversación
// real Vigía↔vecino por persona y expone el resultado en /wave/status.

import { haversineMeters } from './geo'
import { groupSize, zoneUsage } from './simulation'
import { SAFE_ZONES } from './scenario'
import type { Citizen, SafeZone } from './types'

export const BRIDGE_URL = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? 'http://127.0.0.1:8787'

const WAVE_LOCALITIES = new Set(['Guisando'])
const PERSONALITIES = ['cooperative', 'anxious', 'reluctant', 'confused']

export type BridgeInstruction = {
  say_this: string
  exit_name: string
  minutes_to_front: number | null
  urgency: string
}

export type BridgeCall = {
  person_id: string
  state: 'queued' | 'talking' | 'done' | 'failed'
  startedAt: string | null
  endedAt: string | null
  transcript: { ts: string; speaker: string; text: string }[]
  outcome: {
    run_id?: string
    transcript_url?: string
    answered?: boolean
    agent_notes?: string
    partial?: boolean
    extracted?: Record<string, unknown>
  } | null
  partials: unknown[]
  links: unknown[]
  instruction: BridgeInstruction | null
  consent_position?: boolean
  endReason: string | null
}

export type WavePerson = {
  agent: Record<string, string>
  persona: Record<string, string>
  instruction: BridgeInstruction
}

function idNumber(id: string) {
  const digits = id.replace(/\D/g, '')
  return Number(digits || '0')
}

// Demo: los dos puntos de encuentro de Guisando, alternados (2 y 2) entre los llamados.
const WAVE_ZONE_IDS = ['z-dehesa', 'z-risquillo']
export function waveZoneFor(index: number, zones: SafeZone[] = SAFE_ZONES) {
  return zones.find((zone) => zone.id === WAVE_ZONE_IDS[index % WAVE_ZONE_IDS.length]) ?? zones[0]
}

function zoneFor(citizen: Citizen, citizens: Citizen[], zones: SafeZone[] = SAFE_ZONES) {
  const size = groupSize(citizen)
  return [...zones]
    .sort((a, b) => haversineMeters(citizen.lng, citizen.lat, a.lng, a.lat) - haversineMeters(citizen.lng, citizen.lat, b.lng, b.lat))
    .find((zone) => zoneUsage(citizens, zone.id).reservedPeople + size <= zone.capacity) ?? null
}

export function pickWaveCitizens(citizens: Citizen[], count = 4) {
  const eligible = citizens.filter((citizen) =>
    citizen.resident === true &&
    citizen.outcome === 'tracking' &&
    citizen.status === 'pending' &&
    citizen.group?.mobility !== 'pickup' &&
    WAVE_LOCALITIES.has(citizen.locality ?? '') &&
    !citizen.hrCall &&
    zoneFor(citizen, citizens) !== null)
  const shuffled = [...eligible]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

function nearestNeighborName(citizen: Citizen, citizens: Citizen[]) {
  let best: Citizen | null = null
  let bestD = Infinity
  for (const other of citizens) {
    if (other.id === citizen.id || other.resident !== true) continue
    const d = haversineMeters(citizen.lng, citizen.lat, other.lng, other.lat)
    if (d < bestD) {
      best = other
      bestD = d
    }
  }
  return best?.name ?? 'ninguno conocido'
}

function householdText(citizen: Citizen) {
  const group = citizen.group
  if (!group) return 'sin datos'
  const parts = [`${group.adults} adulto${group.adults === 1 ? '' : 's'}`]
  if (group.children) parts.push(`${group.children} menor${group.children === 1 ? '' : 'es'}`)
  if (group.olderAdults) parts.push(`${group.olderAdults} mayor${group.olderAdults === 1 ? '' : 'es'}`)
  return parts.join(', ')
}

export function buildWavePeople(citizens: Citizen[], selected: Citizen[]): WavePerson[] {
  return selected.map((citizen, index) => {
    const n = idNumber(citizen.id)
    const zone = waveZoneFor(index)
    const address = `Calle Real ${1 + (n % 60)}`
    const group = citizen.group
    const mobility = group?.mobility ?? 'walking'
    const instruction: BridgeInstruction = {
      exit_name: `${zone.code} ${zone.name}`,
      say_this: `Salga hacia ${zone.name.split(' · ')[0]}, en ${zone.name.split(' · ')[1] ?? citizen.locality}. No suba hacia el monte y no cruce la zona del incendio.`,
      minutes_to_front: null,
      urgency: 'high',
    }
    return {
      agent: {
        person_id: citizen.id,
        house_id: `h-${citizen.id}`,
        phone: `+346009900${String(n % 100).padStart(2, '0')}`,
        first_name: citizen.name.split(' ')[0],
        village: citizen.locality ?? '',
        address: `dirección censada en ${citizen.locality ?? ''}`,
        priority: '0.80',
        assigned_shelter: instruction.exit_name,
        say_this: instruction.say_this,
        vulnerable_flag: citizen.vulnerable ? 'sí' : 'no',
        known_context: `núcleo de ${groupSize(citizen)} según censo`,
      },
      persona: {
        person_id: citizen.id,
        name: citizen.name,
        age: String(34 + ((n * 7) % 51)),
        village: citizen.locality ?? '',
        address,
        household: householdText(citizen),
        mobility: mobility === 'assisted' ? 'reduced' : mobility === 'vehicle' ? 'car' : mobility === 'pickup' ? 'immobile' : 'walking',
        has_car: mobility === 'vehicle' ? 'true' : 'false',
        seats_free: mobility === 'vehicle' ? '2' : '0',
        has_smartphone: mobility === 'pickup' ? 'false' : 'true',
        personality: PERSONALITIES[index % PERSONALITIES.length],
        neighbors_known: nearestNeighborName(citizen, citizens),
        vulnerable_note: (group?.olderAdults ?? 0) > 0 ? 'mi madre de 87 años anda despacio' : 'ninguna',
        is_away: 'false',
        true_location: address,
        has_animals: n % 2 === 0 ? 'un perro' : 'ninguno',
      },
      instruction,
    }
  })
}

export async function startWave(people: WavePerson[], concurrency = 4) {
  const res = await fetch(`${BRIDGE_URL}/wave/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people, concurrency }),
  })
  if (!res.ok) throw new Error(`wave/start → ${res.status}`)
  return res.json() as Promise<{ ok: boolean; queued: number }>
}

export async function fetchWaveStatus() {
  const res = await fetch(`${BRIDGE_URL}/wave/status`)
  if (!res.ok) throw new Error(`wave/status → ${res.status}`)
  return res.json() as Promise<{ calls: BridgeCall[] }>
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : { description: String(item) }))
}

function asText(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined ? '' : String(value)
}

// Aplica el estado del puente a los ciudadanos con hrCall.
export function applyWaveStatus(current: Citizen[], calls: BridgeCall[]): Citizen[] {
  if (!calls?.length) return current
  const byId = new Map(calls.map((call) => [call.person_id, call]))
  return current.map((citizen) => {
    const call = byId.get(citizen.id)
    if (!call || !citizen.hrCall) return citizen
    const hrCall = {
      ...citizen.hrCall,
      state: call.state,
      transcript: call.transcript ?? citizen.hrCall.transcript,
      endReason: call.endReason ?? citizen.hrCall.endReason,
    }
    let next: Citizen = { ...citizen, hrCall }
    const outcome = call.outcome
    if (!outcome || outcome.partial === true || hrCall.outcomeApplied) return next
    hrCall.outcomeApplied = true
    hrCall.runUrl = outcome.transcript_url ?? hrCall.runUrl
    const extracted = outcome.extracted ?? {}
    const consent = call.consent_position === true || extracted.consent_position === true ? 'granted' as const : 'declined' as const
    if (outcome.answered === false) {
      return { ...next, status: 'no_answer' }
    }
    if (outcome.answered !== true) return next
    const vulnerablePeople = asList(extracted.vulnerable_people)
    const neighbors = asList(extracted.neighbors_mentioned)
    const household = [
      ...neighbors.map((item) => ({
        name: asText(item.name ?? item.description ?? item) || 'Vecino mencionado',
        situation: asText(item.situation ?? item.note) || 'Mencionado en la conversación',
        source: 'Conversación HappyRobot',
      })),
      ...vulnerablePeople.map((item) => ({
        name: asText(item.description ?? item.name) || 'Persona vulnerable',
        situation: asText(item.needs) || 'Necesidad declarada en la conversación',
        source: 'Conversación HappyRobot',
      })),
    ]
    let group = citizen.group
    const peopleAtHome = typeof extracted.people_at_home === 'number' ? extracted.people_at_home : Number(extracted.people_at_home)
    if (group && Number.isFinite(peopleAtHome)) {
      const others = group.children + group.olderAdults
      group = { ...group, adults: Math.max(1, peopleAtHome - others) }
    }
    const callInfo = {
      answeredAt: Date.now(),
      agent: 'HappyRobot · Vigía',
      summary: outcome.agent_notes || 'Conversación real por chat en HappyRobot',
      consent,
      needs: vulnerablePeople.map((item) => `${asText(item.description)} · ${asText(item.needs)}`.replace(/\s·\s$/, ' · sin detalle')),
    }
    const confirmed = {
      ...next,
      call: callInfo,
      group,
      household: household.length ? household : citizen.household,
      confirmedAt: citizen.confirmedAt,
    }
    if (extracted.will_evacuate === true) {
      // Con consentimiento la posición pasa a "compartida · demo"; sin él se
      // mantiene la referencia censada (no se inventa un GPS) y el grupo no se mueve.
      return consent === 'granted'
        ? { ...confirmed, status: 'tracking', locationSource: 'simulation', locationUpdatedAt: Date.now() }
        : { ...confirmed, status: 'tracking', locationUpdatedAt: Date.now() }
    }
    if (extracted.will_evacuate === false) {
      return { ...confirmed, status: 'assistance', assistanceReason: 'No confirma que salga; rellamada pendiente' }
    }
    return confirmed
  })
}
