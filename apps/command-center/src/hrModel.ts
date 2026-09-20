/**
 * Vocabulario de la tarjeta «qué hace HappyRobot detrás» (`HappyRobotCard.tsx`).
 *
 * Aquí vive lo que no es un componente: el workflow desplegado, los tipos de nodo y de estado,
 * las etiquetas y qué cubre cada ficha. Separado del `.tsx` para que Fast Refresh funcione y para
 * que un test pueda importarlo sin React.
 *
 * Regla de honestidad: cada nodo declara si hoy ejecuta de verdad en HappyRobot o si es lo que
 * *tendría* que pasar y todavía es interfaz. Un nodo «previsto» se pinta discontinuo; no se pinta
 * igual que uno real. Ver `docs/06-producto/06-workflow-happyrobot-vs-contrato.md`.
 */

import type { DispatchTarget, UnitKind, UnitMission, UnitStatus } from './units'

/**
 * El workflow desplegado en la organización del equipo. Leído de la plataforma vía MCP el
 * 2026-09-19 (`docs/06-producto/06-workflow-happyrobot-vs-contrato.md` §1 y §5). Si alguien
 * lo renombra o publica otra versión, esto envejece el mismo día: actualizarlo a mano.
 */
export const HR_WORKFLOW = {
  name: 'Triaje incendios — MVP',
  version: 'v7',
  org: 'hackspainteam11',
  editorUrl: 'https://platform.eu.happyrobot.ai/hackspainteam11/workflows/cmupqukyx4lk/editor/h9q19zzt3oxa',
}

/** Tipo de nodo. Decide el icono; el resto de la fila es texto. */
export type HrNodeKind = 'trigger' | 'lock' | 'voice' | 'extract' | 'webhook' | 'api' | 'map' | 'zone' | 'human' | 'sms' | 'loop' | 'route' | 'building' | 'note' | 'search' | 'code' | 'db' | 'dbWrite' | 'send' | 'clock' | 'unit' | 'paths'

/**
 * Estado visual de un nodo.
 * - `idle`: existe y no está haciendo nada ahora.
 * - `active`: ejecutando en este momento (punto que late).
 * - `done`: terminó en esta pasada.
 * - `error`: terminó mal o no llegó su resultado.
 * - `mock`: no está conectado. Es lo que *pasaría*; hoy lo dibuja la interfaz. Se pinta discontinuo.
 */
export type HrNodeState = 'idle' | 'active' | 'done' | 'error' | 'mock'

/** Dónde corre el nodo. Cruzar de carril es lo que el diagrama tiene que dejar claro. */
export type HrLane = 'happyrobot' | 'api' | 'mando' | 'vecino'

export const HR_LANE_LABEL: Record<HrLane, string> = { happyrobot: 'HappyRobot', api: 'API router', mando: 'Mando', vecino: 'Vecino' }
export const HR_STATE_LABEL: Record<HrNodeState, string> = { idle: '', active: 'en curso', done: 'hecho', error: 'sin resultado', mock: 'previsto' }

