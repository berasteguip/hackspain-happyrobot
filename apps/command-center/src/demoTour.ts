/**
 * Recorrido guiado del puesto de mando, pensado para que alguien que no ha visto la
 * plataforma (un jurado, un mando de Protección Civil) entienda en dos minutos qué hace
 * router y por qué. Cada paso abre la vista que explica (panel, ficha, tarjeta de
 * HappyRobot) antes de que Driver mida el anclaje; no ejecuta ninguna operación: no
 * llama, no mueve el fuego, no envía medios. Eso se lo dejamos al visitante al final.
 *
 * El orden sigue la historia del producto: situación, personas, llamar, qué hace
 * HappyRobot por debajo, priorizar, seguir a una persona, rutas, escalada, cambio de
 * escenario, plan, coordinación. Es la misma escalera que la rúbrica del reto.
 */
import type { DriveStep, PopoverDOM } from 'driver.js'

export const TOUR_STORAGE_KEY = 'vigia-tour-seen'

export type TourPanel = 'people' | 'cop' | 'centers' | 'alerts' | 'campaign' | null

/** Lo que tiene que estar a la vista para que el paso tenga anclaje. */
export type TourView = {
  panel?: TourPanel
  /** Abre la ficha de una persona (la seleccionada o la primera de la cola). */
  person?: boolean
  /** Abre la tarjeta «Qué hace HappyRobot». */
  happyRobot?: boolean
}

export type DemoTourActions = {
  open: (view: TourView) => void
  close: () => void
}

export type DemoTourStep = {
  id: string
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
    description: 'La mancha es el frente activo. Los anillos dicen hasta dónde puede llegar en una hora con este viento. Todo lo que decide router sale de esa proyección, no de un perímetro oficial que llega tarde.',
  },
  {
    id: 'personas', kicker: 'Personas', element: '[data-demo="tour-people"]', side: 'left', view: {},
    title: 'Cada punto es una persona con teléfono',
    description: 'Sabemos dónde vive cada una. Cuando contesta, el punto cambia según cómo está: informada, en camino, a salvo. Si nadie descuelga, se pone en rojo. El mando ve a la gente, no solo el humo.',
  },
  {
    id: 'llamar', kicker: 'Primera acción', element: '[data-demo="campaign-dock"]', side: 'top', view: {},
    title: 'Llamar a toda una zona de un gesto',
    description: 'router recomienda la zona de riesgo según el viento. Al pulsar, HappyRobot llama a cada casa a la vez: trescientas conversaciones, una por persona, y cada una acaba en un dato. En esta demo las llamadas suenan simuladas.',
    actions: ['Con «Zona» puedes dibujar tu propio círculo en el mapa.'],
  },
  {
    id: 'happyrobot', kicker: 'Motor', element: '[data-demo="hr-card"]', side: 'left', view: { happyRobot: true },
    title: 'Qué hace HappyRobot por debajo',
    description: 'Esta tarjeta enseña el workflow real: llamada de voz, extracción de datos, SMS con la ruta y el enlace de ubicación, y el webhook que devuelve todo a nuestro estado de crisis. El nodo activo se ilumina en cada llamada.',
  },
  {
    id: 'cola', kicker: 'Prioridad', element: '[data-demo="panel"]', side: 'left', view: { panel: 'people' },
    title: 'Quién va primero',
    description: 'Cuando todo es urgente, la cola dice por dónde empezar: fuera del núcleo, sin respuesta, ruta en revisión. Se busca por nombre, localidad o casa, y se entra en cualquier ficha de un clic.',
  },
  {
    id: 'ficha', kicker: 'Seguimiento', element: '[data-demo="panel"]', side: 'left', view: { person: true },
    title: 'Una ficha por persona',
    description: 'Contacto, última llamada y de dónde sale su ubicación: censo, posición simulada o GPS compartido desde el enlace del SMS. Aquí se ve qué le ha pasado y qué medio se le ha enviado.',
  },
  {
    id: 'rutas', kicker: 'Evacuación', element: '[data-demo="route-compare"]', side: 'left', view: { person: true },
    title: 'Rutas que no cruzan el fuego',
    description: 'Comparar rutas pide a Mapbox las salidas a pie y en coche hacia cada refugio y descarta las que atraviesan la proyección del frente. Si el viento gira, se recalcula desde donde está la persona, no desde su casa.',
  },
  {
    id: 'escalada', kicker: 'Escalada', element: '[data-demo="person-dispatch"]', side: 'left', view: { person: true },
    title: 'Si nadie descuelga, router no espera',
    description: 'Desde la ficha se envía ambulancia, patrulla o bomberos. A las casas en rojo les aparece «Enviar fuerzas de seguridad»: HappyRobot rellama, avisa a Guardia Civil y 1-1-2 y despega el helicóptero. Un operador aprueba; siempre.',
  },
  {
    id: 'fuego', kicker: 'Cambio de situación', element: '[data-demo="fire-wind-shift"]', side: 'left', view: { panel: 'cop' },
    title: 'El escenario se mueve debajo del plan',
    description: '«Avanzar» mueve el frente; «Girar a NE» cambia el viento. router vuelve a evaluar personas, refugios y rutas, y avisa de lo que ya no vale. Es la prueba de que no gestiona un caso fijo.',
  },
  {
    id: 'plan', kicker: 'Plan operativo', element: '[data-demo="panel"]', side: 'left', view: { panel: 'alerts' },
    title: 'Cuándo tirar el plan',
    description: 'Aquí se ve si el plan sigue vigente o se ha quedado viejo por el viento o una carretera cortada, cuál es la siguiente acción concreta y qué medios están en marcha. Nada se ejecuta sin que alguien lo adopte.',
  },
  {
    id: 'centros', kicker: 'Coordinación', element: '[data-demo="panel"]', side: 'left', view: { panel: 'centers' },
    title: 'Avisar al centro adecuado',
    description: 'Hospitales, centros de salud y parques de bomberos con su ficha. Preaviso sanitario o petición de apoyo en dos clics. El vecino, el bombero y el responsable no reciben el mismo mensaje.',
  },
  {
    id: 'empieza', kicker: 'Tu turno', element: '[data-demo="campaign-primary"]', side: 'top', view: {},
    title: 'Empieza por la zona de riesgo',
    description: 'Pulsa «Llamar zona de riesgo» y mira cómo cambian los puntos. Abre una ficha en rojo y envía las fuerzas. Luego gira el viento en Propagación y comprueba qué pasa con el plan.',
    actions: ['Puedes volver a esta guía en cualquier momento desde «Ver recorrido».'],
  },
]

