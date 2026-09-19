// Puente con la centralita HappyRobot (sim/centralita/server.mjs).
// El mapa envía una "ola" de personas; el puente ejecuta una conversación
// real Vigía↔vecino por persona y expone el resultado en /wave/status.

import { haversineMeters } from './geo'
import { SAFE_ZONES } from './scenario'
import type { Citizen, SafeZone } from './types'

export const BRIDGE_URL = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? '/bridge'
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
  resultState?: 'pending' | 'ready' | 'failed'
  outcomeError?: string | null
  trackingId?: string
  startedAt?: string | null
  instruction?: BridgeInstruction | null
  transcript: { ts: string; speaker: string; text: string }[]
  outcome: {
    run_id?: string
    transcript_url?: string
    answered?: boolean
    agent_notes?: string
    partial?: boolean
    extracted?: Record<string, unknown>
  } | null
  endReason?: string | null
}

export type WavePerson = {
  tracking_id: string
  agent: Record<string, string>
  persona: Record<string, string>
  instruction: BridgeInstruction
}

function idNumber(id: string) {
  return Number(id.replace(/\D/g, '') || '0')
}

// Demo: los dos puntos de encuentro de Guisando, alternados (2 y 2) entre los llamados.
const WAVE_ZONE_IDS = ['z-dehesa', 'z-risquillo']
export function waveZoneFor(index: number, zones: SafeZone[] = SAFE_ZONES) {
  return zones.find(zone => zone.id === WAVE_ZONE_IDS[index % WAVE_ZONE_IDS.length]) ?? zones[0]
}

export function pickWaveCitizens(citizens: Citizen[], count = 4, selectedIds?: ReadonlySet<string>) {
  return citizens.filter(citizen => !citizen.live && citizen.locationSource !== 'gps' && citizen.status === 'pending' && !citizen.hrCall && (selectedIds ? selectedIds.has(citizen.id) : citizen.locality === 'Guisando')).slice(0, Math.min(4, Math.max(0, count)))
}

export function demoMobility(citizen: Citizen): NonNullable<Citizen['mobility']> {
  return citizen.mobility ?? (citizen.speedKmh > 8 ? 'car' : 'walking')
}

export function householdSize(citizen: Citizen) {
  return citizen.householdSize ?? 1 + idNumber(citizen.id) % 4
}

export function reservedPeople(citizens: Citizen[], zoneId: string) {
  return citizens.filter(citizen => !citizen.live && citizen.locationSource !== 'gps' && citizen.hrCall?.zoneId === zoneId && citizen.hrCall.resultState !== 'failed' && (!citizen.hrCall.outcomeApplied || ['tracking', 'routing', 'evacuating', 'safe'].includes(citizen.status))).reduce((total, citizen) => total + householdSize(citizen), 0)
}

function nearestNeighborName(citizen: Citizen, citizens: Citizen[]) {
  return [...citizens].filter(other => other.id !== citizen.id && other.resident === true)
    .sort((a, b) => haversineMeters(citizen.lng, citizen.lat, a.lng, a.lat) - haversineMeters(citizen.lng, citizen.lat, b.lng, b.lat))[0]?.name ?? 'ninguno conocido'
}

