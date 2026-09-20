/** Estado del INTENTO de llamada que sirve la API (`CallState` en `api/models.py`). */
export type CallStateName =
  | 'queued'
  | 'dialing'
  | 'ringing'
  | 'answered'
  | 'no_answer'
  | 'failed'
  | 'blocked'
  | 'simulated'
  | 'stale'

/** El color con el que el agente de voz cerró la llamada (`Triage.level` en `api/models.py`). */
export type TriageLevel = 'red' | 'orange' | 'yellow' | 'green' | 'unknown'

export type Triage = {
  level: TriageLevel
  /** La frase en español que explica el color. La redacta la API, no el mapa. */
  reason: string | null
  confidence: string | null
  at: string | null
}

export type CitizenStatus =
  | 'pending'
  | 'ringing'
  | 'no_answer'
  | 'informed'
  | 'tracking'
  | 'evacuating'
  | 'safe'
  | 'refused'
  | 'assistance'
  | 'routing'

export type Citizen = {
  id: string
  name: string
  phone: string
  lng: number
  lat: number
  status: CitizenStatus
  vulnerable: boolean
  safeZoneId: string
  speedKmh: number
  callDelaySec: number
  outcome: Exclude<CitizenStatus, 'pending' | 'ringing' | 'evacuating' | 'assistance' | 'routing'>
  live?: boolean
  /**
   * HappyRobot tiene su llamada de verdad: el teléfono es real y el run está vivo. La simulación
   * local no le toca ni el estado ni la posición; lo que le pase entra por el tablero de llamadas
   * y por el triaje del roster. Un punto real que echase a correr al pulsar «Llamar» estaría
   * fingiendo una conversación que todavía no ha ocurrido.
   */
  real?: boolean
  routeId?: string
  routeProgressM?: number
  routePhase?: 'access' | 'road'
  routeHoldReason?: string
  locationSource?: 'reference' | 'simulation' | 'gps' | 'unknown'
  /** Estado del INTENTO de llamada real (viene de la API), distinto de `status`. */
  callState?: CallStateName
  /** Lo que el agente concluyó al colgar. Sin llamada atendida no existe. */
  triage?: Triage
  /** ¿Sonaría el teléfono, o lo pararía el cerrojo de la API? */
  dialable?: boolean
  /**
   * Escalada a fuerzas de seguridad: nadie descolgó y el mando pidió que alguien vaya a la
   * puerta. Guarda qué medios salieron para que el punto lo enseñe y no se escale dos veces.
   */
  escalation?: { at: number; runId: string; unitIds: string[] }
  /**
   * Cambio de destino en marcha: el mando pintó un frente previsto que cruzaba su camino (o su
   * refugio) y HappyRobot le buscó otra salida desde donde estaba. `toZoneId` llega cuando
   * Directions devuelve la ruta nueva; hasta entonces la persona está parada, esperando.
   */
  reroute?: { at: number; runId: string; fromZoneId: string; toZoneId?: string }
  locationUpdatedAt?: number
  accuracyM?: number
  locality?: string
  resident?: boolean
  household?: { name: string; situation: string; source: string }[]
  call?: {
    answeredAt: number
    agent: string
    summary: string
    consent: 'granted' | 'declined' | 'not_requested'
    needs: string[]
  }
}

export type CallArea = { lng: number; lat: number; radiusM: number }

/** Un frente previsto pintado a mano por el mando: anillo cerrado en [lng, lat] y cuándo se pintó. */
export type PaintedFire = { id: string; ring: [number, number][]; at: number }

export type MapLayers = {
  perimeter: boolean
  spread: boolean
  plannedFire: boolean
  thermal: boolean
  citizens: boolean
  references: boolean
  zones: boolean
  hospitals: boolean
  healthCenters: boolean
  fireStations: boolean
  routes: boolean
  callArea: boolean
  units: boolean
}

export type LocationPing = {
  id: string
  name: string
  lng: number
  lat: number
  ts: number
  source?: 'gps' | 'simulation' | 'unknown'
  accuracyM?: number
}

export type SafeZone = {
  id: string
  name: string
  lng: number
  lat: number
  radiusM: number
  capacity: number
  code: string
  services: string[]
  description: string
  sourceUrl: string
}

export type FireSpot = {
  id: string
  lng: number
  lat: number
  frp: number
  confidence: 'low' | 'nominal' | 'high'
  source: 'scenario' | 'firms'
  acquiredAt: string
}

export type CallEvent = {
  id: string
  ts: number
  agent: string
  citizenId: string
  name: string
  detail: string
}
