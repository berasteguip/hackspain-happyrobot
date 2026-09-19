import { useState } from 'react'
import { CitizenTrack } from './CitizenTrack'
import { CommandCenter } from './CommandCenter'
import { TokenGate } from './TokenGate'
import { readMapboxToken } from './token'

export default function App() {
  const isTrack = window.location.pathname.startsWith('/track')
  const [token, setToken] = useState(() => readMapboxToken())

  if (isTrack) {
    const id = new URLSearchParams(window.location.search).get('id')
    return <CitizenTrack presetId={id} />
  }

  if (!token) return <TokenGate onReady={setToken} />
  return <CommandCenter token={token} />
}