export function buildWavePeople(citizens: Citizen[], selected: Citizen[]): WavePerson[] {
  return selected.map((citizen, index) => {
    const n = idNumber(citizen.id)
    const zone = SAFE_ZONES.find(item => item.id === citizen.hrCall?.zoneId)
    const address = `Calle Real ${1 + n % 60}`
    const mobility = demoMobility(citizen)
    const personId = citizen.hrCall?.personId ?? citizen.id
    const instruction: BridgeInstruction = {
      exit_name: zone ? `${zone.code} ${zone.name}` : 'Pendiente de asistencia',
      say_this: zone ? `Su punto de encuentro es ${zone.name}. No cruce la zona del incendio. Si no puede desplazarse, dígamelo para registrar la necesidad de asistencia.` : 'No tiene un recorrido validado. No inicie un traslado hacia un punto de encuentro sin instrucciones del puesto de mando; queda pendiente de asistencia.',
      minutes_to_front: null,
      urgency: 'high',
    }
    return {
      tracking_id: citizen.id,
      agent: {
        person_id: personId, house_id: `h-${personId}`, phone: `+3460099${String(n).padStart(4, '0')}`,
        first_name: citizen.name.split(' ')[0], village: citizen.locality ?? '',
        address: `dirección censada en ${citizen.locality ?? ''}`, priority: '0.80',
        assigned_shelter: instruction.exit_name, say_this: instruction.say_this,
        vulnerable_flag: citizen.vulnerable ? 'sí' : 'no', known_context: `núcleo de ${householdSize(citizen)} según datos sintéticos`,
      },
      persona: {
        person_id: personId, name: citizen.name, age: String(34 + n * 7 % 51), village: citizen.locality ?? '', address,
        household: `${householdSize(citizen)} personas en total, incluyéndome`, mobility,
        has_car: String(mobility === 'car'), seats_free: mobility === 'car' ? '1' : '0', has_smartphone: 'true',
        personality: PERSONALITIES[index % PERSONALITIES.length], neighbors_known: nearestNeighborName(citizen, citizens),
        vulnerable_note: citizen.vulnerable ? 'necesito que revisen si hace falta apoyo para el traslado' : 'ninguna',
        is_away: 'false', true_location: address, has_animals: n % 2 === 0 ? 'un perro' : 'ninguno',
      },
      instruction,
    }
  })
}

