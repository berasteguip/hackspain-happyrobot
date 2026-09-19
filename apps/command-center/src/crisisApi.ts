/**
 * Puente entre Vigía y la API de estado de crisis (`api/`).
 *
 * Vigía nació autocontenido: su población, sus llamadas y su reloj viven en el navegador
 * (`scenario.ts` + `simulation.ts`). Eso sigue funcionando y es lo que se enseña sin backend.
 * Este módulo añade el otro modo, el que importa para el reto: **rodear un círculo y que
 * suenen teléfonos de verdad**. El navegador no llama a HappyRobot — no puede y no debe:
 * la clave viviría en el código fuente de la página. Manda el círculo a nuestra API y es
 * ella quien dispara los runs.
 *
 * Si la API no responde, todo esto devuelve `null` y Vigía se queda en su modo local. Una
 * demo no se cae porque un backend no esté levantado.
 */

import type { CallStateName } from './types'

export type { CallStateName }

const KEY = 'vigia.operatorKey'

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

// --------------------------------------------------------------------------- clave

/** La clave de operador (`HR_SHARED_SECRET` de la API). Se guarda como el token de Mapbox. */
export function readOperatorKey(): string {
  const env = import.meta.env.VITE_OPERATOR_KEY as string | undefined
  if (env && env.trim()) return env.trim()
  try {
    return localStorage.getItem(KEY)?.trim() || ''
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

/**
 * El gesto del mando: este círculo, estas llamadas.
 *
 * Se manda el CÍRCULO, no la lista de ids que Vigía calculó. Así la API decide con su propio
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
