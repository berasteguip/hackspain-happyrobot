import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

import type { LocationPing as Ping } from './src/types.js'

const pings = new Map<string, Ping>()

// La API de crisis (`api/`, FastAPI) en local. Con ella levantada, el censo, las llamadas y
// las posiciones salen de ahí; si está caída, el mapa sigue en su modo autocontenido.
const CRISIS_API = process.env.VITE_CRISIS_API ?? 'http://127.0.0.1:8000'
const CRISIS_PATHS = ['/api', '/calls', '/positions', '/people', '/instructions', '/health', '/state', '/gps', '/events']

function locationApi(): Plugin {
  return {
    name: 'vigia-location-api',
    configureServer(server) {
      if (CRISIS_API) return
      server.middlewares.use('/api/locations', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify([...pings.values()]))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk) => chunks.push(chunk as Buffer))
          req.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<Ping>
              if (
                typeof data.id !== 'string' || !data.id.trim() || data.id.length > 100 ||
                typeof data.lng !== 'number' || !Number.isFinite(data.lng) || Math.abs(data.lng) > 180 ||
                typeof data.lat !== 'number' || !Number.isFinite(data.lat) || Math.abs(data.lat) > 90 ||
                (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 150)) ||
                (data.source !== undefined && !['gps', 'simulation', 'unknown'].includes(data.source)) ||
                (data.accuracyM !== undefined && (typeof data.accuracyM !== 'number' || !Number.isFinite(data.accuracyM) || data.accuracyM < 0))
              ) {
                res.statusCode = 400
                res.end(JSON.stringify({ ok: false, error: 'id, lng, lat required' }))
                return
              }
              const ping: Ping = {
                id: data.id,
                name: data.name ?? 'Ciudadano',
                lng: data.lng,
                lat: data.lat,
                ts: Date.now(),
                source: data.source ?? 'unknown',
                accuracyM: data.source === 'gps' ? data.accuracyM : undefined,
              }
              pings.set(ping.id, ping)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: 'invalid json' }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), locationApi()],
  server: {
    port: 5173,
    // Vite rechaza peticiones con un Host que no conoce. Sin esto, el enlace del
    // SMS abre un "Blocked request" en lugar de /track. Solo subdominios de los
    // servicios de túnel, no `true`, que abriría el dev server a DNS rebinding.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io', '.loca.lt'],
    proxy: {
      ...(CRISIS_API ? Object.fromEntries(CRISIS_PATHS.map(path => [path, { target: CRISIS_API, changeOrigin: true }])) : {}),
      '/firms': {
        target: 'https://firms.modaps.eosdis.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/firms/, ''),
      },
    },
  },
})
