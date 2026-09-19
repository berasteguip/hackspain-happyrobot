const KEY = 'vigia.mapboxToken'

export function readMapboxToken() {
  const env = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (env && env.trim()) return env.trim()
  try {
    return localStorage.getItem(KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function saveMapboxToken(token: string) {
  localStorage.setItem(KEY, token.trim())
}
