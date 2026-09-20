/**
 * Recorrido guiado del puesto de mando para quien no ha visto la plataforma: un jurado, un mando
 * de Protección Civil. No es una visita a la interfaz ni una demo que se ve pasar: es una demo
 * que el visitante HACE con su mano. El recorrido le dice qué hacer, le marca en el mapa dónde
 * (un círculo azul), espera a que lo haga y avanza solo cuando el sistema registra la acción.
 *
 * Dos casos, seguidos, sobre el mismo grupo de veinte casas:
 *   1. Rodearlas, llamarlas, encontrar a la que no descuelga, y escalar a fuerzas de seguridad
 *      (HappyRobot ejecuta el run y despega el helicóptero).
 *   2. Mientras las demás van andando a su refugio, pintar un frente sobre su camino y ver cómo
 *      HappyRobot las para, recalcula y las gira hacia otro refugio.
 *
 * Los pasos `handsOn` dejan pasar el puntero a través del velo: el visitante dibuja, hace clic y
 * pulsa botones de la interfaz real. Su botón «Siguiente» se desbloquea cuando la acción está
 * hecha; hasta entonces la línea en directo le dice qué falta.
 */
import type { DriveStep, PopoverDOM } from 'driver.js'

export const TOUR_STORAGE_KEY = 'vigia-tour-seen'

export type TourPanel = 'people' | 'cop' | 'centers' | 'alerts' | 'campaign' | null

/** Qué marca azul se pinta sobre el mapa mientras el paso está en pantalla. */
export type TourHintKind = 'group' | 'draw' | 'person' | 'walkers' | 'paint'

/** La marca resuelta sobre el mapa: dónde, qué tamaño y qué dice. La calcula el puesto de mando. */
export type TourHint = { kind: TourHintKind; lng: number; lat: number; radiusM: number; label: string }

/** Lo que tiene que estar a la vista para que el paso tenga anclaje. */
export type TourView = {
  panel?: TourPanel
  /** Abre la ficha de la casa que no descuelga. */
  person?: boolean
  /** Abre la tarjeta «Qué hace HappyRobot». */
  happyRobot?: boolean
  /** Encuadra el mapa: el fuego, el grupo guiado, o el grupo con su refugio y su camino. */
  focus?: 'fire' | 'group' | 'route'
  hint?: TourHintKind
  /** El visitante tiene que hacer algo: el velo deja pasar el puntero y «Siguiente» espera a que lo haga. */
  handsOn?: boolean
}

/** Lo que el recorrido lee del puesto de mando cada medio segundo. */
export type TourTick = {
  /** Línea en directo bajo el texto: qué está pasando o qué falta. */
  live: string | null
  /** La acción del paso está hecha (solo tiene sentido en pasos `handsOn`). */
  done?: boolean
}

export type DemoTourActions = {
  open: (view: TourView) => void
  close: () => void
  tick: (stepId: string) => TourTick
}

