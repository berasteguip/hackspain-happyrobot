/**
 * Modo demo autocontenido: población, llamadas, triaje y evacuación viven en el navegador
 * (`scenario.ts` + `simulation.ts`). Sin API, sin HappyRobot, sin claves.
 *
 * Dos formas de entrar:
 * - En el build, con `VITE_DEMO_ONLY=true` en `.env` o `npm run build:demo` (toda la app).
 * - En ejecución, abriendo la URL con `?guia=1`: el recorrido guiado corre sobre el escenario
 *   sintético de `scenario-madrid.ts` (el mismo que se ve en local sin API) aunque el mismo
 *   despliegue, sin el parámetro, sirva el censo real de `/api/roster`. Así el jurado no puede
 *   disparar una llamada real desde el recorrido, y en producción no hace falta un segundo build.
 */
const GUIDE_PARAM = 'guia'
/** Alias aceptados: `?guia=1`, `?guide=1`, `?GUIDE=1`, `?demo=1`, `?tour=1` (y `true`/`on`/vacío). */
const GUIDE_ALIASES = ['guia', 'guide', 'demo', 'tour']

function readGuideMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of params) {
    if (!GUIDE_ALIASES.includes(key.toLowerCase())) continue
    const v = value.trim().toLowerCase()
    if (v === '' || v === '1' || v === 'true' || v === 'on' || v === 'yes') return true
  }
  return /(^|[#&])(guia|guide|demo|tour)(=1)?($|&)/i.test(window.location.hash)
}

/** `?guia=1` en la URL: recorrido guiado sobre el escenario sintético. */
export const GUIDE_MODE = readGuideMode()

export const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === 'true' || GUIDE_MODE

/** La URL de este mismo despliegue con el recorrido guiado activado. */
export function guideUrl(): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set(GUIDE_PARAM, '1')
  return url.toString()
}

/**
 * Sale del recorrido guiado: quita `?guia=1` y recarga, con lo que la página vuelve a su modo
 * normal (censo real de la API si la hay). No hace nada fuera del modo guía.
 */
export function exitGuideMode(): boolean {
  if (!GUIDE_MODE) return false
  const url = new URL(window.location.href)
  url.search = ''
  window.location.replace(url.toString())
  return true
}