export const HR_ICONS: Record<HrNodeKind, string> = {
  trigger: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5Z',
  voice: 'M8 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2Z',
  extract: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  webhook: 'M14 4h6v6M20 4l-9 9M9 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
  api: 'M4 5h16v6H4Zm0 8h16v6H4ZM8 8h.01M8 16h.01',
  map: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  // El mismo trazo que el botón «Zona» de la barra de herramientas: el gesto del mando.
  zone: 'M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M12 7v10M7 12h10',
  human: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  loop: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3',
  route: 'M6 3v13a3 3 0 0 0 6 0V8a3 3 0 0 1 6 0v13M3 6l3-3 3 3m6 12 3 3 3-3',
  building: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-4h6v4M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01',
  note: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  search: 'm21 21-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  // Python Sandbox.
  code: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 5 2.5 2.5L8 15m5 0h3',
  // Twin (la base de datos de la plataforma): leer y escribir.
  db: 'M20 5.5c0 1.4-3.6 2.5-8 2.5S4 6.9 4 5.5 7.6 3 12 3s8 1.1 8 2.5ZM4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  dbWrite: 'M20 5.5c0 1.4-3.6 2.5-8 2.5S4 6.9 4 5.5 7.6 3 12 3s8 1.1 8 2.5ZM4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13M9 14l3 3 3-3M12 17v-6',
  // Send direct message: el enlace sale por mensaje.
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4Z',
  // Loop que vigila con el tiempo: la ETA frente al frente, minuto a minuto.
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  // El mismo trazo que el botón «Medios» de la barra de herramientas: el vehículo.
  unit: 'M3 6h11v12H3Zm11 4h4l3 4v4h-7M5 18v2m12-2v2M7 10h3M8.5 8.5v3',
  // Conditions → Paths: el flujo se bifurca.
  paths: 'M6 3v18M6 9c0 5 12 3 12 8v4M15 18l3 3 3-3',
}

/**
 * La anatomía de una llamada, calcada del workflow tal y como está montado en el editor de
 * HappyRobot (captura del 2026-09-20). El tronco es la columna central del lienzo; las tools son
 * las cinco ramas que cuelgan del Outbound Voice Agent, cada una con lo que dispara detrás.
 *
 * Una palabra por nodo y el icono hace el resto: `word` es lo que se lee, `hint` lleva el nombre
 * real del nodo en el editor para que alguien pueda buscarlo allí.
 */
export type HrCallNode = { id: string; kind: HrNodeKind; word: string; hint: string }

/** Lo que una tool dispara detrás: los nodos encadenados a su derecha en el editor. */
export type HrChainLink = { kind: HrNodeKind; hint: string }
export type HrCallTool = HrCallNode & { chain: HrChainLink[] }

export const HR_CALL_TRUNK: HrCallNode[] = [
  { id: 'hook', kind: 'trigger', word: 'Disparo', hint: 'Incoming hook · la API de crisis lanza un run por persona, con su zona y su teléfono' },
  { id: 'lock', kind: 'lock', word: 'Cerrojo', hint: 'Python Sandbox «Freno de mano del simulacro» · solo suenan los números autorizados' },
  { id: 'agent', kind: 'voice', word: 'Agente', hint: 'Outbound Voice Agent · habla en español y decide con su Prompt cuál de las cinco tools usa' },
  { id: 'extract', kind: 'extract', word: 'Observación', hint: 'Extract «Observación» al colgar · nivel, zona, llamas, humo, salida libre' },
  { id: 'vigia', kind: 'webhook', word: 'Vigía', hint: 'POST «Observación → Vigía» · el triaje vuelve a la API y tiñe a la persona en el mapa' },
]

/**
 * Las cinco tools, en el orden en que están en el lienzo. La cadena de cada una es lo que el
 * diagrama aporta sobre el listado: usar una tool no es responder, es hacer que pase algo fuera.
 */
export const HR_CALL_TOOLS: HrCallTool[] = [
  {
    id: 'send-link', kind: 'map', word: 'Ubicación', hint: 'enviar_enlace_ubicacion · manda el enlace privado para compartir posición',
    chain: [{ kind: 'send', hint: 'Send direct message «Ubicación por enlace»' }],
  },
  {
    id: 'call-org', kind: 'building', word: 'Organismo', hint: 'llamar_a_organismo_oficial · pone al vecino con el mando',
    chain: [
      { kind: 'code', hint: 'Python Sandbox «Número del mando (fijo)»' },
      { kind: 'voice', hint: 'Outbound Voice Agent «Llamada a organismo», con su propio Prompt' },
    ],
  },
  {
    id: 'call-person', kind: 'human', word: 'Persona', hint: 'llamar_a_persona · llama a quien el vecino mencione',
    chain: [
      { kind: 'code', hint: 'Python Sandbox «Normalizar el número»' },
      { kind: 'voice', hint: 'Outbound Voice Agent «Llamada a la persona», con su propio Prompt' },
    ],
  },
  {
    id: 'lookup', kind: 'search', word: 'Consultar', hint: 'consultar_log · qué se sabe ya de esa zona por las llamadas anteriores',
    chain: [{ kind: 'db', hint: 'Query Twin with SQL · lee el call_log' }],
  },
  {
    id: 'note', kind: 'note', word: 'Anotar', hint: 'anotar_log · deja por escrito lo que averigua para las demás llamadas',
    chain: [
      { kind: 'dbWrite', hint: 'Write to Twin · call_log' },
      { kind: 'webhook', hint: 'POST «Anotación → Vigía»' },
    ],
  },
]

