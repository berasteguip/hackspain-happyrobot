/**
 * Recorrido guiado del puesto de mando, pensado para que alguien que no ha visto la
 * plataforma (un jurado, un mando de Protección Civil) entienda en tres minutos qué hace
 * router y por qué. No es una visita a la interfaz: es una demo en vivo. Los pasos que
 * llevan `run` ejecutan la operación de verdad (lanzan las llamadas, escalan a fuerzas de
 * seguridad, giran el viento) y el visitante ve el mapa moverse mientras lee. Cada paso
 * abre la vista que explica antes de que Driver mida el anclaje y lleva, si procede, una
 * línea en directo con lo que está ocurriendo (cuántos han contestado, en qué nodo va el
 * run, cuántas alertas ha generado el giro del viento).
 *
 * El orden es la historia del producto y la escalera de la rúbrica del reto: situación,
 * la gente que nadie ve, actuar (llamar), el motor, priorizar, seguir a una casa, escalar,
 * adaptarse al cambio, tirar el plan, coordinar, y el turno del visitante.
 */
import type { DriveStep, PopoverDOM } from 'driver.js'

export const TOUR_STORAGE_KEY = 'vigia-tour-seen'

export type TourPanel = 'people' | 'cop' | 'centers' | 'alerts' | 'campaign' | null

/** Operación real que el paso dispara al abrirse. */
export type TourRun = 'call-risk' | 'escalate' | 'shift-wind'

/** Lo que tiene que estar a la vista para que el paso tenga anclaje. */
export type TourView = {
  panel?: TourPanel
  /** Abre la ficha de una persona: la primera sin respuesta si `silent`, o la seleccionada / primera de la cola. */
  person?: boolean
  silent?: boolean
  /** Abre la tarjeta «Qué hace HappyRobot». */
  happyRobot?: boolean
  /** Encuadra el mapa sobre la zona de riesgo recomendada para que se vean los puntos. */
  focus?: 'risk'
  run?: TourRun
}

export type DemoTourActions = {
  open: (view: TourView) => void
  close: () => void
  /**
   * Se llama cada medio segundo mientras el paso está en pantalla. Devuelve la línea en
   * directo del paso (o nada) y puede completar una operación aplazada: por ejemplo,
   * escalar cuando aparece la primera casa sin respuesta si aún no la había.
   */
  tick: (stepId: string) => string | null
}

