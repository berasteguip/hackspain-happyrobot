import { useEffect, useMemo, useState } from 'react'
import { SAFE_ZONES } from './scenario'
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
    return nearestZone(pos.lng, pos.lat, SAFE_ZONES)
  }, [pos])

  useEffect(() => {
    if (!consented) return
    let timer: number | undefined
    let watch: number | undefined
    let cancelled = false

    const send = async (lng: number, lat: number) => {
      setPos({ lng, lat })
      await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, lng, lat }),
      })
    }

    if (mode === 'demo') {
      const zone = SAFE_ZONES[0]
      let lng = zone.lng - 0.028
      let lat = zone.lat + 0.018
      setStatus('Compartiendo ubicación de demostración')
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
      setStatus('Solicitando GPS…')
      watch = navigator.geolocation.watchPosition(
        (position) => {
          setStatus('Compartiendo GPS en vivo')
          void send(position.coords.longitude, position.coords.latitude)
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
        <p className="kicker">Protección Civil · Ávila</p>
        <h1>Aviso de incendio forestal</h1>
        <p className="lede">
          Has recibido una llamada de un agente de voz. Si consientes, el centro de
          mando verá tu posición hasta que llegues a una zona segura.
        </p>

        {!consented ? (
          <>
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <fieldset>
              <legend>Cómo aparecer en el mapa</legend>
              <label className="row">
                <input
                  type="radio"
                  checked={mode === 'demo'}
                  onChange={() => setMode('demo')}
                />
                Simular que estoy en la zona (demo)
              </label>
              <label className="row">
                <input
                  type="radio"
                  checked={mode === 'gps'}
                  onChange={() => setMode('gps')}
                />
                Usar mi GPS real
              </label>
            </fieldset>
            <button type="button" onClick={() => setConsented(true)}>
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
            {nearest && pos && (
              <div className="zone-hint">
                <strong>{nearest.zone.name}</strong>
                <span>{Math.round(nearest.distanceM / 10) * 10} m</span>
              </div>
            )}
            <p className="fine">Puedes cerrar esta pestaña para dejar de enviar posición.</p>
          </>
        )}
      </div>
    </div>
  )
}
