// La memoria compartida entre llamadas: lo que una averigua, lo saben las demás.
//
// La fuente para los agentes es la tabla `call_log` de Twin, pero el navegador no
// puede leer de Twin (docs/06-producto/03-contrato-de-datos.md §0), así que el CECOP
// lo lee del espejo que mantiene `api/`: GET /calls/log.

import { readOperatorKey } from './crisisApi'

export type CallLogEntry = {
  id: string
  created_at: string
  topic: string
  locality_id: string | null
  road: string | null
  place_text: string | null
  person_id: string | null
  source_id: string
  source_detail: string | null
  question: string
  answer: string | null
  valid_until: string | null
  simulated: boolean
}

// Vocabulario replicado de la tabla `source` de Twin. Solo lo que hace falta para
// pintar: cómo se nombra la fuente y si es oficial. Si cambia allí, cambia aquí.
export const SOURCES: Record<string, { label: string; official: boolean }> = {
  cecopi: { label: 'Puesto de mando', official: true },
  bomberos: { label: 'Bomberos', official: true },
  agente_forestal: { label: 'Agentes forestales', official: true },
  guardia_civil: { label: 'Guardia Civil', official: true },
  policia_local: { label: 'Policía Local', official: true },
  '112': { label: '112', official: true },
  patrulla: { label: 'Patrulla', official: true },
  ayuntamiento: { label: 'Ayuntamiento', official: true },
  sistema: { label: 'Sistema', official: false },
  vecino: { label: 'Vecino', official: false },
  desconocido: { label: 'Sin identificar', official: false },
}

export const TOPICS: Record<string, string> = {
  road_status: 'carretera',
  evacuation_order: 'evacuación',
  shelter_capacity: 'refugio',
  fire_observed: 'fuego a la vista',
  person_situation: 'situación personal',
  other: 'otros',
}

export function sourceOf(id: string) {
  return SOURCES[id] ?? { label: id || 'Sin identificar', official: false }
}

/** La antigüedad se muestra siempre: el agente está obligado a citarla y el mando a verla. */
export function ageLabel(iso: string, now: number) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `hace ${h} h ${rest} min` : `hace ${h} h`
}

export function isStale(entry: CallLogEntry, now: number) {
  if (!entry.valid_until) return false
  const until = Date.parse(entry.valid_until)
  return Number.isFinite(until) && until < now
}

/** `n-sesnandez-de-tabara` → `sesnandez de tabara`. El nombre real vive en la tabla
 *  `locality` de Twin, que el navegador no puede leer: se muestra legible sin fingir. */
export function zoneLabel(id: string | null) {
  return (id ?? '').replace(/^n-/, '').replace(/-/g, ' ')
}

// Ruta relativa y clave de operador, como el resto de `crisisApi.ts`: en producción la API
// sirve el propio frontend en `/`, y en desarrollo el proxy de Vite manda `/calls` a
// `VITE_CRISIS_API`. La clave es la misma que usa el tablero de llamadas — una segunda
// forma de autenticarse solo para este panel era pedir un 401 a gritos.
export async function fetchCallLog(signal?: AbortSignal): Promise<CallLogEntry[]> {
  const key = readOperatorKey()
  const res = await fetch('/calls/log?limit=60', {
    signal,
    headers: key ? { 'x-api-key': key } : undefined,
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('falta la clave de operador (la misma que el tablero de llamadas)')
  }
  if (!res.ok) throw new Error(`GET /calls/log → ${res.status}`)
  const data = (await res.json()) as { entries?: CallLogEntry[] }
  return Array.isArray(data.entries) ? data.entries : []
}
