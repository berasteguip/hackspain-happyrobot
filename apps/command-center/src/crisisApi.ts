/**
 * Puente entre router y la API de estado de crisis (`api/`).
 *
 * router nació autocontenido: su población, sus llamadas y su reloj viven en el navegador
 * (`scenario.ts` + `simulation.ts`). Eso sigue funcionando y es lo que se enseña sin backend.
 * Este módulo añade el otro modo, el que importa para el reto: **rodear un círculo y que
 * suenen teléfonos de verdad**. El navegador no llama a HappyRobot — no puede y no debe:
 * la clave viviría en el código fuente de la página. Manda el círculo a nuestra API y es
 * ella quien dispara los runs.
 *
 * Si la API no responde, todo esto devuelve `null` y router se queda en su modo local. Una
 * demo no se cae porque un backend no esté levantado.
 */

import type { CallStateName, TriageLevel } from './types'

export type { CallStateName, TriageLevel }

const KEY = 'router.operatorKey'

/** Igual que con el token de Mapbox: la clave de antes del cambio de nombre se sigue leyendo. */
const KEY_ANTERIOR = 'vigia.operatorKey'

export type RosterEntry = {
  id: string
  name: string | null
  phone: string | null
  lng: number | null
  lat: number | null
  locality: string | null
  address: string | null
  vulnerable: boolean
  dialable: boolean
  status: string
  call_state: CallStateName | null
  location_source: string | null
  /** El color con el que el agente cerró la llamada (`POST /calls/observation`). */
  triage_level: TriageLevel | null
  triage_reason: string | null
  triage_confidence: string | null
  triage_at: string | null
}

export type CallRun = {
  id: string
  person_id: string
  name: string | null
  phone: string | null
  state: CallStateName
  run_id: string | null
  batch_id: string | null
  reason: string | null
  detail: string | null
  started_at: string
  updated_at: string
  answered: boolean | null
}

/** Un punto que estaba dentro del círculo y aun así no se llamó, con su motivo. */
export type DispatchResultSkip = { person_id: string; name: string | null; reason: string }

export type DispatchResult = {
  batch_id: string
  requested: number
  dispatched: number
  skipped: number
  calls: CallRun[]
  skipped_detail: DispatchResultSkip[]
}

/** Etiquetas del tablero. El operador no tiene por qué saber qué es un `run`. */
export const CALL_STATE_LABEL: Record<CallStateName, string> = {
  queued: 'En cola',
  dialing: 'Marcando',
  ringing: 'Llamando',
  answered: 'Contestada',
  no_answer: 'Sin respuesta',
  failed: 'No se pudo marcar',
  blocked: 'Bloqueada por el cerrojo',
  simulated: 'Simulada · nadie ha sonado',
  stale: 'Sin desenlace · no llegó el resultado',
}

export const CALL_STATE_OPEN: CallStateName[] = ['queued', 'dialing', 'ringing']

/**
 * El color del triaje. Es lo único del mapa que viene de haber HABLADO con alguien: el resto
 * de capas son geometría (perímetro, exposición, rutas). Por eso pinta por encima del estado
 * de la llamada — que alguien haya descolgado dice menos que lo que dijo al descolgar.
 *
 * `unknown` es su propio color a propósito: «el agente habló con esta persona y aun así no pudo
 * clasificarla» no es lo mismo que «nadie la ha llamado todavía», y en un mapa que ordena a
 * quién se saca primero esa diferencia decide a quién se vuelve a llamar.
 */
export const TRIAGE_COLOR: Record<TriageLevel, string> = {
  red: '#ff4d4f',
  orange: '#ff9f43',
  yellow: '#f4d03f',
  green: '#4de3a6',
  unknown: '#b0bec5',
}

export const TRIAGE_LABEL: Record<TriageLevel, string> = {
  red: 'Rojo · crítico',
  orange: 'Naranja · alto',
  yellow: 'Amarillo · medio',
  green: 'Verde · seguro',
  unknown: 'Sin clasificar',
}

/** Orden operativo: el que se atiende primero va primero. */
export const TRIAGE_ORDER: TriageLevel[] = ['red', 'orange', 'yellow', 'unknown', 'green']

// --------------------------------------------------------------------------- clave

/** La clave de operador (`HR_SHARED_SECRET` de la API). Se guarda como el token de Mapbox. */
export function readOperatorKey(): string {
  const env = import.meta.env.VITE_OPERATOR_KEY as string | undefined
  if (env && env.trim()) return env.trim()
  try {
    return (localStorage.getItem(KEY) ?? localStorage.getItem(KEY_ANTERIOR))?.trim() || ''
  } catch {
    return ''
  }
}

export function saveOperatorKey(key: string) {
  try {
    localStorage.setItem(KEY, key.trim())
  } catch {
    // navegador sin almacenamiento: la clave vive solo en esta sesión
  }
}