/**
 * El despacho de un medio: el workflow «Despacho de medio» nodo a nodo, con los nombres de la
 * plataforma, en el mismo formato que el run de escalada. Se ejecuta al enviar un medio desde el
 * CECOP (los pasos avanzan con reloj y el vehículo sale en el paso de Vigía, como en la escalada) y
 * se enseña completado al pulsar un vehículo que ya está en marcha. Es una simulación local del
 * workflow, igual que la escalada.
 *
 * Dos fases. `run`: los pasos del workflow, que corren con reloj (`ms`) hasta que el medio sale.
 * `trail`: el seguimiento, que no tiene reloj: lo marca el vehículo real (ETA, en el acceso, sin
 * ruta). Los pasos `inLoop` son el cuerpo del Loop: una iteración por medio asignado.
 */
export type HrUnitStep = { id: string; kind: HrNodeKind; lane: HrLane; label: string; detail: string; hint: string; phase: 'run' | 'trail'; inLoop?: boolean; ms: number; chain?: HrChainLink[] }

export const HR_UNIT_SCRIPT: HrUnitStep[] = [
  { id: 'trigger', kind: 'trigger', lane: 'api', phase: 'run', ms: 900, label: 'Workflow Function Request', detail: 'Lo invoca otro workflow (el plan de puntos rojos o la escalada) con incidente, sector, destino, tipo de medio y minutos hasta el frente. El botón «Enviar» del CECOP hace la misma llamada.', hint: 'Trigger · Workflow Function Request «despacho_de_medio»' },
  { id: 'twin-people', kind: 'db', lane: 'happyrobot', phase: 'run', ms: 1100, label: 'Query Twin with SQL · v_person_support', detail: 'Quién espera en el destino: personas en rojo pendientes del sector, vulnerables, movilidad (camilla) y casas cercanas sin respuesta para un solo viaje.', hint: 'Twin → Query Twin with SQL · v_person_support' },
  { id: 'twin-fleet', kind: 'db', lane: 'happyrobot', phase: 'run', ms: 1000, label: 'Query Twin with SQL · v_available_transport', detail: 'Vehículos en standby con plazas y camillas, priorizando el municipio del incidente.', hint: 'Twin → Query Twin with SQL · v_available_transport' },
  { id: 'sandbox', kind: 'code', lane: 'happyrobot', phase: 'run', ms: 1400, label: 'Python Sandbox · elegir medio', detail: 'ETA por carretera (Distance Matrix) frente a minutos hasta el frente: priority_rank. Respeta plazas y camillas. Si nadie llega antes que el fuego, no_viable.', hint: 'Code → Python Sandbox + Google Maps Distance Matrix' },
  { id: 'paths-plan', kind: 'paths', lane: 'happyrobot', phase: 'run', ms: 700, label: 'Paths · ¿hay medio viable?', detail: 'Rama «Sin medio viable»: mensaje al mando por Slack y se corta aquí. Con medio, sigue a la aprobación.', hint: 'Conditions → Paths' },
  { id: 'approval', kind: 'human', lane: 'mando', phase: 'run', ms: 900, label: 'Approval Process', detail: 'El mando aprueba mandar el medio a un sector amenazado (POST /human/approve). Desde el CECOP, el clic de «Enviar» es la aprobación.', hint: 'Approval Process del workflow' },
  { id: 'loop', kind: 'loop', lane: 'happyrobot', phase: 'run', ms: 400, label: 'Loop · colección, paralelo', detail: 'Una iteración por medio asignado. Dentro, por cada asignación:', hint: 'Loop en modo colección, paralelo' },
  { id: 'call-driver', kind: 'voice', lane: 'happyrobot', phase: 'run', inLoop: true, ms: 2200, label: 'Outbound Voice Agent · conductor', detail: 'Le lee la asignación: destino exacto, personas esperadas, vulnerables, minutos hasta el frente y casas cercanas para un solo viaje.', hint: 'AI Agent → Outbound Voice Agent «Aviso al medio»' },
  { id: 'extract', kind: 'extract', lane: 'happyrobot', phase: 'run', inLoop: true, ms: 900, label: 'Extract · desenlace y ETA', detail: 'De la transcripción: aceptado, rechazado o bloqueo, y la ETA que da el conductor.', hint: 'AI → Extract' },
  { id: 'paths-result', kind: 'paths', lane: 'happyrobot', phase: 'run', inLoop: true, ms: 700, label: 'Paths · según el desenlace', detail: 'Aceptado sigue. «Necesita reasignación»: vuelve al sandbox sin ese medio. Bloqueo: road_closures y ruta nueva.', hint: 'Conditions → Paths' },
  { id: 'sms', kind: 'sms', lane: 'vecino', phase: 'run', inLoop: true, ms: 1000, label: 'Outbound Text Agent · SMS', detail: 'Al conductor, el enlace con la ruta. A quien espera, quién llega y en cuántos minutos.', hint: 'AI Agent → Outbound Text Agent' },
  { id: 'vigia', kind: 'webhook', lane: 'api', phase: 'run', inLoop: true, ms: 800, label: 'Write to Twin + POST «Medio → Vigía»', detail: 'unit_log y patrol_assigned. El medio sale en el mapa con su ruta y sus paradas.', hint: 'Write to Twin · unit_log → POST «Medio → Vigía»' },
  { id: 'loop-end', kind: 'loop', lane: 'happyrobot', phase: 'run', ms: 500, label: 'Loop End', detail: 'Cierra cuando todas las iteraciones terminan.', hint: 'Loop End' },
  {
    id: 'watch', kind: 'clock', lane: 'happyrobot', phase: 'trail', ms: 0, label: 'Loop · cada minuto, ETA frente al fuego', detail: 'Query Twin de posición y frente. Rama «Frente en la ruta»: ruta nueva y rellamada route_recalculated.', hint: 'Loop fijo cada minuto → Paths',
    chain: [
      { kind: 'route', hint: 'Ruta nueva desde la posición actual del medio' },
      { kind: 'voice', hint: 'Outbound Voice Agent «Ruta nueva» · la única llamada que nace sola del bucle: el plan de hace veinte minutos ya no vale' },
    ],
  },
  {
    id: 'report', kind: 'extract', lane: 'happyrobot', phase: 'trail', ms: 0, label: 'Parte al llegar', detail: 'El conductor llama o el loop detecta on_scene: Extract (en el acceso, casa vaciada, recogida) → Write to Twin → POST «Parte → Vigía» → Slack al mando.', hint: 'Extract «Parte»',
    chain: [
      { kind: 'webhook', hint: 'POST «Parte → Vigía» · el medio y la casa cambian de estado en el mapa' },
      { kind: 'send', hint: 'Mensaje al puesto de mando (Slack)' },
    ],
  },
]