export const TOUR_INTRO = {
  kicker: 'router · puesto de mando',
  title: 'Cómo se guía una evacuación, persona a persona',
  lede: 'router junta las llamadas de HappyRobot, la posición de cada vecino y la evolución del incendio en una sola pantalla. En dos minutos ves qué hace y dónde intervienes tú.',
  checklist: [
    'Llamar a todas las casas de una zona a la vez',
    'Ver quién no contesta y escalar a las fuerzas de seguridad',
    'Recalcular rutas y plan cuando el fuego cambia',
  ],
  primary: 'Ver recorrido · 2 min',
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

function decoratePopover(popover: PopoverDOM, step: DemoTourStep, index: number) {
  popover.closeButton.setAttribute('aria-label', 'Cerrar recorrido')
  popover.wrapper.querySelector('.tour-kicker')?.remove()
  popover.wrapper.querySelector('.tour-actions')?.remove()

  const kicker = document.createElement('p')
  kicker.className = 'tour-kicker'
  kicker.textContent = `${index + 1} · ${step.kicker}`
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

export async function startDemoTour(actions: DemoTourActions) {
  if (typeof window === 'undefined') return
  const generation = ++tourGeneration
  if (activeTour?.isActive()) activeTour.destroy()
  activeTour = null
  const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')])
  if (generation !== tourGeneration) return

  const last = DEMO_TOUR_STEPS.length - 1
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
    doneBtnText: 'Empezar',
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
      if (step) decoratePopover(popover, step, index)
    },
    onDestroyed: () => {
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
    const step = DEMO_TOUR_STEPS[index]
    actions.open(step.view)
    // Los anclajes de dentro de un panel pueden estar al final de una lista con scroll.
    document.querySelector(step.element)?.scrollIntoView({ block: 'center', behavior: 'instant' })
    tour.drive(index)
  }

  activeTour = tour
  showStep(0)
}
