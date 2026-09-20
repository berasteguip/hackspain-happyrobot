const KEY = 'router.mapboxToken'

/**
 * Token público de Mapbox que viaja dentro del código para que cualquiera pueda abrir la
 * plataforma sin pegar nada. Lo decidió `main` (5375a2d) y esta rama lo respeta.
 *
 * Un `pk.` es público por diseño —acaba en el JavaScript de la página se escriba donde se
 * escriba—, pero al estar aquí queda además en el historial de git: si algún día hay que
 * retirarlo no basta con borrar la línea, hay que rotarlo en Mapbox. Se protege
 * restringiéndolo por URL en su panel, no escondiéndolo.
 */
const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoiYWxsYW5iZWVzIiwiYSI6ImNtdTdtZHRuMjBuYTQyenM5M2NyNDNkNDgifQ.hhZnRDaNxZopHSZSvLYqAA'

export function readMapboxToken() {
  const env = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (env && env.trim()) return env.trim()
  return DEFAULT_MAPBOX_TOKEN
}

/**
 * Nadie lee ya lo que se guarda aquí: `readMapboxToken` devuelve el token de arriba antes
 * de mirar el navegador, así que la pantalla que lo pide no llega a salir. Se deja por si
 * se recupera esa vía.
 */
export function saveMapboxToken(token: string) {
  localStorage.setItem(KEY, token.trim())
}