/** Los pasos que corren con reloj, en orden de ejecución. El CECOP los avanza con `setTimeout(ms)`. */
export const HR_UNIT_RUN_STEPS: HrUnitStep[] = HR_UNIT_SCRIPT.filter(step => step.phase === 'run')

/** Las cuatro tools del agente que habla con el conductor, con lo que cada una dispara detrás. */
export const HR_UNIT_TOOLS: HrCallTool[] = [
  { id: 'confirm', kind: 'note', word: 'Confirmar', hint: 'confirmar_asignacion · el conductor acepta y da su ETA', chain: [{ kind: 'dbWrite', hint: 'Write to Twin · unit_log: aceptado' }] },
  { id: 'reject', kind: 'loop', word: 'Rechazar', hint: 'rechazar_asignacion · no puede o no llega antes que el fuego', chain: [{ kind: 'code', hint: 'Vuelve al Python Sandbox sin ese medio: «Necesita reasignación»' }] },
  { id: 'block', kind: 'zone', word: 'Bloqueo', hint: 'reportar_bloqueo · carretera cortada, humo, árbol caído', chain: [{ kind: 'dbWrite', hint: 'Write to Twin · road_closures' }, { kind: 'route', hint: 'Ruta nueva que evita el corte' }] },
  { id: 'escalate', kind: 'human', word: 'Mando', hint: 'escalar_a_mando · pone al conductor con el CECOP', chain: [{ kind: 'building', hint: 'Outbound Voice Agent «Llamada al mando» · el único teléfono teñido es la rellamada del bucle' }] },
]

