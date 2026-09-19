import { useEffect, useMemo, useState } from 'react'
import { MADRID_SCENARIO } from './scenario-madrid'
import { haversineMeters, nearestZone } from './geo'

type Props = {
  presetId: string | null
}

export function CitizenTrack({ presetId }: Props) {
  const [name, setName] = useState('Ciudadano')
  const [id] = useState(() => presetId || `live-${Math.random().toString(36).slice(2, 8)}`)
  const [consented, setConsented] = useState(false)
  const [mode, setMode] = useState<'demo' | 'gps'>('demo')
  const [status, setStatus] = useState('Esperando consentimiento')
  const [pos, setPos] = useState<{ lng: number; lat: number } | null>(null)

  const nearest = useMemo(() => {
    if (!pos) return null
    return nearestZone(pos.lng, pos.lat, MADRID_SCENARIO.safeZones)
  }, [pos])

  useEffect(() => {
    if (!consented) return
    let timer: number | undefined
    let watch: number | undefined
    let cancelled = false

    const send = async (lng: number, lat: number, accuracyM?: number) => {
      if (cancelled) return
      setPos({ lng, lat })
      try {
        const response = await fetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, lng, lat, source: mode === 'gps' ? 'gps' : 'simulation', accuracyM }),
        })
        if (!response.ok) throw new Error('No se ha recibido la ubicación')
        if (!cancelled) setStatus(mode === 'gps' ? 'Ubicación del dispositivo compartida' : 'Ubicación compartida')
      } catch {
        if (!cancelled) setStatus('No se pudo enviar la ubicación. Comprueba la conexión.')
      }
    }

    if (mode === 'demo') {
      const zone = MADRID_SCENARIO.safeZones[0]
      let lng = zone.lng - 0.028
      let lat = zone.lat + 0.018
      const tick = () => {
        if (cancelled) return
        const dist = haversineMeters(lng, lat, zone.lng, zone.lat)
        if (dist > 40) {
          lng += (zone.lng - lng) * 0.04
          lat += (zone.lat - lat) * 0.04
        }
        void send(lng, lat)
        timer = window.setTimeout(tick, 1500)
      }
      tick()
    } else {
      watch = navigator.geolocation.watchPosition(
        (position) => {
          void send(position.coords.longitude, position.coords.latitude, position.coords.accuracy)
        },
        () => setStatus('No se pudo leer el GPS'),
        { enableHighAccuracy: true, maximumAge: 2000 },
      )
    }

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      if (watch !== undefined) navigator.geolocation.clearWatch(watch)
    }
  }, [consented, id, mode, name])

  return (
    <div className="citizen">
      <div className="citizen-card">
        <p className="kicker">Vigía</p>
        <h1>Compartir mi ubicación</h1>
        <p className="lede">
          Si aceptas, el visor recibirá tu ubicación mientras esta página siga abierta.
        </p>

        {!consented ? (
          <>
            <label>
              Nombre
              <input data-demo="citizen-name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <fieldset>
              <legend>Cómo aparecer en el mapa</legend>
              <label className="row">
                <input
                  type="radio"
                  data-demo="citizen-mode"
                  data-demo-id="demo"
                  checked={mode === 'demo'}
                  onChange={() => setMode('demo')}
                />
                Usar una posición de la zona
              </label>
              <label className="row">
                <input
                  type="radio"
                  data-demo="citizen-mode"
                  data-demo-id="gps"
                  checked={mode === 'gps'}
                  onChange={() => setMode('gps')}
                />
                Usar mi GPS real
              </label>
            </fieldset>
            <button type="button" data-demo="citizen-consent" onClick={() => { setStatus(mode === 'gps' ? 'Solicitando permiso de ubicación…' : 'Compartiendo ubicación…'); setConsented(true) }}>
              Consiento el seguimiento
            </button>
            <p className="fine">
              Sin consentimiento no se comparte ninguna coordenada. Id de sesión:{' '}
              <code>{id}</code>
            </p>
          </>
        ) : (
          <>
            <p className="ok">{status}</p>
            {mode === 'demo' && nearest && pos && (
              <div className="zone-hint">
                <strong>{nearest.zone.name}</strong>
                <span>{Math.round(nearest.distanceM / 10) * 10} m</span>
              </div>
            )}
            <button type="button" data-demo="citizen-stop" onClick={() => { setConsented(false); setStatus('Envío detenido') }}>Dejar de compartir</button>
            <p className="fine">Los lugares existen, pero su uso como refugios no está validado. Al detener el envío, la última posición permanece en el visor con su hora de actualización; no se enviarán posiciones nuevas.</p>
          </>
        )}
      </div>
    </div>
  )
}