export async function startWave(people: WavePerson[], concurrency = 4) {
  const res = await fetch(`${BRIDGE_URL}/wave/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people, concurrency }), signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`wave/start → ${res.status}`)
  return res.json() as Promise<{ ok: boolean; queued: number }>
}

export async function fetchWaveStatus(signal?: AbortSignal) {
  const res = await fetch(`${BRIDGE_URL}/wave/status`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`wave/status → ${res.status}`)
  return res.json() as Promise<{ calls: BridgeCall[] }>
}

export function restoreWave(current: Citizen[], calls: BridgeCall[], elapsed = 0) {
  const latest = [...calls].sort((a, b) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''))[0]
  if (!latest) return current
  const suffix = latest.person_id.includes('--') ? latest.person_id.split('--')[1] : null
  const batch = calls.filter(call => suffix ? call.person_id.endsWith(`--${suffix}`) : call.person_id === latest.person_id)
  const byId = new Map(batch.map(call => [call.trackingId ?? call.person_id.split('--')[0], call]))
  const restored = current.map((citizen): Citizen => {
    const call = byId.get(citizen.id)
    if (!call || citizen.live || citizen.locationSource === 'gps' || citizen.hrCall) return citizen
    const zone = SAFE_ZONES.find(zone => `${zone.code} ${zone.name}` === call.instruction?.exit_name)
    return { ...citizen, status: 'pending', hrCall: { personId: call.person_id, state: call.state, resultState: call.resultState, transcript: call.transcript, zoneId: zone?.id } }
  })
  return applyWaveStatus(restored, batch, elapsed)
}

export function canPlanCitizen(citizen: Citizen) {
  return !citizen.live && citizen.locationSource !== 'gps' && citizen.call?.consent === 'granted' && (!citizen.hrCall || citizen.hrCall.outcomeApplied && citizen.hrCall.state === 'done' && citizen.hrCall.willEvacuate === true && ['car', 'walking'].includes(citizen.mobility ?? '') && citizen.call.needs.length === 0 && Boolean(citizen.hrCall.zoneId))
}

export function needsWavePolling(citizens: Citizen[]) {
  return citizens.some(citizen => !citizen.live && citizen.locationSource !== 'gps' && citizen.hrCall && (!citizen.hrCall.outcomeApplied && citizen.hrCall.resultState !== 'failed' || ['queued', 'talking'].includes(citizen.hrCall.state)))
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(item => item && typeof item === 'object' ? item as Record<string, unknown> : { description: String(item) }) : []
}

function asText(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value)
}

// Aplica el estado del puente a los ciudadanos con hrCall.
export function applyWaveStatus(current: Citizen[], calls: BridgeCall[], elapsed = 0): Citizen[] {
  if (!calls?.length) return current
  const byId = new Map(calls.map(call => [call.person_id, call]))
  return current.map((citizen): Citizen => {
    if (!citizen.hrCall || citizen.live || citizen.locationSource === 'gps') return citizen
    const call = byId.get(citizen.hrCall.personId)
    if (!call) return citizen
    const hrCall = { ...citizen.hrCall, state: call.state, resultState: call.resultState ?? citizen.hrCall.resultState, transcript: call.transcript ?? citizen.hrCall.transcript, endReason: call.endReason ?? undefined, outcomeError: call.outcomeError ?? undefined }
    const next = { ...citizen, hrCall }
    if (hrCall.outcomeApplied) return next
    const outcome = call.outcome
    if (!outcome || outcome.partial === true) {
      if (call.resultState === 'failed' || call.state === 'failed') return { ...next, status: 'assistance', hrCall: { ...hrCall, resultState: call.resultState ?? 'failed' }, routeHoldReason: call.outcomeError || call.endReason || 'No se ha recibido un resultado válido. No se simula una respuesta.' }
      return { ...next, status: call.state === 'queued' ? 'pending' : 'ringing' }
    }
    if (typeof outcome.answered !== 'boolean') return { ...next, status: 'assistance', hrCall: { ...hrCall, resultState: 'failed' }, routeHoldReason: 'Extracción sin answered válido; requiere revisión.' }
    hrCall.outcomeApplied = true
    hrCall.resultState = 'ready'
    hrCall.runUrl = outcome.transcript_url
    if (!outcome.answered) return { ...next, status: 'no_answer', safeZoneId: '', routeId: undefined }
    const extracted = outcome.extracted ?? {}
    const consent = extracted.consent_position === true ? 'granted' : extracted.consent_position === false ? 'declined' : 'not_requested'
    const mobility = ['car', 'walking', 'reduced', 'immobile'].includes(String(extracted.mobility)) ? extracted.mobility as Citizen['mobility'] : undefined
    const size = extracted.people_at_home === null || extracted.people_at_home === undefined ? NaN : Number(extracted.people_at_home)
    const vulnerable = asList(extracted.vulnerable_people)
    hrCall.willEvacuate = extracted.will_evacuate === true
    hrCall.departureAt = elapsed + 6
    const confirmed: Citizen = {
      ...next, mobility, householdSize: Number.isInteger(size) && size > 0 && size <= 100 ? size : citizen.householdSize,
      locationSource: consent === 'granted' ? 'simulation' : citizen.locationSource,
      locationUpdatedAt: consent === 'granted' ? Date.now() : citizen.locationUpdatedAt,
      speedKmh: mobility === 'car' ? 18 : mobility === 'walking' ? 4 : mobility === 'reduced' ? 2 : 0,
      vulnerable: citizen.vulnerable || vulnerable.length > 0,
      call: { answeredAt: Date.now(), agent: 'HappyRobot · Vigía', summary: outcome.agent_notes || 'Conversación real por chat con un vecino sintético.', consent, needs: vulnerable.map(item => `${asText(item.description)} · ${asText(item.needs)}`) },
      household: [...asList(extracted.neighbors_mentioned).map(item => ({ name: asText(item.name) || 'Vecino mencionado', situation: asText(item.address) || 'Ubicación sin confirmar', source: 'HappyRobot · mención de tercero, no confirmación directa' })), ...vulnerable.map(item => ({ name: asText(item.description) || 'Persona vulnerable', situation: asText(item.needs) || 'Pendiente de revisión', source: 'HappyRobot · declaración del vecino sintético' }))],
    }
    if (extracted.will_evacuate === true) {
      // Con consentimiento la posición pasa a "compartida · demo"; sin él se
      // mantiene la referencia censada (no se inventa un GPS) y el grupo no se mueve.
      if (consent !== 'granted') return { ...confirmed, status: 'informed', routeHoldReason: 'Sin consentimiento explícito de ubicación; no se anima la posición.' }
      if (!mobility || mobility === 'immobile' || mobility === 'reduced' || vulnerable.length > 0) return { ...confirmed, status: 'assistance', routeHoldReason: 'Movilidad o necesidad de apoyo pendiente de revisión; no se inicia movimiento autónomo.' }
      if (!hrCall.zoneId) return { ...confirmed, status: 'assistance', routeHoldReason: 'Sin punto de encuentro validado y comunicado. Requiere coordinación.' }
      return { ...confirmed, status: 'tracking', locationSource: 'simulation', locationUpdatedAt: Date.now(), routeHoldReason: undefined }
    }
    return { ...confirmed, status: 'assistance', routeHoldReason: extracted.will_evacuate === false ? 'No confirma que salga; rellamada pendiente.' : 'No consta una decisión de salida; requiere revisión.' }
  })
}
