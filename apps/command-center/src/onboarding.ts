/**
 * La puerta de la primera visita. Quien abre el puesto de mando por primera vez entra por
 * `/onboarding`: el recorrido guiado de siempre (`demoTour.ts`) sobre un escenario que solo existe
 * en su navegador. Al terminar —o al saltárselo— se marca la visita y se aterriza en `/`.
 *
 * Tres cosas que no se negocian, por orden de importancia:
 *
 *  1. **Quien llega con `?p=` nunca se desvía.** Es alguien que viene del SMS o de `/track` en
 *     mitad de una evacuación. El patrón es el mismo de `shouldShowTourIntro()`.
 *  2. **Siempre hay salida.** El botón de saltar está a la vista durante todo el recorrido y
 *     `?onboarding=1` lo vuelve a abrir cuando alguien quiere enseñarlo otra vez.
 *  3. **Sin almacenamiento no se desvía a nadie.** Si `localStorage` no está disponible no hay
 *     forma de recordar la visita, y desviar igualmente dejaría a alguien dando vueltas entre `/`
 *     y `/onboarding`. Se falla hacia el puesto de mando, que es lo que la persona pidió.
 */
import { markTourSeen } from './demoTour'

export const ONBOARDING_STORAGE_KEY = 'router.onboarding-seen'
export const ONBOARDING_PATH = '/onboarding'

export function isOnboardingPath(pathname: string) {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)
}

/**
 * La decisión, sin navegador de por medio para poder probarla: ¿esta URL, con esta marca de
 * visita, se manda al onboarding?
 */
export function shouldEnterOnboarding(pathname: string, search: string, seen: boolean) {
  if (isOnboardingPath(pathname)) return false
  // Solo desde la raíz: `/track` y cualquier otra página tienen su propio trabajo.
  if (pathname !== '/' && pathname !== '/index.html') return false
  const params = new URLSearchParams(search)
  // Primero, y por encima de todo lo demás: quien viene del SMS o de `/track` sigue su evacuación.
  if (params.get('p')) return false
  if (params.get('onboarding') === '1') return true
  // Quien pide la guía sobre el puesto de mando real ya sabe lo que quiere ver.
  if (params.get('guia') === '1') return false
  return !seen
}

export function shouldRedirectToOnboarding() {
  if (typeof window === 'undefined') return false
  let seen = true
  try {
    seen = Boolean(window.localStorage.getItem(ONBOARDING_STORAGE_KEY))
  } catch {
    return false
  }
  return shouldEnterOnboarding(window.location.pathname, window.location.search, seen)
}

export function markOnboardingSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
  } catch {
    /* Sin almacenamiento la visita no se recuerda, pero tampoco se desvía a nadie. */
  }
}

/**
 * Salir del onboarding: se marca la visita y se entra al puesto de mando. Se marca también el
 * recorrido como visto, porque si no `/` recibiría a quien acaba de saltárselo con la tarjeta que
 * le invita a ese mismo recorrido. Sigue disponible en «Ver recorrido» y en `?guia=1`.
 */
export function leaveOnboarding() {
  markOnboardingSeen()
  markTourSeen()
  window.location.assign('/')
}

export const ONBOARDING_COPY = {
  skip: 'Saltar e ir al puesto de mando',
  skipLabel: 'Saltar el onboarding e ir al puesto de mando',
}
