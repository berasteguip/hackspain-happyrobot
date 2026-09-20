import type { DriveStep, PopoverDOM } from 'driver.js'

export const TOUR_STORAGE_KEY = 'vigia-tour-seen'

export type DemoTourPanel = 'people' | 'person' | 'cop' | 'centers' | 'alerts' | 'campaign' | null

export type DemoTourActions = {
  open: (panel: DemoTourPanel) => void
  close: () => void
}

export type DemoTourStep = {
  id: string
  kicker: string
  element: string
  panel?: DemoTourPanel
  side?: 'top' | 'right' | 'bottom' | 'left'
  title: string
  description: string
  actions?: string[]
}

/** Abrimos cada vista antes de que Driver mida su anclaje. No ejecutamos operaciones. */
export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'context', kicker: 'Situación', element: '[data-tour="cop-strip"]', side: 'bottom',
    title: '¿Cuántas personas quedan por atender?',
    description: 'El censo, las llamadas sin respuesta y las personas a menos de 20 minutos del frente se actualizan con el escenario. El mapa reúne sus posiciones, el incendio y los puntos de encuentro.',
  },
  {
    id: 'campaign', kicker: 'Llamadas', panel: 'campaign', element: '[data-tour="tour-panel"]', side: 'left',
    title: 'Llamar a las personas de una zona',
    description: 'Dibuja un círculo para elegir a quién contactar. Esta pestaña simula las respuestas y el inicio de la evacuación. Para llamar con HappyRobot, cambia a «Operación real».',
    actions: ['Los datos y las campañas de ambos modos se mantienen separados.'],
  },
  {
    id: 'people', kicker: 'Prioridad', panel: 'people', element: '[data-tour="tour-panel"]', side: 'left',
    title: 'Atender primero a quien tiene menos tiempo',
    description: 'La lista se ordena por los minutos estimados hasta que llega el frente. Cuando una llamada queda sin respuesta, su casa aparece en una lista desde la que se puede enviar una patrulla de demo.',
  },
  {
    id: 'person', kicker: 'Seguimiento', panel: 'person', element: '[data-tour="tour-panel"]', side: 'left',
    title: 'Saber qué le ocurre a cada persona',
    description: 'La ficha muestra el contacto, la última llamada y el origen de su ubicación. Una referencia residencial, una posición simulada y un GPS compartido se distinguen aquí. También puedes asignar una ambulancia, patrulla o bomberos de demo.',
  },
  {
    id: 'routes', kicker: 'Evacuación', panel: 'person', element: '[data-tour="routes"]', side: 'left',
    title: 'Comparar salidas desde su posición',
    description: 'Consulta rutas en vehículo o a pie hacia los puntos de encuentro. Vigía descarta las alternativas que atraviesan la proyección del fuego. Si ninguna sirve, la persona queda pendiente de revisión.',
    actions: ['La consulta se inicia con «Comparar rutas · Mapbox».'],
  },
  {
    id: 'response', kicker: 'Coordinación', panel: 'centers', element: '[data-tour="tour-panel"]', side: 'left',
    title: 'Preparar el aviso al centro adecuado',
    description: 'Hospitales, centros de salud y parques de bomberos tienen su ficha. Selecciona uno para preparar un preaviso sanitario o una solicitud de apoyo. La bandeja conserva los avisos de demo.',
  },
  {
    id: 'alerts', kicker: 'Medios', panel: 'alerts', element: '[data-tour="tour-panel"]', side: 'left',
    title: 'Revisar incidencias y seguir los medios',
    description: 'Aquí aparecen los avisos del escenario y las unidades enviadas. Cada incidencia permite revisar la situación o asignar un medio de demo; su desplazamiento se representa en el mapa.',
  },
  {
    id: 'wind', kicker: 'Cambio de situación', panel: 'cop', element: '[data-tour="fire-sim"]', side: 'left',
    title: 'Comprobar qué cambia cuando avanza el fuego',
    description: '«Avanzar» mueve el frente simulado; el giro de viento cambia su dirección. Vigía vuelve a evaluar personas, puntos de encuentro y rutas, y muestra los cambios del plan.',
  },
  {
    id: 'decisions', kicker: 'Evacuación conjunta', panel: 'cop', element: '[data-tour="decision-board"]', side: 'left',
    title: 'Ver grupos de evacuación y sectores pendientes',
    description: 'Los convoyes agrupan personas del mismo núcleo que ya están localizadas o en tránsito. Los sectores ordenan dónde sigue habiendo personas fuera de un punto de encuentro. Son propuestas de demo para revisar desde el puesto de mando.',
  },
  {
    id: 'explore', kicker: 'Prueba el escenario', element: '[data-tour="campaign"]', side: 'top',
    title: 'Empieza por una zona de llamadas',
    description: 'Dibuja una zona o pulsa «Iniciar simulación». Sigue las respuestas, abre una ficha y después avanza el fuego desde «Fuego y evacuación».',
    actions: ['Puedes volver a esta guía desde «Ver recorrido».'],
  },
]