/** El run de un despacho mientras corre: el CECOP lo mantiene y la tarjeta lo dibuja. */
export type HrUnitRun = {
  id: string
  kind: UnitKind
  target: DispatchTarget
  agent: string
  label: string
  startedAt: number
  /** Índice del paso en curso en `HR_UNIT_RUN_STEPS`; `>= length` es «terminado». */
  step: number
  /** El vehículo, desde que sale en el paso de Vigía. */
  unitId?: string
}

/** Qué ficha del CECOP está abierta. `overview` es «ninguna»: se enseña el circuito completo. */
export type HrView = 'overview' | 'campaign' | 'people' | 'person' | 'alerts' | 'unit' | 'centers' | 'cop' | 'incidents' | 'layers' | 'escalation' | 'reroute'

/**
 * Cuánto de esta ficha pasa de verdad por HappyRobot hoy.
 * - `real`: el flujo ejecuta en la plataforma.
 * - `partial`: una parte ejecuta; el resto lo pinta la interfaz.
 * - `planned`: nada conectado todavía. El diagrama enseña lo que pasaría.
 * - `none`: HappyRobot no interviene en esta ficha.
 */
export type HrCoverage = 'real' | 'partial' | 'planned' | 'none'
export const HR_COVERAGE_LABEL: Record<HrCoverage, string> = { real: 'Real', partial: 'Parcial', planned: 'Previsto', none: 'Sin HappyRobot' }

export type HrViewSpec = { title: string; summary: string; coverage: HrCoverage }

/** Lo que cada diagrama puede necesitar del estado del mando. Se amplía ficha a ficha. */
/** El pulso de la campaña, para iluminar el flujo: cuántas llamadas hay y en qué punto están. */
export type HrCallsPulse = { total: number; open: number; answered: number }

/**
 * El pulso de un medio: lo que el CECOP sabe de verdad del vehículo pulsado. Es lo único que
 * ilumina el despacho; el diagrama no inventa ni ETA ni estado.
 */
