import { destination, haversineMeters, bearingDeg } from './geo'
import { exposureAt } from './fire-model'
import type { FireForecast } from './fire-model'
import { nearestOnRoute, positionAt } from './routing'
import type { Route, RouteIndex } from './routing'
import { AGENTS } from './scenario'
import type { CallArea, CallEvent, Citizen, SafeZone, Triage, TriageLevel } from './types'

/** Lo que la simulación necesita saber del fuego para estimar a quién le llega antes. */
export type RiskView = { forecast: FireForecast; horizon: number; marginM: number }

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

export function prepareAreaCampaign(citizens: Citizen[], selectedIds: string[], elapsedSec: number, enrolled: ReadonlySet<string>) {
  const selected = new Set(selectedIds)
  const addedIds = citizens.filter(citizen => selected.has(citizen.id) && !enrolled.has(citizen.id) && !citizen.live && !citizen.real && citizen.status === 'pending').map(citizen => citizen.id)
  const offset = citizens.reduce((latest, citizen) => enrolled.has(citizen.id) && ['pending', 'ringing'].includes(citizen.status) ? Math.max(latest, citizen.callDelaySec + RING_SEC) : latest, elapsedSec)
  const schedule = new Map(addedIds.map((id, index) => [id, offset + 1 + Math.floor(index / AGENTS.length) * (RING_SEC + 0.6)]))
  return {
    citizens: citizens.map(citizen => schedule.has(citizen.id) ? { ...citizen, callDelaySec: schedule.get(citizen.id)! } : citizen),
    ids: [...new Set([...enrolled, ...addedIds])],
    addedIds,
  }
}

// --------------------------------------------------------------------------------------
// El triaje simulado: que una llamada del ensayo termine como termina una de verdad
// --------------------------------------------------------------------------------------

/** De más leve a más grave. El orden importa: es el que se recorre al subir o bajar un nivel. */
const SEVERIDAD: TriageLevel[] = ['green', 'yellow', 'orange', 'red']

/**
 * Un número estable en [0,1) a partir de un id, **bien repartido**.
 *
 * `hash01` no vale para esto y costó descubrirlo: con ids tan parecidos como `c-01`…`c-110`
 * devuelve valores metidos en una banda de 0,52 a 0,76 —los doce primeros salen idénticos—,
 * así que cualquier umbral por debajo de 0,5 no se cruza nunca. Con él, la minoría que se
 * desvía era del 0 %: el triaje simulado salía exactamente igual que la geometría y parecía
 * que funcionaba.
 *
 * Esto es un FNV-1a con avalancha final: dos ids contiguos caen lejos el uno del otro.
 */
