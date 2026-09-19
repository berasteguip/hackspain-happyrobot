import { useMemo, useState } from 'react'
import { saveMapboxToken } from './token'

export function TokenGate({ onReady }: { onReady: (token: string) => void }) {
  const [value, setValue] = useState('')
  const valid = useMemo(() => value.trim().startsWith('pk.'), [value])

  return (
    <div className="gate">
      <div className="gate-card">
        <p className="kicker">Vigía · centro de mando</p>
        <h1>Falta el token de Mapbox</h1>
        <p className="lede">
          Crea un token público en{' '}
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">
            account.mapbox.com
          </a>{' '}
          y pégalo aquí. Se guarda en este navegador.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!valid) return
            const token = value.trim()
            saveMapboxToken(token)
            onReady(token)
          }}
        >
          <input
            autoFocus
            spellCheck={false}
            placeholder="pk.eyJ1Ijoi..."
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" disabled={!valid}>
            Entrar al CECOP
          </button>
        </form>
      </div>
    </div>
  )
}
