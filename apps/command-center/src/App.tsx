import { useState } from 'react'
import { CitizenTrack } from './CitizenTrack'
import { CommandCenter } from './CommandCenter'
import { TokenGate } from './TokenGate'
import { isOnboardingPath } from './onboarding'
import { readMapboxToken } from './token'

export default function App() {
  const isTrack = window.location.pathname.startsWith('/track')
  // `/onboarding` es el mismo puesto de mando: su escenario de práctica, el recorrido arrancado
  // solo y sin una línea hacia la API. Al terminar se vuelve a `/`.
  const isOnboarding = isOnboardingPath(window.location.pathname)
  const [token, setToken] = useState(() => readMapboxToken())

  if (isTrack) return <CitizenTrack />

  if (!token) return <TokenGate onReady={setToken} />
  return <CommandCenter token={token} onboarding={isOnboarding} />
}
