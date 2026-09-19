/**
 * Cliente del estado de crisis (`api/`), que es la fuente de verdad del sistema.
 *
 * Vigía nacía con su propio escenario escrito a mano (`scenario.ts`, Sierra de Gredos) y una
 * simulación local. Eso lo dejaba desconectado de `api/`, así que nunca podía enseñar a la
 * persona que comparte ubicación desde el enlace del SMS: esa posición entra por
 * `POST /positions` y vive dentro de `CrisisState`, no en el navegador. Este módulo traduce
 * `GET /state` a los tipos que ya consume el mapa — decisión 003.
 *
 * El escenario local se conserva como plan B: si la API no responde, el mapa sigue pintando
 * algo en vez de quedarse en blanco delante del jurado.
 */
import type { Citizen, CitizenStatus, RiskArea, SafeZone } from './types'

const qs = new URLSearchParams(window.location.search)

/** Sin `?api=`, mismo origen: en Railway la API sirve esta misma página. */
export const API_BASE = (qs.get('api') ?? '').replace(/\/+$/, '')
export const API_KEY = qs.get('key') ?? ''

type ApiPerson = {
  id: string
  name?: string | null
  phone?: string | null
  lat?: number | null
  lon?: number | null
  status?: string | null
  position_source?: string | null
  position_updated_at?: string | null
  speed_kmh?: number | null
  assigned_exit_id?: string | null
  household_size?: number | null
  minutes_to_front?: number | null
}

type ApiSafeZone = {
  id: string
  name?: string | null
  lat?: number | null
  lon?: number | null
  capacity?: number | null
  status?: string | null
}

export type CrisisSnapshot = {
  stateVersion: number
  citizens: Citizen[]
  zones: SafeZone[]
  perimeter: RiskArea | null
  center: [number, number] | null
}

/** `PersonStatus` de la API → los estados que el mapa sabe colorear. */
const STATUS: Record<string, CitizenStatus> = {
  unknown: 'pending',
  no_answer: 'no_answer',
  unreachable: 'no_answer',
  contacted: 'informed',
  moving: 'evacuating',
  safe: 'safe',
  refusing: 'refused',
  at_risk: 'tracking',
}

function toCitizen(person: ApiPerson): Citizen | null {
  if (typeof person.lon !== 'number' || typeof person.lat !== 'number') return null
  const compartiendo = Boolean(person.position_source)
  const actualizado = person.position_updated_at ? Date.parse(person.position_updated_at) : NaN
  return {
    id: person.id,
    name: person.name || person.id,
    phone: person.phone || '',
    lng: person.lon,
    lat: person.lat,
    status: STATUS[person.status ?? ''] ?? 'pending',
    vulnerable: false,
    safeZoneId: person.assigned_exit_id || '',
    speedKmh: person.speed_kmh ?? 0,
    callDelaySec: 0,
    outcome: 'tracking',
    live: compartiendo,
    // `reference` cuando la posición es la del domicilio y nadie ha compartido nada: el mapa la
    // pinta distinta justo para no dar por localizada a una persona que no lo está.
    locationSource: person.position_source === 'gps' ? 'gps' : compartiendo ? 'simulation' : 'reference',
    locationUpdatedAt: Number.isNaN(actualizado) ? undefined : actualizado,
    resident: true,
  }
}

function toSafeZone(zone: ApiSafeZone): SafeZone | null {
  if (typeof zone.lon !== 'number' || typeof zone.lat !== 'number') return null
  return {
    id: zone.id,
    name: zone.name || zone.id,
    lng: zone.lon,
    lat: zone.lat,
    radiusM: 150,
    capacity: zone.capacity ?? 0,
  }
}

/** Anillo exterior del polígono del fuego, en [lng, lat]. */
function perimeterRing(fire: unknown): [number, number][] {
  const geom = (fire as { perimeter?: { coordinates?: unknown } } | undefined)?.perimeter
  const rings = geom?.coordinates
  if (!Array.isArray(rings) || !Array.isArray(rings[0])) return []
  return (rings[0] as unknown[]).filter(
    (punto): punto is [number, number] =>
      Array.isArray(punto) && typeof punto[0] === 'number' && typeof punto[1] === 'number',
  )
}

function centroid(ring: [number, number][]): [number, number] | null {
  if (!ring.length) return null
  const suma = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
  return [suma[0] / ring.length, suma[1] / ring.length]
}

export function adaptSnapshot(raw: Record<string, unknown>): CrisisSnapshot {
  const people = Array.isArray(raw.people) ? (raw.people as ApiPerson[]) : []
  const zonas = Array.isArray(raw.safe_zones) ? (raw.safe_zones as ApiSafeZone[]) : []
  const ring = perimeterRing(raw.fire)
  return {
    stateVersion: typeof raw.state_version === 'number' ? raw.state_version : 0,
    citizens: people.map(toCitizen).filter((c): c is Citizen => c !== null),
    zones: zonas.map(toSafeZone).filter((z): z is SafeZone => z !== null),
    perimeter: ring.length ? { id: 'fire', name: 'Perímetro del incendio', coordinates: ring } : null,
    center: centroid(ring),
  }
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<CrisisSnapshot> {
  const res = await fetch(`${API_BASE}/state`, {
    signal,
    headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
  })
  if (!res.ok) throw new Error(`/state respondió ${res.status}`)
  return adaptSnapshot((await res.json()) as Record<string, unknown>)
}
