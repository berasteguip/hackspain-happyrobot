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
export type HrNodeKind = 'trigger' | 'lock' | 'voice' | 'extract' | 'webhook' | 'api' | 'map' | 'zone' | 'human' | 'sms' | 'loop' | 'route' | 'building' | 'note' | 'search' | 'code' | 'db' | 'dbWrite' | 'send'

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

/** Qué ficha del CECOP está abierta. `overview` es «ninguna»: se enseña el circuito completo. */
export type HrView = 'overview' | 'campaign' | 'people' | 'person' | 'alerts' | 'centers' | 'cop' | 'incidents' | 'layers' | 'escalation'

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

export type HrDiagramProps = {
  /** La API de crisis responde (`/api/roster`). */
  connected: boolean
  /** «Llamar de verdad» encendido: el círculo hace sonar teléfonos. */
  live: boolean
  /** Solo mientras hay una campaña: sin llamadas, el diagrama es la anatomía en reposo. */
  calls?: HrCallsPulse
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
  centers: { title: 'Centros y coordinación', summary: 'El preaviso al hospital o a bomberos saldría por un agente de voz o SMS de HappyRobot. Hoy es un borrador local.', coverage: 'planned' },
  cop: { title: 'Propagación y viento', summary: 'Un giro de viento reasigna salidas y la API dispararía rellamadas con la instrucción nueva. Hoy no conecta.', coverage: 'planned' },
  incidents: { title: 'Escenarios', summary: 'Cambiar de escenario no toca HappyRobot.', coverage: 'none' },
  layers: { title: 'Capas y leyenda', summary: 'Las capas son geometría del mapa. HappyRobot no interviene.', coverage: 'none' },
  escalation: { title: 'Escalada · sin respuesta', summary: 'Nadie descolgó. El mando aprueba y HappyRobot rellama, ordena por riesgo, avisa a Guardia Civil y 1-1-2 y deja constancia en Vigía.', coverage: 'partial' },
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
