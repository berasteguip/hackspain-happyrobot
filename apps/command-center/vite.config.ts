import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

type Ping = {
  id: string
  name: string
  lng: number
  lat: number
  ts: number
}

const pings = new Map<string, Ping>()

function locationApi(): Plugin {
  return {
    name: 'vigia-location-api',
    configureServer(server) {
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
                typeof data.id !== 'string' ||
                typeof data.lng !== 'number' ||
                typeof data.lat !== 'number'
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
    proxy: {
      '/firms': {
        target: 'https://firms.modaps.eosdis.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/firms/, ''),
      },
    },
  },
})