export type DemoTourStep = {
  id: string
  /** Criterio de la rúbrica o momento de la historia. Va en mayúsculas pequeñas sobre el título. */
  kicker: string
  element: string
  side: 'top' | 'right' | 'bottom' | 'left'
  title: string
  description: string
  actions?: string[]
  view: TourView
}

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'situacion', kicker: 'Situación', element: '[data-demo="tour-fire"]', side: 'left', view: {},
    title: 'El fuego, y hacia dónde va',
    description: 'La mancha es el frente activo. Los anillos, hasta dónde puede llegar en una hora con este viento. router decide con esa proyección; no espera al perímetro oficial, que llega tarde.',
  },
  {
    id: 'personas', kicker: 'Lo que el mando no ve', element: '[data-demo="tour-people"]', side: 'left', view: { focus: 'risk' },
    title: 'Cada punto es una casa con teléfono',
    description: 'Hoy el CECOP ve el fuego, no a la gente. Aquí está cada persona del censo dentro del anillo de riesgo. Cuando contesta, el punto cambia de color según cómo está.',
  },
  {
    id: 'llamar', kicker: 'Actuar, no proponer', element: '[data-demo="campaign-dock"]', side: 'top', view: { focus: 'risk', run: 'call-risk' },
    title: 'Acabamos de llamar a toda la zona',
    description: 'HappyRobot está hablando con todas las casas a la vez, cuatro agentes en paralelo. Mira los puntos: se encienden al sonar, cambian al contestar y se ponen en rojo si nadie descuelga.',
  },
  {
    id: 'happyrobot', kicker: 'El motor', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true },
    title: 'Esto pasa dentro de cada llamada',
    description: 'Voz, extracción de datos (cuántos son, si alguien no puede andar), SMS con la ruta y enlace de ubicación, y el webhook que lo devuelve al mapa. El nodo encendido es lo que ocurre ahora mismo.',
  },
  {
    id: 'cola', kicker: 'Priorizar', element: '[data-demo="panel"]', side: 'left', view: { panel: 'people' },
    title: 'Cuando todo es urgente, esto va primero',
    description: 'La cola ordena por lo que importa: fuera del núcleo, sin respuesta, ruta en revisión. Nadie repasa cien fichas; se ven las tres que cambian algo.',
  },
  {
    id: 'ficha', kicker: 'Seguimiento', element: '[data-demo="panel"]', side: 'left', view: { person: true, silent: true },
    title: 'Una casa que no ha descolgado',
    description: 'Dos intentos, nadie contesta, sin ubicación. Ficha en rojo. router no la deja en una lista: abajo aparece «Enviar fuerzas de seguridad». Lo pulsamos en el siguiente paso.',
  },
  {
    id: 'escalada', kicker: 'Escalar', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true, run: 'escalate' },
    title: 'Fuerzas de seguridad, sin esperar',
    description: 'Es el run real de HappyRobot: consulta el registro, rellama, ordena por riesgo, llama a Guardia Civil y 1-1-2, manda el parte y lo anota. Al acabar despega el helicóptero. Un operador aprueba; siempre.',
  },
  {
    id: 'viento', kicker: 'Adaptarse al cambio', element: '[data-demo="fire-wind-shift"]', side: 'left', view: { panel: 'cop', run: 'shift-wind' },
    title: 'El viento acaba de girar',
    description: 'Los anillos se mueven. router vuelve a evaluar quién está ahora en peligro, qué rutas cruzan el fuego y qué refugio ya no sirve. El plan de hace cinco minutos deja de valer.',
  },
  {
    id: 'plan', kicker: 'Cuándo tirar el plan', element: '[data-demo="panel"]', side: 'left', view: { panel: 'alerts' },
    title: 'Plan desactualizado: siguiente acción',
    description: 'Aquí está lo que ha cambiado, la siguiente acción concreta y los medios en marcha. Nada se ejecuta sin que alguien lo adopte: el sistema propone, el mando decide.',
  },
  {
    id: 'centros', kicker: 'Coordinar', element: '[data-demo="panel"]', side: 'left', view: { panel: 'centers' },
    title: 'Vecino, bombero y mando no reciben lo mismo',
    description: 'Hospitales, centros de salud y parques con su ficha. Preaviso sanitario o petición de apoyo en dos clics, con el mensaje que necesita cada uno.',
  },
  {
    id: 'empieza', kicker: 'Tu turno', element: '[data-demo="tool-area"]', side: 'bottom', view: {},
    title: 'Ahora tú',
    description: 'Dibuja tu propia zona con «Zona» y llámala. Abre una ficha y envía un medio. Avanza el fuego en Propagación y mira qué pasa con el plan.',
    actions: ['La demo sigue viva: las llamadas, el helicóptero y el viento que has visto siguen ahí.', 'Puedes repetir el recorrido desde «Ver recorrido».'],
  },
]

export const TOUR_INTRO = {
  kicker: 'router · puesto de mando',
  title: 'Cómo se guía una evacuación, persona a persona',
  lede: 'router junta las llamadas de HappyRobot, la posición de cada vecino y la evolución del incendio en una sola pantalla. Esta demo es en vivo: lo que ves pasar, está pasando.',
  checklist: [
    'Llamar a todas las casas de una zona a la vez',
    'Ver quién no contesta y escalar a las fuerzas de seguridad',
    'Girar el viento y ver cómo cambia el plan',
  ],
  primary: 'Empezar la demo · 3 min',
  secondary: 'Explorar por mi cuenta',
  replay: 'Ver recorrido',
}

let activeTour: { isActive: () => boolean; destroy: () => void } | null = null
let tourGeneration = 0

export function shouldShowTourIntro() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('guia') === '1') return true
  if (params.get('p')) return false
  try { return !window.localStorage.getItem(TOUR_STORAGE_KEY) } catch { return true }
}

export function markTourSeen() {
  try { window.localStorage.setItem(TOUR_STORAGE_KEY, '1') } catch { /* El recorrido sigue disponible. */ }
}

export function stopDemoTour() {
  tourGeneration += 1
  if (activeTour?.isActive()) activeTour.destroy()
  activeTour = null
}

