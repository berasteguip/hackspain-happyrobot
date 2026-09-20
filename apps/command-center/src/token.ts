const KEY = 'vigia.mapboxToken'
const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoiYWxsYW5iZWVzIiwiYSI6ImNtdTdtZHRuMjBuYTQyenM5M2NyNDNkNDgifQ.hhZnRDaNxZopHSZSvLYqAA'

export function readMapboxToken() {
  const env = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (env && env.trim()) return env.trim()
  return DEFAULT_MAPBOX_TOKEN
}

export function saveMapboxToken(token: string) {
  localStorage.setItem(KEY, token.trim())
}