export type HrUnitPulse = {
  id: string
  callSign: string
  kind: UnitKind
  status: UnitStatus
  mission: UnitMission
  /** Sube con cada redirección: revisión 2 es «se tiró el plan y salió otro». */
  revision: number
  /** Quién lo pidió («Operador · demo», «HappyRobot · Escalada») y la frase completa del despacho. */
  agent: string
  summary: string
  /** De dónde sale: hospital, parque, base aérea. */
  origin: string
  /** Etiqueta del destino asignado; en patrulla no hay. */
  target?: string
  /** Minutos que quedan por carretera, solo en camino. */
  etaMin?: number
  /** Kilómetros de la ruta, cuando la hay. */
  distanceKm?: number
  /** Por qué está detenido, solo en `hold`. */
  hold?: string
  /** Nació del run de escalada: la aprobación y la llamada a organismo ya pasaron allí. */
  escalated: boolean
  /** Las próximas paradas en orden: el destino de un despacho o el circuito de una patrulla desde la que viene ahora. */
  stops: { label: string; km?: number; etaMin?: number }[]
}

export type HrDiagramProps = {
  /** La API de crisis responde (`/api/roster`). */
  connected: boolean
  /** «Llamar de verdad» encendido: el círculo hace sonar teléfonos. */
  live: boolean
  /** Solo mientras hay una campaña: sin llamadas, el diagrama es la anatomía en reposo. */
  calls?: HrCallsPulse
  /** Solo con un vehículo pulsado: su despacho se ilumina con lo que el CECOP sabe de él. */
  unit?: HrUnitPulse
  /** Un despacho en marcha: los pasos avanzan con reloj hasta que el medio sale. */
  unitRun?: HrUnitRun | null
}

/**
 * El bucle del sistema, para la vista general: cinco paradas, una palabra cada una. El orden
 * es el del giro: el mando mira el mapa, rodea una zona, HappyRobot llama, el vecino contesta,
 * el agente triaja y el mapa cambia. Ids estables para poder iluminar la parada activa.
 */
export type HrLoopStep = { id: 'map' | 'zone' | 'call' | 'person' | 'triage'; kind: HrNodeKind; word: string }
export const HR_LOOP: HrLoopStep[] = [
  { id: 'map', kind: 'map', word: 'Mapa' },
  { id: 'zone', kind: 'zone', word: 'Zona' },
  { id: 'call', kind: 'voice', word: 'Llamada' },
  { id: 'person', kind: 'human', word: 'Vecino' },
  { id: 'triage', kind: 'extract', word: 'Triaje' },
]

export const HR_VIEWS: Record<HrView, HrViewSpec> = {
  overview: { title: 'El bucle', summary: 'Del círculo en el mapa a la llamada y de la llamada al color del punto.', coverage: 'real' },
  campaign: { title: 'Campaña', summary: 'El círculo va a la API y ella dispara un run por persona. Con «Llamar de verdad» apagado, todo es simulación local.', coverage: 'partial' },
  people: { title: 'Personas', summary: 'El color de cada persona es el extract que el agente postea al colgar. Sin llamada atendida, no hay color.', coverage: 'partial' },
  person: { title: 'Ficha de persona', summary: 'Triaje, motivo y hora salen del extract. Las rutas las calcula Mapbox, no HappyRobot.', coverage: 'partial' },
  alerts: { title: 'Plan operativo', summary: 'Avisar a la patrulla sería otro workflow disparado por webhook al escalar una casa sin respuesta. Hoy los medios son simulados.', coverage: 'planned' },
  unit: { title: 'Despacho de un medio', summary: 'El workflow «Despacho de medio» nodo a nodo: Twin, sandbox, aprobación, llamada al conductor, SMS y vuelta a Vigía. Corre en local como la escalada; la ruta y el movimiento son de Mapbox.', coverage: 'partial' },
  centers: { title: 'Centros y coordinación', summary: 'El preaviso al hospital o a bomberos saldría por un agente de voz o SMS de HappyRobot. Hoy es un borrador local.', coverage: 'planned' },
  cop: { title: 'Propagación y viento', summary: 'Un giro de viento reasigna salidas y la API dispararía rellamadas con la instrucción nueva. Hoy no conecta.', coverage: 'planned' },
  incidents: { title: 'Escenarios', summary: 'Cambiar de escenario no toca HappyRobot.', coverage: 'none' },
  layers: { title: 'Capas y leyenda', summary: 'Las capas son geometría del mapa. HappyRobot no interviene.', coverage: 'none' },
  escalation: { title: 'Escalada · sin respuesta', summary: 'Nadie descolgó. El mando aprueba y HappyRobot rellama, ordena por riesgo, avisa a Guardia Civil y 1-1-2 y deja constancia en Vigía.', coverage: 'partial' },
  reroute: { title: 'Rerruta · frente previsto', summary: 'El mando pinta un frente que aún no existe. HappyRobot detecta a quién le corta el camino, le busca otra salida desde donde está y se lo dice.', coverage: 'partial' },
}

