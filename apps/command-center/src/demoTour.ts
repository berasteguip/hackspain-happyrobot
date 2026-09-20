/**
 * Recorrido corto del puesto de mando. Señala solo lo que ya está a la vista:
 * escenario, herramientas, barra de llamadas y Plan. No abre paneles ni lanza
 * la campaña: alguien que no ha visto la plataforma tiene que poder seguirlo.
 */
import type { DriveStep, PopoverDOM } from 'driver.js'

export const TOUR_STORAGE_KEY = 'vigia-tour-seen'

export type TourStep = {
  element: string
  side: 'top' | 'right' | 'bottom' | 'left'
  kicker: string
  title: string
  description: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    element: '[data-demo="tour-fire"]',
    side: 'right',
    kicker: '1 · Fuego',
    title: 'La mancha naranja es el incendio',
    description: 'Los círculos de puntos dicen a quién avisar: el interior (rojo) es zona de riesgo ahora; el exterior (amarillo), hasta dónde puede llegar en una hora. No es un perímetro oficial.',
  },
  {
    element: '[data-demo="tour-people"]',
    side: 'left',
    kicker: '2 · Personas',
    title: 'Cada punto azul es una persona',
    description: 'Todavía no se las ha llamado. Cuando contestan, el punto cambia de color según cómo están. Las tiendas ⛺ son puntos de encuentro.',
  },
  {
    element: '[data-demo="tools"]',
    side: 'bottom',
    kicker: '3 · Paneles',
    title: 'Cada botón abre un panel',
    description: 'Propagación, Personas o Capas. El panel sale a la derecha, encima del mapa, y se cierra con la X. No cambia nada: solo enseña más detalle.',
  },
  {
    element: '[data-demo="campaign-dock"]',
    side: 'top',
    kicker: '4 · Primera acción',
    title: 'Llama a quien está en riesgo',
    description: 'Abajo está la zona recomendada. Pulsa «Llamar zona de riesgo»: en demo suenan llamadas simuladas y el mapa se pone en marcha solo.',
  },
  {
    element: '[data-demo="tool-alerts"]',
    side: 'bottom',
    kicker: '5 · Si te pierdes',
    title: 'Abre Plan',
    description: 'Resume la prioridad, a quién avisar y si hay que tirar el plan — por ejemplo, si giras el viento en Propagación.',
  },
]

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

function decoratePopover(popover: PopoverDOM, step: TourStep) {
  popover.closeButton.setAttribute('aria-label', 'Cerrar guía')
  const kicker = document.createElement('p')
  kicker.className = 'tour-kicker'
  kicker.textContent = step.kicker
  popover.title.before(kicker)
}

export async function startDemoTour(onDone?: () => void) {
  const generation = ++tourGeneration
  if (activeTour?.isActive()) activeTour.destroy()
  activeTour = null
  const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')])
  if (generation !== tourGeneration) return
  const tour = driver({
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    overlayColor: '#0b1012',
    overlayOpacity: 0.42,
    stagePadding: 10,
    stageRadius: 12,
    popoverOffset: 14,
    allowClose: true,
    overlayClickBehavior: 'nextStep',
    disableActiveInteraction: true,
    skipMissingElement: true,
    waitForElement: 4000,
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: 'Empezar',
    popoverClass: 'vigia-tour',
    onPopoverRender: (popover, { state }) => {
      const step = TOUR_STEPS[state.activeIndex ?? 0]
      if (step) decoratePopover(popover, step)
    },
    onDestroyed: () => {
      if (generation !== tourGeneration) return
      markTourSeen()
      activeTour = null
      onDone?.()
    },
    steps: TOUR_STEPS.map((step): DriveStep => ({
      element: step.element,
      popover: { title: step.title, description: step.description, side: step.side, align: 'start' },
    })),
  })
  activeTour = tour
  tour.drive()
}
