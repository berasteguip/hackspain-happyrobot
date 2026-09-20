const KEY = 'router.mapboxToken'

/**
 * La clave con la que se guardaba antes de que la app pasara a llamarse router.
 * Se sigue leyendo para no echar de la app a quien ya tuviera el token guardado:
 * renombrar la clave a secas le habría vuelto a pedir el token sin avisar.
 */
const KEY_ANTERIOR = 'vigia.mapboxToken'

export function readMapboxToken() {
  const env = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (env && env.trim()) return env.trim()
  try {
    return (localStorage.getItem(KEY) ?? localStorage.getItem(KEY_ANTERIOR))?.trim() || ''
  } catch {
    return ''
  }
}

export function saveMapboxToken(token: string) {
  localStorage.setItem(KEY, token.trim())
}