// --------------------------------------------------------------------------- escalada a fuerzas de seguridad

/**
 * Un paso del run de escalada. Cada uno es un nodo real de la plataforma (el `hint` lleva su
 * nombre en el editor) encadenado como lo montaría el workflow «Escalada · hogar sin respuesta».
 * `ms` es cuánto tarda en la demo: la suma ronda los diez segundos.
 */
export type HrEscalationStep = { id: string; kind: HrNodeKind; lane: HrLane; label: string; detail: string; hint: string; ms: number; outcome?: 'done' | 'error' }

export const HR_ESCALATION_STEPS: HrEscalationStep[] = [
  { id: 'hook', kind: 'trigger', lane: 'api', label: 'Disparo desde Vigía', detail: 'La API manda los hogares con dos intentos sin respuesta: id, teléfono, coordenadas y minutos hasta el frente.', hint: 'Incoming hook · POST /hooks/escalada', ms: 1100 },
  { id: 'approval', kind: 'human', lane: 'mando', label: 'Aprobado por operador', detail: 'El mando ha pedido la escalada. Sin este paso el run no sigue.', hint: 'Approval Process del workflow', ms: 800 },
  { id: 'lookup', kind: 'db', lane: 'happyrobot', label: 'Consultar el registro', detail: 'Qué se sabe ya de esas casas: acompañantes, movilidad, quién contestó al lado.', hint: 'Query Twin with SQL · call_log', ms: 1300 },
  { id: 'recall', kind: 'voice', lane: 'vecino', label: 'Último intento de llamada', detail: 'Rellamada corta al hogar y a la persona de contacto si consta.', hint: 'Outbound Voice Agent · «Rellamada»', ms: 1900, outcome: 'error' },
  { id: 'rank', kind: 'route', lane: 'happyrobot', label: 'Ordenar por riesgo y acceso', detail: 'A quién le llega antes el fuego, y por dónde se entra: carretera para la ambulancia, a vista para el helicóptero.', hint: 'Google Maps · Distance Matrix + Python Sandbox', ms: 1400 },
  { id: 'organism', kind: 'building', lane: 'happyrobot', label: 'Llamada a Guardia Civil y 1-1-2', detail: 'Coordenadas, cuántos viven y quién corre más peligro. Pide helicóptero y ambulancia.', hint: 'Outbound Voice Agent · «Llamada a organismo»', ms: 2100 },
  { id: 'brief', kind: 'sms', lane: 'happyrobot', label: 'Parte escrito a los medios', detail: 'Lista de casas ordenada, acceso y punto de encuentro. Copia al CECOPI.', hint: 'Send SMS + Slack · canal del CECOPI', ms: 1000 },
  { id: 'vigia', kind: 'webhook', lane: 'api', label: 'Anotar y devolver a Vigía', detail: 'La escalada queda escrita y el mapa marca a esas casas como «fuerzas en camino».', hint: 'Write to Twin + POST «Escalada → Vigía»', ms: 800 },
]

/** Lo que se lanza al terminar el run, en este orden. */
export const HR_ESCALATION_UNITS = ['helicopter', 'ambulance'] as const

