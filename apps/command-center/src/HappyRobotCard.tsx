/**
 * La tarjeta «qué hace HappyRobot detrás».
 *
 * Es la ventana del mando al circuito que no se ve en el mapa: qué workflow se dispara, qué
 * nodo está hablando con quién y por dónde vuelve el resultado. Cada ficha del CECOP tiene
 * (o tendrá) su propio diagrama; lo común es el cabecero con la marca, la fila de contexto
 * («detrás de qué ficha estás mirando»), el hueco del diagrama y el pie con el workflow.
 *
 * Vocabulario, etiquetas y qué cubre cada ficha: `hrModel.ts`. La marca es ajena y vive en
 * `HappyRobot.tsx`. Aquí solo componentes.
 */

import type { ReactNode } from 'react'
import { HappyRobotLogo } from './HappyRobot'
import { HR_CALL_TOOLS, HR_CALL_TRUNK, HR_COVERAGE_LABEL, HR_ESCALATION_STEPS, HR_ICONS, HR_LANE_LABEL, HR_LOOP, HR_STATE_LABEL, HR_UNIT_STEPS, HR_UNIT_TOOLS, HR_VIEWS } from './hrModel'
import type { HrCallNode, HrChainLink, HrDiagramProps, HrEscalationRun, HrLane, HrLoopStep, HrNodeKind, HrNodeState, HrUnitPulse, HrUnitStep, HrView } from './hrModel'
import { UNIT_LABEL, UNIT_STATUS_LABEL } from './units'

// --------------------------------------------------------------------------- primitivas del diagrama

export function HrIcon({ kind }: { kind: HrNodeKind }) {
  return <svg className="hr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={HR_ICONS[kind]} /></svg>
}

export type HrNodeProps = {
  kind: HrNodeKind
  label: string
  detail?: ReactNode
  lane?: HrLane
  state?: HrNodeState
  /** Un número que acompaña al nodo (llamadas en curso, personas, reintentos). */
  count?: number | string
  onClick?: () => void
  demoId?: string
  /** `still`: la arista que sale de este nodo no corre, porque lo siguiente no está construido. */
  edge?: 'still'
  /** Lo que cuelga del nodo (las tools de un agente): va debajo de la fila, dentro del mismo paso. */
  children?: ReactNode
}

/** Una fila del flujo. Va dentro de `<HrFlow>`. */
export function HrNode({ kind, label, detail, lane, state = 'idle', count, onClick, demoId, edge, children }: HrNodeProps) {
  const body = <>
    <span className="hr-node-icon"><HrIcon kind={kind} />{state === 'active' && <i className="hr-node-pulse" aria-hidden="true" />}</span>
    <span className="hr-node-copy">
      <strong>{label}{state !== 'idle' && <span className={`hr-tag ${state}`}>{HR_STATE_LABEL[state]}</span>}</strong>
      {detail && <small>{detail}</small>}
    </span>
    <span className="hr-node-side">{count !== undefined && <b>{count}</b>}{lane && <em>{HR_LANE_LABEL[lane]}</em>}</span>
  </>
  return (
    <li className="hr-node" data-state={state} data-lane={lane} data-edge={edge}>
      {onClick
        ? <button type="button" className="hr-node-row" data-demo="hr-node" data-demo-id={demoId} onClick={onClick}>{body}</button>
        : <div className="hr-node-row" data-demo="hr-node" data-demo-id={demoId}>{body}</div>}
      {children}
    </li>
  )
}

/** El flujo vertical: nodos unidos por una línea. Una lista, para que un lector de pantalla lo lea en orden. */
export function HrFlow({ children, label }: { children: ReactNode; label?: string }) {
  return <ol className="hr-flow" aria-label={label}>{children}</ol>
}

// --------------------------------------------------------------------------- diagramas

// Geometría del bucle: un anillo centrado, las paradas sobre el anillo y la palabra por fuera.
const LOOP_W = 320
const LOOP_H = 262
const LOOP_CX = 160
const LOOP_CY = 131
const LOOP_R = 80
const LOOP_LABEL_R = 114
const LOOP_NODE_R = 20

/**
 * La vista general: el bucle del sistema como anillo con cinco paradas, un icono y una palabra
 * por parada, y flechas que marcan el giro. Nada más a propósito. `active` ilumina una parada
 * cuando el mando está en esa parte del bucle.
 */