export type DemoTourStep = {
  id: string
  element: string
  side: 'top' | 'right' | 'bottom' | 'left'
  title: string
  /** Una o dos frases. Lo que no cabe aquí, no va. */
  description: string
  /** Lo que el visitante tiene que hacer, en imperativo. Se pinta como instrucción destacada. */
  task?: string
  /** Imágenes que acompañan al paso (ruta pública y texto alternativo). */
  media?: { src: string; alt: string; wide?: boolean }[]
  view: TourView
}

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'situacion', element: '[data-demo="tour-fire"]', side: 'left', view: { focus: 'fire' },
    title: 'El fuego',
    description: 'La mancha arde ya. Los anillos, hasta dónde llega en una hora con este viento.',
  },
  {
    id: 'grupo', element: '[data-demo="tour-hint"]', side: 'left', view: { focus: 'group', hint: 'group' },
    title: 'Veinte casas a favor del viento',
    description: 'Nadie las ha avisado. Su refugio es el PE-02, al sureste.',
  },
  {
    id: 'dibuja', element: '[data-demo="tour-hint"]', side: 'left', view: { focus: 'group', hint: 'draw', handsOn: true },
    title: 'Rodéalas',
    description: 'Todo el que caiga dentro recibe la llamada.',
    task: 'Pulsa «Zona» arriba a la derecha y arrastra sobre el círculo azul.',
  },
  {
    id: 'llama', element: '[data-demo="campaign-primary"]', side: 'top', view: { handsOn: true },
    title: 'Llama a las veinte a la vez',
    description: 'Cada punto suena y cambia de color. La que no descuelga se queda en rojo.',
    task: 'Pulsa «Llamar · demo».',
  },
  {
    id: 'motor', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true },
    title: 'Dentro de cada llamada',
    description: 'Voz, datos extraídos, SMS con la ruta y vuelta al mapa. El nodo encendido es lo que pasa ahora.',
  },
  {
    id: 'roja', element: '[data-demo="tour-hint"]', side: 'left', view: { focus: 'group', hint: 'person', handsOn: true },
    title: 'Una casa en rojo',
    description: 'Angustias, 84 años, sola. Dos intentos, nadie contesta.',
    task: 'Haz clic en el punto rojo.',
  },
  {
    id: 'escala', element: '[data-demo="escalate-person"]', side: 'left', view: { person: true, handsOn: true },
    title: 'Manda a alguien a su puerta',
    description: 'Tú apruebas. HappyRobot hace el resto.',
    task: 'Pulsa «Enviar fuerzas de seguridad».',
  },
  {
    id: 'run', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true },
    title: 'Once nodos y un helicóptero',
    description: 'Lee quién falta y qué flota hay, arma rutas y llama a cada conductor. Al acabar, mira el mapa.',
  },
  {
    id: 'camino', element: '[data-demo="tour-hint"]', side: 'left', view: { focus: 'route', hint: 'walkers' },
    title: 'Las otras diecinueve van andando',
    description: 'Cada punto, su ruta desde su puerta hasta el PE-02.',
  },
  {
    id: 'pinta', element: '[data-demo="tour-hint"]', side: 'left', view: { focus: 'route', hint: 'paint', handsOn: true },
    title: 'Pinta fuego sobre su camino',
    description: 'Fuego que aún no arde. El sistema lo trata como si ya lo hiciera.',
    task: 'Pulsa «Frente» arriba a la derecha y dibuja sobre la zona azul.',
  },
  {
    id: 'rerruta', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true },
    title: 'Se paran, y giran',
    description: 'Recalcula desde donde están, no desde casa, y avisa a cada uno. Mira los puntos.',
  },
  {
    id: 'contraste', element: '[data-demo="tour-fire"]', side: 'left', view: { focus: 'fire' },
    title: 'Un problema que sí ocurre',
    description: 'Inés Galindo Jiménez, del Departamento de Riesgos Geológicos y Cambio Climático (CSIC-IGME), nos ayudó a dar con la idea: saber quién hay en cada casa y guiar persona a persona.',
    media: [
      { src: '/ines/ines-1.webp', alt: 'Inés Galindo Jiménez' },
      { src: '/ines/ines-2.jpg', alt: 'Inés Galindo en el campo, frente a una colada de lava' },
      { src: '/ines/logo.webp', alt: 'Gobierno de España · CSIC · IGME', wide: true },
    ],
  },
  {
    id: 'fin', element: '[data-demo="tool-area"]', side: 'bottom', view: {},
    title: 'Ahora tú',
    description: 'Rodea la ETSIT, gira el viento, envía un medio. Todo sigue vivo.',
  },
]

export const TOUR_INTRO = {
  title: 'Guía tú la evacuación',
  checklist: [
    'Llama a veinte casas. Una no descuelga: mándale un helicóptero.',
    'Pinta fuego sobre el camino de las demás y mira cómo giran.',
  ],
  primary: 'Empezar',
  secondary: 'Explorar por mi cuenta',
  replay: 'Ver recorrido',
}

/** Cuánto espera el recorrido, con la acción ya hecha, antes de pasar solo al paso siguiente. */
const ADVANCE_DELAY_MS = 1400

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
  document.body.classList.remove('tour-hands-on')
}

/**
 * La tarjeta se puede arrastrar (por cualquier zona que no sea un botón o un enlace) para apartarla
 * de lo que tape. El desplazamiento se guarda como `transform`, porque Driver recoloca la tarjeta con
 * `left`/`top` en cada refresco y así el arrastre sobrevive. Se reinicia al cambiar de paso.
 */
let dragOffset = { x: 0, y: 0 }

function applyDragOffset(popover: HTMLElement) {
  const moved = dragOffset.x !== 0 || dragOffset.y !== 0
  popover.style.transform = moved ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : ''
  popover.classList.toggle('is-dragged', moved)
}

function makeDraggable(popover: HTMLElement) {
  if (popover.dataset.draggable) return
  popover.dataset.draggable = '1'
  popover.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('button, a, input, img')) return
    const startX = event.clientX - dragOffset.x
    const startY = event.clientY - dragOffset.y
    popover.classList.add('is-dragging')
    const move = (e: PointerEvent) => {
      dragOffset = { x: e.clientX - startX, y: e.clientY - startY }
      applyDragOffset(popover)
    }
    const up = () => {
      popover.classList.remove('is-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    event.preventDefault()
  })
}