function dado01(value: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Minutos hasta que el frente alcanza a alguien → color.
 *
 * Son **los mismos cortes que `notify._prior_level()`** en la API, y no por casualidad: esa es
 * la estimación que el agente de verdad recibe al descolgar. Si la simulación usara otra
 * escala, el mismo punto saldría de un color en el ensayo y de otro en la demo real.
 */
function nivelPorMinutos(minuto: number): TriageLevel {
  if (!Number.isFinite(minuto)) return 'green'
  if (minuto <= 15) return 'red'
  if (minuto <= 45) return 'orange'
  if (minuto <= 120) return 'yellow'
  return 'green'
}

function desplazar(nivel: TriageLevel, pasos: number): TriageLevel {
  const i = SEVERIDAD.indexOf(nivel)
  if (i < 0) return nivel
  return SEVERIDAD[Math.min(SEVERIDAD.length - 1, Math.max(0, i + pasos))]
}

/**
 * Cómo acaba una llamada simulada, en la misma forma que la deja el agente real.
 *
 * La tentación era derivar el color del fuego y ya. Sería un error: el mapa se estaría
 * coloreando con su propio dato, el triaje no diría nada que la capa de exposición no diga, y
 * **la discrepancia —que es el momento que justifica todo esto— no ocurriría jamás**. El valor
 * de una llamada está en lo que corrige, no en lo que confirma.
 *
 * Así que se parte de la geometría, como hace el agente de verdad, y una minoría se desvía. Los
 * vulnerables se desvían a peor más a menudo, que es justo la tesis del producto: son a quienes
 * el mapa subestima, porque el mapa no sabe quién no puede salir solo.
 *
 * El reparto es determinista por id: dos ensayos seguidos pintan lo mismo. Un ensayo que cambia
 * de resultado cada vez que lo lanzas no sirve para ensayar.
 */
function triajeSimulado(citizen: Citizen, riesgo: RiskView): Triage {
  const ahora = new Date().toISOString()
  if (citizen.outcome === 'no_answer') {
    return { level: 'unknown', reason: 'nadie descolgó: no hay triaje, solo el intento', confidence: 'alta', at: ahora }
  }

  const { minute } = exposureAt(riesgo.forecast, citizen.lng, citizen.lat, riesgo.horizon, riesgo.marginM)
  const previo = nivelPorMinutos(minute)
  const dado = dado01(citizen.id, 991)
  const peor = dado < (citizen.vulnerable ? 0.42 : 0.2)
  const mejor = !peor && dado > 0.88
  const level = peor ? desplazar(previo, 1) : mejor ? desplazar(previo, -1) : previo

  const partes: string[] = []
  if (citizen.locality) partes.push(`dice estar en «${citizen.locality}»`)
  if (peor && level !== previo) {
    partes.push(
      citizen.vulnerable
        ? 'está PEOR de lo que decía el mapa: no puede salir sin ayuda'
        : 'está PEOR de lo que decía el mapa',
    )
  } else if (mejor && level !== previo) {
    partes.push('está mejor de lo que decía el mapa: ya iba de camino')
  }
  if (citizen.outcome === 'refused') partes.push('no quiere compartir su ubicación')
  if (!partes.length) partes.push('la llamada confirma lo que traía el mapa')

  return {
    level,
    reason: partes.join('; '),
    confidence: citizen.outcome === 'refused' ? 'media' : 'alta',
    at: ahora,
  }
}

export function advanceProtocol(
  citizens: Citizen[],
  elapsedSec: number,
  prevEvents: CallEvent[],
  campaignIds?: ReadonlySet<string>,
  riesgo?: RiskView,
): { citizens: Citizen[]; events: CallEvent[] } {
  const events = [...prevEvents]
  const next = citizens.map((citizen, index): Citizen => {
    if (citizen.live || citizen.real || campaignIds && !campaignIds.has(citizen.id)) return citizen
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
          ? 'contestada · comparte ubicación'
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
        // La llamada termina: el agente deja su veredicto, igual que en el circuito real. Es
        // una foto del momento y no se recalcula cuando el fuego avanza; lo que se dijo a las
        // y diez se dijo a las y diez, y por eso lleva hora.
        triage: riesgo ? triajeSimulado(citizen, riesgo) : citizen.triage,
        locationSource: citizen.outcome === 'tracking' ? 'simulation' : citizen.locationSource,
        locationUpdatedAt: citizen.outcome === 'tracking' ? Date.now() : citizen.locationUpdatedAt,
        call: answered ? {
          answeredAt: Date.now(),
          agent: AGENTS[index % AGENTS.length],
          summary: citizen.outcome === 'tracking'
            ? 'Recibe el aviso y comparte ubicación.'
            : citizen.outcome === 'informed'
              ? 'Recibe el aviso. Sin ubicación nueva.'
              : 'Rechaza compartir ubicación.',
          consent: citizen.outcome === 'tracking' ? 'granted' : 'declined',
          needs: citizen.vulnerable ? ['Necesidad de apoyo pendiente de valoración humana'] : [],
        } : undefined,
        household: answered && citizen.id === 'c-01' ? [
          { name: 'Familiar A', situation: 'Está con ella', source: 'Llamada' },
          { name: 'Familiar B', situation: 'Ubicación desconocida', source: 'Llamada' },
        ] : citizen.household,
      }
    }

    if (
      citizen.status === 'tracking' &&
      elapsedSec >= citizen.callDelaySec + RING_SEC + DEPARTURE_SEC
    ) {
      if (!citizen.call || citizen.call.consent !== 'granted' || !citizen.routeId || !citizen.safeZoneId) return { ...citizen, status: 'assistance', routeHoldReason: citizen.routeHoldReason ?? 'Esperando un recorrido validado. No se inicia el desplazamiento.' }
      events.push({
        id: `${citizen.id}-move`,
        ts: Date.now(),
        agent: AGENTS[index % AGENTS.length],
        citizenId: citizen.id,
        name: citizen.name,
        detail: 'sale hacia el punto de encuentro',
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
    if (citizen.live || citizen.real || citizen.status !== 'evacuating') return citizen
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