export function LoopDiagram({ active }: HrDiagramProps & { active?: HrLoopStep['id'] }) {
  const n = HR_LOOP.length
  const angleAt = (i: number) => ((-90 + (i * 360) / n) * Math.PI) / 180
  return (
    <svg className="hr-loop" viewBox={`0 0 ${LOOP_W} ${LOOP_H}`} role="img" aria-label={`Bucle: ${HR_LOOP.map(step => step.word).join(', ')} y vuelta al mapa`}>
      <circle className="hr-loop-ring" cx={LOOP_CX} cy={LOOP_CY} r={LOOP_R} />
      {HR_LOOP.map((step, i) => {
        // Flecha a mitad de camino hacia la parada siguiente, tangente al anillo, en el sentido del giro.
        const a = angleAt(i) + Math.PI / n
        const x = LOOP_CX + LOOP_R * Math.cos(a)
        const y = LOOP_CY + LOOP_R * Math.sin(a)
        return <path key={step.id} className="hr-loop-arrow" d="M-4 -3.5 1 0 -4 3.5" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((a * 180) / Math.PI + 90).toFixed(1)})`} />
      })}
      {HR_LOOP.map((step, i) => {
        const a = angleAt(i)
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const x = LOOP_CX + LOOP_R * cos
        const y = LOOP_CY + LOOP_R * sin
        const anchor = Math.abs(cos) < 0.6 ? 'middle' : cos > 0 ? 'start' : 'end'
        return (
          <g key={step.id} className="hr-loop-node" data-state={active === step.id ? 'active' : 'idle'} data-demo="hr-loop-step" data-demo-id={step.id}>
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={LOOP_NODE_R} />
            <svg className="hr-loop-icon" x={(x - 9).toFixed(1)} y={(y - 9).toFixed(1)} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={HR_ICONS[step.kind]} /></svg>
            <text x={(LOOP_CX + LOOP_LABEL_R * cos).toFixed(1)} y={(LOOP_CY + LOOP_LABEL_R * sin).toFixed(1)} textAnchor={anchor} dominantBaseline="middle">{step.word}</text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Un nodo compacto: icono, una palabra y, si toca, un número. El detalle va en el `title`.
 * `chain` son los nodos que el editor encadena a su derecha (normalizar el número, llamar, escribir
 * en el Twin…): se pintan como iconos pequeños en fila, porque lo que importa es que la tool no
 * contesta, dispara algo fuera. Cada eslabón lleva su propio `title` con el nombre real del nodo.
 */
/** Lo que un nodo dispara detrás, en iconos pequeños unidos por flechas, como los encadena el editor. */
function Chain({ links }: { links: HrChainLink[] }) {
  return (
    <span className="hr-chain">
      {links.map((link, index) => (
        <span key={link.kind + index} className="hr-chain-link" data-kind={link.kind} title={link.hint}>
          <svg className="hr-chain-arrow" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 1 3 3-3 3" /></svg>
          <HrIcon kind={link.kind} />
        </span>
      ))}
    </span>
  )
}

function CompactNode({ node, state = 'idle', count, chain, demo = 'hr-call-node' }: { node: HrCallNode; state?: HrNodeState; count?: number | string; chain?: HrChainLink[]; demo?: string }) {
  return (
    <span className="hr-cnode" data-state={state} title={node.hint} data-demo={demo} data-demo-id={node.id}>
      <span className="hr-node-icon"><HrIcon kind={node.kind} />{state === 'active' && <i className="hr-node-pulse" aria-hidden="true" />}</span>
      <strong>{node.word}</strong>
      {count !== undefined && count !== 0 && count !== '' && <b>{count}</b>}
      {chain && chain.length > 0 && <Chain links={chain} />}
    </span>
  )
}

/**
 * La anatomía de una llamada, con el formato del agente en el editor de HappyRobot: el tronco
 * (API → cerrojo → agente → Observación → Vigía) y las herramientas colgando del agente. Se enseña
 * cuando hay N llamadas en marcha, pero dibuja UNA: cómo es y qué puede hacer el agente. Con pulso
 * de campaña, la API enseña cuántas se han lanzado, el agente cuántas están sonando y Vigía cuántas
 * han vuelto ya con observación.
 */
export function CallDiagram({ calls }: HrDiagramProps) {
  const total = calls?.total ?? 0
  const open = calls?.open ?? 0
  const answered = calls?.answered ?? 0
  const trunkState = (id: string): HrNodeState => {
    if (!total) return 'idle'
    if (id === 'agent') return open > 0 ? 'active' : 'done'
    if (id === 'extract' || id === 'vigia') return answered > 0 ? 'done' : 'idle'
    return 'done'
  }
  const trunkCount = (id: string) => id === 'hook' ? total : id === 'agent' ? open : id === 'vigia' ? answered : undefined
  return (
    <ol className="hr-tree" aria-label="Anatomía de una llamada">
      {HR_CALL_TRUNK.map(node => (
        <li key={node.id} className="hr-tree-node" data-state={trunkState(node.id)}>
          <CompactNode node={node} state={trunkState(node.id)} count={trunkCount(node.id)} />
          {node.id === 'agent' && (
            <ol className="hr-tools" aria-label="Herramientas del agente">
              {HR_CALL_TOOLS.map(tool => <li key={tool.id}><CompactNode node={tool} chain={tool.chain} /></li>)}
            </ol>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * El despacho de un medio, en el formato del run de escalada: pill de estado arriba, un paso por
 * fila con frase, detalle y carril, y las tools del agente colgando de la llamada al conductor. Se
 * dibuja para el vehículo pulsado y se enciende con lo que el CECOP sabe de él: en patrulla nada ha
 * disparado y los pasos reales están en reposo; con destino, la petición y la elección están hechas
 * y la ruta late mientras calcula o avanza (con su ETA), acaba en verde al llegar al acceso y en
 * ámbar si no hay carretera. Lo que no está construido va discontinuo, «previsto», y con la arista
 * quieta; un medio nacido de la escalada hereda de ese run la aprobación y la llamada como hechas.
 */
export function UnitDiagram({ unit }: HrDiagramProps) {
  if (!unit) return null
  const dispatched = unit.mission === 'dispatch'
  const flies = unit.kind === 'helicopter'
  const km = unit.distanceKm !== undefined ? `${unit.distanceKm.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : ''
  const stepState = (step: HrUnitStep): HrNodeState => {
    if (!step.built) return unit.escalated && (step.id === 'approve' || step.id === 'driver') ? 'done' : 'mock'
    if (!dispatched) return 'idle'
    if (step.id !== 'route') return 'done'
    if (unit.status === 'hold') return 'error'
    if (unit.status === 'on_scene') return 'done'
    return 'active'
  }
  // El detalle de los pasos reales sale del medio, no del modelo: es lo que el CECOP sabe ahora.
  const stepDetail = (step: HrUnitStep, state: HrNodeState): ReactNode => {
    if (state === 'idle') return undefined
    let text = step.detail
    if (dispatched && step.id === 'hook') text = unit.summary
    else if (dispatched && step.id === 'pick') text = unit.revision > 1 ? `Revisión ${unit.revision}: ${unit.callSign} estaba libre y se redirige desde su posición actual.` : `${unit.callSign} sale de ${unit.origin}.`
    else if (dispatched && step.id === 'route') {
      if (unit.status === 'hold') text = unit.hold ?? 'Sin carretera disponible.'
      else if (unit.status === 'requested') text = flies ? 'Trazando el vuelo en línea recta…' : 'Calculando la carretera hasta el acceso…'
      else if (unit.status === 'on_scene') text = flies ? `${km} en vuelo directo. En el destino.` : `${km} recorridos. En el acceso, sin conectores a edificios.`
      else text = `${km}${km ? ' · ' : ''}llega en ${unit.etaMin ?? '?'} min.`
    }
    else if (unit.escalated && step.id === 'approve') text = `Aprobado por el operador en el run de escalada (${unit.agent}).`
    else if (unit.escalated && step.id === 'driver') text = 'En la escalada la llamada fue a Guardia Civil y 1-1-2: coordenadas, cuántos viven y quién corre más peligro.'
    return <span title={step.hint}>{text}{step.chain && <Chain links={step.chain} />}</span>
  }
  const stepCount = (step: HrUnitStep) => step.id === 'route' && unit.status === 'en_route' && unit.etaMin ? `${unit.etaMin} min` : undefined
  const head = unit.status === 'en_route' ? { cls: 'active', label: `En camino${unit.etaMin ? ` · ${unit.etaMin} min` : ''}` }
    : unit.status === 'requested' ? { cls: 'active', label: 'Calculando ruta' }
    : unit.status === 'on_scene' ? { cls: 'done', label: 'En el acceso' }
    : unit.status === 'hold' ? { cls: 'error', label: 'Sin ruta' }
    : { cls: 'idle', label: 'Patrullando' }
  return (
    <div className="hr-run" data-demo="hr-unit" data-status={unit.status}>
      <div className="hr-run-head">
        <span className={`hr-run-state ${head.cls}`}><i aria-hidden="true" />{head.label}</span>
        <small title={unit.summary}>{unit.target ?? 'Sin tarea asignada'}</small>
      </div>
      {unit.status === 'on_scene' && (
        <div className="hr-run-result" role="status">
          <strong>Medio en el acceso</strong>
          <ul><li><b>{unit.callSign}</b><span>{UNIT_LABEL[unit.kind]} · {unit.target}</span><em>{km}</em></li></ul>
          <small>Lo que pase en la puerta es el parte. Hoy nadie lo recoge: está previsto.</small>
        </div>
      )}
      {unit.status === 'hold' && (
        <div className="hr-run-result error" role="status">
          <strong>Sin carretera</strong>
          <small>{unit.hold} Se reintenta desde el plan operativo.</small>
        </div>
      )}
      <HrFlow label="Despacho de un medio">
        {HR_UNIT_STEPS.map((step, index) => {
          const state = stepState(step)
          const next = HR_UNIT_STEPS[index + 1]
          return (
            <HrNode key={step.id} kind={step.kind} lane={step.lane} state={state} label={step.id === 'route' && flies ? 'Vuelo hasta el destino' : step.label} detail={stepDetail(step, state)} count={stepCount(step)} demoId={step.id} edge={next && stepState(next) === 'mock' ? 'still' : undefined}>
              {step.id === 'driver' && (
                <ol className="hr-tools" aria-label="Herramientas del agente">
                  {HR_UNIT_TOOLS.map(tool => <li key={tool.id}><CompactNode node={tool} state="mock" chain={tool.chain} demo="hr-unit-node" /></li>)}
                </ol>
              )}
            </HrNode>
          )
        })}
      </HrFlow>
    </div>
  )
}

/**
 * La fila de contexto de un medio: distintivo y cuerpo, con el estado real en el `title`. El
 * estado en sí lo cuenta la pill del diagrama; aquí solo se dice de quién se habla.
 */
function UnitContext({ unit }: { unit: HrUnitPulse }) {
  const status = `${UNIT_STATUS_LABEL[unit.status]}${unit.target ? ` · Destino: ${unit.target}` : ''}`
  return <strong title={status}>{unit.callSign} · {UNIT_LABEL[unit.kind]}</strong>
}

/**
 * El run de escalada, paso a paso. Es la misma anatomía que la llamada, pero en vertical y con
 * reloj: el nodo en curso late, los hechos quedan marcados, la rellamada termina «sin resultado»
 * a propósito (nadie descolgó, por eso estamos aquí) y al final se anuncia qué medios salieron.
 * Lo que pasa en el mapa (los medios moviéndose) lo dispara el CECOP cuando `run.step` llega
 * al final; aquí solo se dibuja.
 */
export function EscalationDiagram({ run, units }: { run: HrEscalationRun; units: { callSign: string; label: string; eta: string }[] }) {
  const finished = run.step >= HR_ESCALATION_STEPS.length
  const stateAt = (index: number, outcome?: 'done' | 'error'): HrNodeState => index < run.step ? (outcome ?? 'done') : index === run.step ? 'active' : 'idle'
  return (
    <div className="hr-run" data-demo="hr-escalation" data-finished={finished}>
      <div className="hr-run-head">
        <span className={`hr-run-state ${finished ? 'done' : 'active'}`}><i aria-hidden="true" />{finished ? 'Enviado' : 'Ejecutando run'}</span>
        <small>{run.label}</small>
      </div>
      {finished && (
        <div className="hr-run-result" role="status">
          <strong>Medios en camino</strong>
          <ul>{units.map(unit => <li key={unit.callSign}><b>{unit.callSign}</b><span>{unit.label}</span><em>{unit.eta || 'calculando'}</em></li>)}</ul>
          <small>Las casas quedan marcadas en el mapa hasta que alguien llame a la puerta.</small>
        </div>
      )}
      <HrFlow label="Pasos de la escalada">
        {HR_ESCALATION_STEPS.map((step, index) => {
          const state = stateAt(index, step.outcome)
          return <HrNode key={step.id} kind={step.kind} lane={step.lane} state={state} label={step.label} detail={state === 'idle' ? undefined : <span title={step.hint}>{state === 'error' ? 'Sin respuesta. Se escala.' : step.detail}</span>} demoId={step.id} />
        })}
      </HrFlow>
    </div>
  )
}

/**
 * Qué diagrama enseña cada ficha. Las que no tienen el suyo todavía enseñan el resumen y
 * «en preparación»; las fichas en las que HappyRobot no interviene enseñan el circuito completo.
 * No se exporta a propósito: es el único sitio donde se registra un diagrama nuevo.
 */
const HR_DIAGRAMS: Partial<Record<HrView, (props: HrDiagramProps) => ReactNode>> = {
  overview: LoopDiagram,
  incidents: LoopDiagram,
  layers: LoopDiagram,
  campaign: CallDiagram,
  unit: UnitDiagram,
}

// --------------------------------------------------------------------------- la tarjeta

export type HappyRobotCardProps = HrDiagramProps & {
  view: HrView
  collapsed: boolean
  onToggleCollapse: () => void
  onClose: () => void
  /** Run de escalada en marcha o recién terminado: la tarjeta lo dibuja por encima de cualquier ficha. */
  escalation?: { run: HrEscalationRun; units: { callSign: string; label: string; eta: string }[] } | null
}

export function HappyRobotCard({ view, connected, live, calls, unit, collapsed, onToggleCollapse, onClose, escalation }: HappyRobotCardProps) {
  const spec = HR_VIEWS[view]
  const Diagram = HR_DIAGRAMS[view]
  const status = connected && live ? { key: 'live', label: 'Llamadas reales' } : connected ? { key: 'connected', label: 'API conectada' } : { key: 'demo', label: 'Modo demo' }
  return (
    <aside className={`hr-card ${collapsed ? 'is-collapsed' : ''}`} data-demo="hr-card" aria-label="Qué hace HappyRobot">
      <header className="hr-card-head">
        <button type="button" className="hr-card-brand" data-demo="hr-collapse" aria-expanded={!collapsed} aria-controls="hr-card-content" onClick={onToggleCollapse}>
          <HappyRobotLogo className="hr-logo" />
          <span className="hr-status" data-state={status.key} role="status"><i aria-hidden="true" />{status.label}</span>
          <svg className={`hr-chevron ${collapsed ? 'is-collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m8 10 4 4 4-4" /></svg>
        </button>
        <button type="button" className="hr-card-close" data-demo="hr-close" aria-label="Ocultar la tarjeta de HappyRobot" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </header>
      <div id="hr-card-content" className="hr-card-content" hidden={collapsed}>
        <div className="hr-card-context">
          <span className="eyebrow">Detrás de</span>
          {view === 'unit' && unit ? <UnitContext unit={unit} /> : <strong>{spec.title}</strong>}
          {calls && calls.total > 0 && view !== 'unit' && <span className="hr-pulse-chip" title={`${calls.total} llamadas · ${calls.open} en curso · ${calls.answered} contestadas`}><HrIcon kind="voice" />{calls.total}</span>}
          <span className={`hr-tag coverage ${spec.coverage}`}>{HR_COVERAGE_LABEL[spec.coverage]}</span>
        </div>
        <div className="hr-card-body">
          {escalation
            ? <EscalationDiagram run={escalation.run} units={escalation.units} />
            : Diagram
              ? <Diagram connected={connected} live={live} calls={calls} unit={unit} />
              : <div className="hr-pending"><p>{spec.summary}</p><span className="hr-tag">Diagrama en preparación</span></div>}
        </div>
      </div>
    </aside>
  )
}