function decoratePopover(popover: PopoverDOM, step: DemoTourStep, index: number, total: number, tick: TourTick) {
  popover.closeButton.setAttribute('aria-label', 'Cerrar recorrido')
  for (const selector of ['.tour-task', '.tour-live', '.tour-progress', '.tour-media']) popover.wrapper.querySelector(selector)?.remove()
  makeDraggable(popover.wrapper)
  applyDragOffset(popover.wrapper)

  const progress = document.createElement('div')
  progress.className = 'tour-progress'
  progress.setAttribute('aria-hidden', 'true')
  const bar = document.createElement('span')
  bar.style.width = `${Math.round(((index + 1) / total) * 100)}%`
  progress.appendChild(bar)
  popover.wrapper.prepend(progress)

  if (step.media?.length) {
    const media = document.createElement('div')
    media.className = 'tour-media'
    for (const item of step.media) {
      const img = document.createElement('img')
      img.src = item.src
      img.alt = item.alt
      img.loading = 'eager'
      img.draggable = false
      if (item.wide) img.className = 'is-wide'
      media.appendChild(img)
    }
    popover.title.before(media)
  }

  if (step.task) {
    const task = document.createElement('p')
    task.className = 'tour-task'
    task.textContent = step.task
    popover.description.after(task)
  }

  const liveLine = document.createElement('p')
  liveLine.className = 'tour-live'
  liveLine.setAttribute('role', 'status')
  applyTick(liveLine, popover, step, tick)
  ;(popover.wrapper.querySelector('.tour-task') ?? popover.description).after(liveLine)
}

/** Refresca la línea en directo y el botón «Siguiente» con lo último que dice el puesto de mando. */
function applyTick(line: HTMLElement, popover: PopoverDOM, step: DemoTourStep, tick: TourTick) {
  const text = tick.done && step.view.handsOn ? `Hecho. ${tick.live ?? ''}`.trim() : tick.live ?? ''
  line.hidden = !text
  if (line.textContent !== text) line.textContent = text
  line.classList.toggle('is-done', Boolean(tick.done))
  if (step.view.handsOn) {
    popover.nextButton.disabled = !tick.done
    popover.nextButton.title = tick.done ? '' : 'Haz lo que dice el paso para seguir'
  }
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
  let advanceTimer = 0
  const stopLive = () => {
    if (liveTimer) window.clearInterval(liveTimer)
    if (advanceTimer) window.clearTimeout(advanceTimer)
    liveTimer = 0
    advanceTimer = 0
  }

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
    // El visitante tiene que poder pulsar lo que el recorrido señala.
    disableActiveInteraction: false,
    // Cada paso prepara su propia vista, así que un anclaje que falte es un error nuestro,
    // no algo que saltar en silencio. Driver espera a que React lo pinte.
    skipMissingElement: false,
    waitForElement: 3000,
    showProgress: false,
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: 'Explorar',
    popoverClass: 'vigia-tour',
    onNextClick: (_element, _step, { state }) => {
      const index = state.activeIndex ?? 0
      // En un paso de manos, «Siguiente» solo vale con la acción hecha (el botón va deshabilitado, pero la flecha del teclado no).
      if (DEMO_TOUR_STEPS[index]?.view.handsOn && !actions.tick(DEMO_TOUR_STEPS[index].id).done) return
      const next = index + 1
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
      document.body.classList.remove('tour-hands-on')
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
    dragOffset = { x: 0, y: 0 }
    const step = DEMO_TOUR_STEPS[index]
    document.body.classList.toggle('tour-hands-on', Boolean(step.view.handsOn))
    actions.open(step.view)
    // Los anclajes de dentro de un panel pueden estar al final de una lista con scroll.
    document.querySelector(step.element)?.scrollIntoView({ block: 'center', behavior: 'instant' })
    tour.drive(index)
    // Mientras el paso está en pantalla: la línea en directo se refresca, el foco se recoloca si el
    // anclaje se mueve (el mapa se desplaza, la tarjeta crece) y, hecha la acción, se avanza solo.
    let lastRect = ''
    let advancing = false
    liveTimer = window.setInterval(() => {
      if (!tour.isActive() || tour.getActiveIndex() !== index) { stopLive(); return }
      const tick = actions.tick(step.id)
      const popover = tour.getActiveStep() && document.querySelector<HTMLElement>('.vigia-tour')
      const line = popover?.querySelector<HTMLElement>('.tour-live')
      const next = popover?.querySelector<HTMLButtonElement>('.driver-popover-next-btn')
      if (line && next) applyTick(line, { nextButton: next } as PopoverDOM, step, tick)
      if (step.view.handsOn && tick.done && !advancing && index < last) {
        advancing = true
        advanceTimer = window.setTimeout(() => { if (tour.isActive() && tour.getActiveIndex() === index) showStep(index + 1) }, ADVANCE_DELAY_MS)
      }
      const box = document.querySelector(step.element)?.getBoundingClientRect()
      const rect = box ? [box.x, box.y, box.width, box.height].map(Math.round).join(',') : ''
      if (rect && rect !== lastRect) { lastRect = rect; tour.refresh() }
    }, 500)
  }

  activeTour = tour
  showStep(0)
}