function decoratePopover(popover: PopoverDOM, step: DemoTourStep, index: number, total: number, live: string | null) {
  popover.closeButton.setAttribute('aria-label', 'Cerrar recorrido')
  for (const selector of ['.tour-kicker', '.tour-actions', '.tour-live', '.tour-progress', '.tour-keys']) popover.wrapper.querySelector(selector)?.remove()

  const progress = document.createElement('div')
  progress.className = 'tour-progress'
  progress.setAttribute('aria-hidden', 'true')
  const bar = document.createElement('span')
  bar.style.width = `${Math.round(((index + 1) / total) * 100)}%`
  progress.appendChild(bar)
  popover.wrapper.prepend(progress)

  const kicker = document.createElement('p')
  kicker.className = 'tour-kicker'
  kicker.textContent = `${index + 1} · ${step.kicker}`
  if (step.view.run) {
    const pill = document.createElement('span')
    pill.className = 'tour-live-pill'
    pill.textContent = 'En directo'
    kicker.appendChild(pill)
  }
  popover.title.before(kicker)

  const liveLine = document.createElement('p')
  liveLine.className = 'tour-live'
  liveLine.setAttribute('role', 'status')
  liveLine.hidden = !live
  liveLine.textContent = live ?? ''
  popover.description.after(liveLine)

  if (step.actions?.length) {
    const list = document.createElement('ul')
    list.className = 'tour-actions'
    for (const item of step.actions) {
      const li = document.createElement('li')
      li.textContent = item
      list.appendChild(li)
    }
    liveLine.after(list)
  }

  const keys = document.createElement('small')
  keys.className = 'tour-keys'
  keys.textContent = '→ siguiente · ← atrás · Esc salir'
  popover.footer.appendChild(keys)
}

export async function startDemoTour(actions: DemoTourActions) {
  if (typeof window === 'undefined') return
  const generation = ++tourGeneration
  if (activeTour?.isActive()) activeTour.destroy()
  activeTour = null
  const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')])
  if (generation !== tourGeneration) return

  const total = DEMO_TOUR_STEPS.length
  const last = total - 1
  let liveTimer = 0
  const stopLive = () => { if (liveTimer) window.clearInterval(liveTimer); liveTimer = 0 }

  const tour = driver({
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    smoothScroll: false,
    overlayColor: '#0b1012',
    overlayOpacity: 0.42,
    stagePadding: 10,
    stageRadius: 12,
    popoverOffset: 14,
    allowClose: true,
    // El clic fuera no avanza: en el mapa se pulsa sin querer y el visitante pierde el hilo.
    overlayClickBehavior: () => undefined,
    disableActiveInteraction: true,
    // Cada paso prepara su propia vista, así que un anclaje que falte es un error nuestro,
    // no algo que saltar en silencio. Driver espera a que React lo pinte.
    skipMissingElement: false,
    waitForElement: 3000,
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: 'Explorar',
    popoverClass: 'vigia-tour',
    onNextClick: (_element, _step, { state }) => {
      const next = (state.activeIndex ?? 0) + 1
      if (next > last) tour.destroy()
      else showStep(next)
    },
    onPrevClick: (_element, _step, { state }) => showStep(Math.max(0, (state.activeIndex ?? 0) - 1)),
    onPopoverRender: (popover, { state }) => {
      const index = state.activeIndex ?? 0
      const step = DEMO_TOUR_STEPS[index]
      if (step) decoratePopover(popover, step, index, total, actions.tick(step.id))
    },
    onDestroyed: () => {
      stopLive()
      if (generation !== tourGeneration) return
      markTourSeen()
      actions.close()
      window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.tour-replay')?.focus())
      if (activeTour === tour) activeTour = null
    },
    steps: DEMO_TOUR_STEPS.map((step): DriveStep => ({
      element: step.element,
      popover: { title: step.title, description: step.description, side: step.side, align: 'start' },
    })),
  })

  function showStep(index: number) {
    stopLive()
    const step = DEMO_TOUR_STEPS[index]
    actions.open(step.view)
    // Los anclajes de dentro de un panel pueden estar al final de una lista con scroll.
    document.querySelector(step.element)?.scrollIntoView({ block: 'center', behavior: 'instant' })
    tour.drive(index)
    // Mientras el paso está en pantalla, la línea en directo se refresca y, si el anclaje
    // ha cambiado de sitio o de tamaño (la tarjeta crece con el run, el panel cambia de
    // alto), el foco se recoloca.
    let lastRect = ''
    liveTimer = window.setInterval(() => {
      if (!tour.isActive() || tour.getActiveIndex() !== index) { stopLive(); return }
      const live = actions.tick(step.id)
      const line = document.querySelector<HTMLElement>('.vigia-tour .tour-live')
      if (line) {
        line.hidden = !live
        if (line.textContent !== (live ?? '')) line.textContent = live ?? ''
      }
      const box = document.querySelector(step.element)?.getBoundingClientRect()
      const rect = box ? [box.x, box.y, box.width, box.height].map(Math.round).join(',') : ''
      if (rect && rect !== lastRect) { lastRect = rect; tour.refresh() }
    }, 500)
  }

  activeTour = tour
  showStep(0)
}
