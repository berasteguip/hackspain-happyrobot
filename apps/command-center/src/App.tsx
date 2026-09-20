import { useState } from 'react'
import { CitizenTrack } from './CitizenTrack'
import { CommandCenter } from './CommandCenter'
import { TokenGate } from './TokenGate'
import { readMapboxToken } from './token'

export default function App() {
  const isTrack = window.location.pathname.startsWith('/track')
  const [token, setToken] = useState(() => readMapboxToken())

  if (isTrack) return <CitizenTrack />

  if (!token) return <TokenGate onReady={setToken} />
  return <CommandCenter token={token} />
}