function headers(key: string): HeadersInit {
  return key
    ? { 'Content-Type': 'application/json', 'x-api-key': key }
    : { 'Content-Type': 'application/json' }
}

// --------------------------------------------------------------------------- lecturas

/**
 * El censo completo del escenario cargado en la API.
 *
 * Distinto de `/api/locations`, que solo trae a quien está compartiendo posición: para
 * rodear y llamar hacen falta justo los que todavía NO han dado señales de vida.
 * Los teléfonos llegan enmascarados; el endpoint es público.
 */
export async function fetchRoster(): Promise<RosterEntry[] | null> {
  try {
    const res = await fetch('/api/roster')
    if (!res.ok) return null
    const rows = (await res.json()) as unknown
    if (!Array.isArray(rows)) return null
    return rows.filter(
      (row): row is RosterEntry =>
        Boolean(row) &&
        typeof (row as RosterEntry).id === 'string' &&
        Number.isFinite((row as RosterEntry).lng as number) &&
        Number.isFinite((row as RosterEntry).lat as number),
    )
  } catch {
    return null
  }
}

/** Dónde está anclado el mundo del ensayo en la API, si alguien se registró con `anchor`. */
export async function fetchAnchor(): Promise<{ lng: number; lat: number } | null> {
  try {
    const res = await fetch('/api/anchor')
    if (!res.ok) return null
    const body = (await res.json()) as { anchored?: boolean; lat?: number; lon?: number }
    return body.anchored && Number.isFinite(body.lat) && Number.isFinite(body.lon) ? { lng: body.lon as number, lat: body.lat as number } : null
  } catch {
    return null
  }
}

/** El tablero de llamadas. `batchId` acota a la última ráfaga lanzada. */
export async function fetchCalls(key: string, batchId?: string): Promise<CallRun[] | null> {
  try {
    const url = batchId ? `/calls?batch_id=${encodeURIComponent(batchId)}` : '/calls'
    const res = await fetch(url, { headers: headers(key) })
    if (!res.ok) return null
    const rows = (await res.json()) as unknown
    return Array.isArray(rows) ? (rows as CallRun[]) : null
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------- escritura

export class DispatchFailed extends Error {}

export type RegisterResult = { person_id: string; name: string | null; phone: string | null; created: boolean; map_url: string }

/** Quien abre el enlace se da de alta él mismo: teléfono con prefijo y su GPS. Endpoint público. */
export async function registerPerson(input: { name?: string; phone: string; lat: number; lon: number; accuracyM?: number; anchor?: boolean }): Promise<RegisterResult> {
  let res: Response
  try {
    res = await fetch('/people/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name ?? null, phone: input.phone, lat: input.lat, lon: input.lon, accuracy_m: input.accuracyM ?? null, anchor: input.anchor ?? false }),
    })
  } catch {
    throw new Error('No hay conexión con la API de crisis.')
  }
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`
    try {
      const cuerpo = await res.json()
      if (cuerpo?.detail) detalle = typeof cuerpo.detail === 'string' ? cuerpo.detail : 'Datos no válidos.'
    } catch {
      // cuerpo no-JSON
    }
    throw new Error(detalle)
  }
  return (await res.json()) as RegisterResult
}

/** El GPS de este dispositivo, para la persona registrada. Público; falla en silencio. */
export async function postPosition(personId: string, lat: number, lon: number, accuracyM?: number): Promise<boolean> {
  try {
    const res = await fetch('/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: personId, lat, lon, accuracy_m: accuracyM ?? null }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * El gesto del mando: este círculo, estas llamadas.
 *
 * Se manda el CÍRCULO, no la lista de ids que router calculó. Así la API decide con su propio
 * estado —que es el que puede haber cambiado hace dos segundos por un GPS entrante— y no con
 * la foto que tenía el navegador. Si las dos listas no coinciden, la buena es la del backend:
 * es quien va a marcar.
 */
export async function dispatchCircle(
  key: string,
  area: { lng: number; lat: number; radiusM: number },
  options: { reason?: string; operator?: string; force?: boolean } = {},
): Promise<DispatchResult> {
  let res: Response
  try {
    res = await fetch('/calls/dispatch', {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        lat: area.lat,
        lon: area.lng,
        radius_m: area.radiusM,
        reason: options.reason ?? 'el puesto de mando rodeó esta zona en el mapa',
        operator: options.operator ?? 'puesto de mando',
        force: options.force ?? false,
      }),
    })
  } catch {
    throw new DispatchFailed('No hay conexión con la API de crisis.')
  }
  if (res.status === 401) {
    throw new DispatchFailed('La clave de operador no es válida.')
  }
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`
    try {
      const cuerpo = await res.json()
      if (cuerpo?.detail) detalle = String(cuerpo.detail)
    } catch {
      // cuerpo no-JSON: se queda el código de estado
    }
    throw new DispatchFailed(detalle)
  }
  return (await res.json()) as DispatchResult
}