/** Estado del run que el CECOP mantiene mientras la tarjeta lo dibuja. */
export type HrEscalationRun = {
  id: string
  citizenIds: string[]
  label: string
  startedAt: number
  /** Índice del paso en curso; `>= HR_ESCALATION_STEPS.length` es «terminado». */
  step: number
  unitIds: string[]
}

// --------------------------------------------------------------------------- rerruta por frente previsto

/**
 * Un paso del run de rerruta. Mismo molde que la escalada: nodos reales de la plataforma, con el
 * nombre del editor en `hint`, encadenados como los montaría el workflow «Rerruta · frente
 * previsto». `ms` es lo que tarda en la demo; la suma ronda los nueve segundos y la ruta nueva de
 * Directions llega mientras se anuncia el aviso al vecino, así que los puntos giran con «Enviado».
 */
export type HrRerouteStep = { id: string; kind: HrNodeKind; lane: HrLane; label: string; detail: string; hint: string; ms: number }

export const HR_REROUTE_STEPS: HrRerouteStep[] = [
  { id: 'hook', kind: 'trigger', lane: 'api', label: 'Frente previsto recibido', detail: 'El mando pinta un frente que todavía no arde. La API lo mete en el modelo a +15 min y recalcula la exposición de cada ruta en curso.', hint: 'Incoming hook · POST /hooks/frente-previsto', ms: 1000 },
  { id: 'cross', kind: 'code', lane: 'api', label: 'Cruzar rutas con el frente', detail: 'Quién iba a atravesar el fuego previsto, y quién iba a un refugio que dentro de un rato ya no vale.', hint: 'Python Sandbox · exposición ruta a ruta', ms: 1200 },
  { id: 'lookup', kind: 'db', lane: 'happyrobot', label: 'Consultar el registro', detail: 'Quién va andando, quién lleva a alguien que no puede correr, quién ya llegó y no hace falta mover.', hint: 'Query Twin with SQL · call_log', ms: 1100 },
  { id: 'replan', kind: 'route', lane: 'happyrobot', label: 'Recalcular destino', detail: 'Desde donde están ahora, no desde casa. Fuera los refugios expuestos; de los que quedan gana el que llega antes del frente.', hint: 'Google Maps · Directions + Python Sandbox', ms: 1600 },
  { id: 'approval', kind: 'human', lane: 'mando', label: 'Aprobado por operador', detail: 'El plan nuevo pasa por el mando antes de decirle a nadie que se dé la vuelta.', hint: 'Approval Process del workflow', ms: 900 },
  { id: 'notify', kind: 'voice', lane: 'vecino', label: 'Aviso al vecino', detail: '«Alto. Esperen ahí. Cambia la ruta.» Llamada corta o SMS con el enlace nuevo, según lo que tenga cada uno en la mano.', hint: 'Outbound Voice Agent «Rerruta» + Send SMS', ms: 2000 },
  { id: 'vigia', kind: 'webhook', lane: 'api', label: 'Anotar y devolver a Vigía', detail: 'La ruta nueva queda escrita y los puntos giran en el mapa.', hint: 'Write to Twin + POST «Rerruta → Vigía»', ms: 900 },
]

/** Índice del paso en el que los vecinos reciben la ruta nueva: ahí el CECOP suelta el recálculo real. */
export const HR_REROUTE_RELEASE_STEP = HR_REROUTE_STEPS.findIndex(step => step.id === 'notify')

/** Estado del run de rerruta que el CECOP mantiene mientras la tarjeta lo dibuja. */
export type HrRerouteRun = {
  id: string
  citizenIds: string[]
  label: string
  startedAt: number
  /** Índice del paso en curso; `>= HR_REROUTE_STEPS.length` es «terminado». */
  step: number
}

/** Lo que la tarjeta enseña al acabar: a dónde va cada grupo ahora. */
export type HrRerouteOutcome = { zoneId: string; code: string; name: string; count: number }
