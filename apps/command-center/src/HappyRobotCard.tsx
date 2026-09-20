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
import { HR_CALL_TOOLS, HR_CALL_TRUNK, HR_COVERAGE_LABEL, HR_ICONS, HR_LANE_LABEL, HR_LOOP, HR_STATE_LABEL, HR_VIEWS } from './hrModel'
import type { HrCallNode, HrChainLink, HrDiagramProps, HrLane, HrLoopStep, HrNodeKind, HrNodeState, HrView } from './hrModel'

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
}

/** Una fila del flujo. Va dentro de `<HrFlow>`. */
export function HrNode({ kind, label, detail, lane, state = 'idle', count, onClick, demoId }: HrNodeProps) {
  const body = <>
    <span className="hr-node-icon"><HrIcon kind={kind} />{state === 'active' && <i className="hr-node-pulse" aria-hidden="true" />}</span>
    <span className="hr-node-copy">
      <strong>{label}{state !== 'idle' && <span className={`hr-tag ${state}`}>{HR_STATE_LABEL[state]}</span>}</strong>
      {detail && <small>{detail}</small>}
    </span>
    <span className="hr-node-side">{count !== undefined && <b>{count}</b>}{lane && <em>{HR_LANE_LABEL[lane]}</em>}</span>
  </>
  return (
    <li className="hr-node" data-state={state} data-lane={lane}>
      {onClick
        ? <button type="button" className="hr-node-row" data-demo="hr-node" data-demo-id={demoId} onClick={onClick}>{body}</button>
        : <div className="hr-node-row" data-demo="hr-node" data-demo-id={demoId}>{body}</div>}
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
function CompactNode({ node, state = 'idle', count, chain }: { node: HrCallNode; state?: HrNodeState; count?: number; chain?: HrChainLink[] }) {
  return (
    <span className="hr-cnode" data-state={state} title={node.hint} data-demo="hr-call-node" data-demo-id={node.id}>
      <span className="hr-node-icon"><HrIcon kind={node.kind} />{state === 'active' && <i className="hr-node-pulse" aria-hidden="true" />}</span>
      <strong>{node.word}</strong>
      {count !== undefined && count > 0 && <b>{count}</b>}
      {chain && chain.length > 0 && (
        <span className="hr-chain">
          {chain.map((link, index) => (
            <span key={link.kind + index} className="hr-chain-link" data-kind={link.kind} title={link.hint}>
              <svg className="hr-chain-arrow" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 1 3 3-3 3" /></svg>
              <HrIcon kind={link.kind} />
            </span>
          ))}
        </span>
      )}
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
 * Qué diagrama enseña cada ficha. Las que no tienen el suyo todavía enseñan el resumen y
 * «en preparación»; las fichas en las que HappyRobot no interviene enseñan el circuito completo.
 * No se exporta a propósito: es el único sitio donde se registra un diagrama nuevo.
 */
const HR_DIAGRAMS: Partial<Record<HrView, (props: HrDiagramProps) => ReactNode>> = {
  overview: LoopDiagram,
  incidents: LoopDiagram,
  layers: LoopDiagram,
  campaign: CallDiagram,
}

// --------------------------------------------------------------------------- la tarjeta

export type HappyRobotCardProps = HrDiagramProps & {
  view: HrView
  collapsed: boolean
  onToggleCollapse: () => void
  onClose: () => void
}

export function HappyRobotCard({ view, connected, live, calls, collapsed, onToggleCollapse, onClose }: HappyRobotCardProps) {
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
          <strong>{spec.title}</strong>
          {calls && calls.total > 0 && <span className="hr-pulse-chip" title={`${calls.total} llamadas · ${calls.open} en curso · ${calls.answered} contestadas`}><HrIcon kind="voice" />{calls.total}</span>}
          <span className={`hr-tag coverage ${spec.coverage}`}>{HR_COVERAGE_LABEL[spec.coverage]}</span>
        </div>
        <div className="hr-card-body">
          {Diagram
            ? <Diagram connected={connected} live={live} calls={calls} />
            : <div className="hr-pending"><p>{spec.summary}</p><span className="hr-tag">Diagrama en preparación</span></div>}
        </div>
      </div>
    </aside>
  )
}