export const TOUR_INTRO = {
  kicker: 'Vigía · Gestión de emergencias',
  title: 'Cómo coordinar una evacuación',
  lede: 'Vigía reúne llamadas de HappyRobot, ubicación de personas y evolución del incendio en un puesto de mando.',
  checklist: ['Contactar con las personas de una zona', 'Revisar quién necesita ayuda y por dónde salir', 'Actualizar el plan cuando cambia el incendio'],
  primary: 'Ver cómo funciona',
  secondary: 'Explorar el mapa',
  replay: 'Ver recorrido',
}

let activeTour: { isActive: () => boolean; destroy: () => void } | null = null

export function stopDemoTour() {
  if (activeTour?.isActive()) activeTour.destroy()
}

export function shouldAutoStartTour(): boolean {
  if (typeof window === 'undefined') return false
  const forced = new URLSearchParams(window.location.search).get('guia') === '1'
  if (forced) return true
  try { return !window.localStorage.getItem(TOUR_STORAGE_KEY) } catch { return true }
}

export function markTourSeen(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(TOUR_STORAGE_KEY, '1') } catch { /* La guía funciona sin almacenamiento. */ }
}

function decoratePopover(popover: PopoverDOM, step: DemoTourStep, index: number) {
  popover.closeButton.setAttribute('aria-label', 'Cerrar recorrido')
  popover.wrapper.querySelector('.tour-kicker')?.remove()
  popover.wrapper.querySelector('.tour-actions')?.remove()

  const kicker = document.createElement('p')
  kicker.className = 'tour-kicker'
  kicker.textContent = `Paso ${index + 1} · ${step.kicker}`
  popover.title.before(kicker)

  if (step.actions?.length) {
    const list = document.createElement('ul')
    list.className = 'tour-actions'
    for (const item of step.actions) {
      const li = document.createElement('li')
      li.textContent = item
      list.appendChild(li)
    }
    popover.description.after(list)
  }
}

export async function startDemoTour(actions: DemoTourActions): Promise<void> {
  if (typeof window === 'undefined') return
  if (activeTour?.isActive()) activeTour.destroy()

  const [{ driver }] = await Promise.all([
    import('driver.js'),
    import('driver.js/dist/driver.css'),
  ])

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const tour = driver({
    animate: !reduceMotion,
    smoothScroll: false,
    overlayColor: '#0b1012',
    overlayOpacity: 0.35,
    stagePadding: 10,
    stageRadius: 12,
    popoverOffset: 14,
    allowClose: true,
    overlayClickBehavior: () => undefined,
    disableActiveInteraction: true,
    skipMissingElement: false,
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: 'Explorar el mapa',
    popoverClass: 'vigia-tour',
    onNextClick: (_element, _step, { state }) => {
      const next = (state.activeIndex ?? 0) + 1
      if (next >= DEMO_TOUR_STEPS.length) tour.destroy()
      else showStep(next)
    },
    onPrevClick: (_element, _step, { state }) => showStep(Math.max(0, (state.activeIndex ?? 0) - 1)),
    onPopoverRender: (popover, { state }) => {
      const index = state.activeIndex ?? 0
      const step = DEMO_TOUR_STEPS[index]
      if (step) decoratePopover(popover, step, index)
    },
    onDestroyed: () => {
      markTourSeen()
      actions.close()
      window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.tour-replay')?.focus())
      if (activeTour === tour) activeTour = null
    },
    steps: DEMO_TOUR_STEPS.map((step): DriveStep => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? 'bottom',
        align: 'start',
      },
    })),
  })

  function showStep(index: number) {
    const step = DEMO_TOUR_STEPS[index]
    actions.open(step.panel ?? null)
    // Los anclajes internos pueden estar al final de un panel con scroll.
    document.querySelector(step.element)?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    tour.drive(index)
  }

  activeTour = tour
  showStep(0)
}
