import { useState } from 'react'
import type { FormEvent } from 'react'
import { ETSIT } from './scenario-madrid'
import { registerPerson } from './crisisApi'
import { saveMe } from './me'

const PREFIXES = ['+34', '+33', '+351', '+44', '+1', '+49', '+39']

/**
 * La página del enlace. Quien la abre da su teléfono con prefijo y comparte su ubicación; el
 * backend la da de alta como persona real y el navegador entra en el mapa centrado en ella.
 * Esa pestaña del mapa sigue emitiendo su GPS (ver `useMyBeacon`).
 */
export function CitizenTrack() {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('+34')
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState<'gps' | 'register' | null>(null)
  const [error, setError] = useState('')

  const phone = `${prefix}${number.replace(/\D/g, '')}`
  const phoneOk = /^\+\d{8,15}$/.test(phone)

  const register = async (lat: number, lon: number, accuracyM?: number) => {
    setBusy('register')
    try {
      // `anchor`: el mundo del ensayo (fuego, vecinos demo, salidas, patrullas) se recoloca alrededor.
      const result = await registerPerson({ name: name.trim() || undefined, phone, lat, lon, accuracyM, anchor: true })
      saveMe({ id: result.person_id, phone })
      window.location.assign(`/?p=${encodeURIComponent(result.person_id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar el registro.')
      setBusy(null)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!phoneOk || busy) return
    setError('')
    if (!('geolocation' in navigator)) { setError('Este navegador no permite leer la ubicación.'); return }
    setBusy('gps')
    navigator.geolocation.getCurrentPosition(
      (position) => void register(position.coords.latitude, position.coords.longitude, position.coords.accuracy),
      (failure) => {
        setBusy(null)
        setError(failure.code === failure.PERMISSION_DENIED
          ? 'Has denegado la ubicación. Permítela en el navegador o usa la posición de demo.'
          : 'No se pudo leer el GPS. Inténtalo de nuevo o usa la posición de demo.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  }

  return (
    <div className="citizen">
      <form className="citizen-card" onSubmit={submit}>
        <p className="kicker">router · Protección Civil</p>
        <h1>Necesitamos saber dónde estás</h1>
        <p className="lede">
          Deja tu teléfono y comparte tu ubicación. Te llamaremos desde el puesto de mando si tu zona entra en riesgo y verás en el mapa hacia dónde ir.
        </p>
        <label>
          Nombre
          <input data-demo="citizen-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Opcional" autoComplete="name" />
        </label>
        <label>
          Teléfono
          <span className="phone-row">
            <select data-demo="citizen-prefix" aria-label="Prefijo" value={prefix} onChange={(event) => setPrefix(event.target.value)}>
              {PREFIXES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input data-demo="citizen-phone" inputMode="tel" autoComplete="tel-national" placeholder="600 000 000" value={number} onChange={(event) => setNumber(event.target.value)} />
          </span>
        </label>
        <button type="submit" data-demo="citizen-consent" disabled={!phoneOk || busy !== null}>
          {busy === 'gps' ? 'Leyendo tu ubicación…' : busy === 'register' ? 'Entrando en el mapa…' : 'Compartir mi ubicación y entrar'}
        </button>
        <button type="button" data-demo="citizen-demo-position" className="secondary" disabled={!phoneOk || busy !== null} onClick={() => { setError(''); void register(ETSIT.lat, ETSIT.lng) }}>
          Sin GPS: usar la posición de ETSIT (demo)
        </button>
        {error && <p className="citizen-error" role="alert">{error}</p>}
        <p className="fine">
          Tu posición se comparte solo con el puesto de mando mientras la pestaña del mapa siga abierta. Al registrarte aceptas recibir una llamada de la campaña. Datos del ensayo, no de una emergencia real.
        </p>
      </form>
    </div>
  )
}
