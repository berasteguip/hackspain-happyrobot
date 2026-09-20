/**
 * Quién soy en este navegador: la persona registrada desde el enlace. Sirve para que la
 * pestaña del mapa abierta con `?p=<id>` sepa que debe emitir el GPS de este dispositivo.
 */

const KEY = 'router.me'

export type Me = { id: string; phone: string }

export function readMe(): Me | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Me>
    return typeof parsed.id === 'string' && parsed.id ? { id: parsed.id, phone: typeof parsed.phone === 'string' ? parsed.phone : '' } : null
  } catch {
    return null
  }
}

export function saveMe(me: Me) {
  try {
    localStorage.setItem(KEY, JSON.stringify(me))
  } catch {
    // sin almacenamiento: la sesión vive solo en esta pestaña
  }
}

/** El `?p=` de la URL: la persona en la que debe arrancar el mapa. */
export function focusPersonFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('p')
  } catch {
    return null
  }
}
