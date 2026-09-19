import { useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import { nearestZone } from './geo'
import {
  AGENTS,
  createPopulation,
  INCIDENT,
  SAFE_ZONES,
  SCENARIO_FIRES,
} from './scenario'
import { advanceProtocol, moveEvacuees } from './simulation'
import type { Citizen, FireSpot } from './types'

type LivePing = {
  id: string
  name: string
  lng: number
  lat: number
  ts: number
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('es-ES', { hour12: false })
}

export function CommandCenter({ token }: { token: string }) {
  const [now, setNow] = useState(() => new Date())
  const [citizens, setCitizens] = useState<Citizen[]>(createPopulation)
  const [protocolOn, setProtocolOn] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(true)
  const [firmsState, setFirmsState] = useState('Cargando NASA FIRMS…')
  const elapsedRef = useRef(0)
  const seenEvents = useRef(new Set<string>())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchFirmsSpain()
      .then((spots) => {
        if (cancelled) return
        setFirms(spots)
        setFirmsState(
          spots.length
            ? `${spots.length} focos satélite en España (24 h)`
            : 'FIRMS sin focos en España',
        )
      })
      .catch(() => {
        if (!cancelled) setFirmsState('FIRMS no disponible — usando focos del escenario')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!protocolOn) return
    let last = performance.now()
    let frame = 0
    const loop = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.25)
      last = ts
      elapsedRef.current += dt
      const nextElapsed = elapsedRef.current
      setElapsed(nextElapsed)
      setCitizens((current) => {
        const stepped = moveEvacuees(current, SAFE_ZONES, dt)
        const advanced = advanceProtocol(stepped, SAFE_ZONES, nextElapsed, [])
        for (const event of advanced.events) seenEvents.current.add(event.id)
        return advanced.citizens
      })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [protocolOn])

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/locations')
        if (!res.ok) return
        const pings = (await res.json()) as LivePing[]
        if (!pings.length) return
        setCitizens((current) => mergePings(current, pings))
      } catch {
        // demo API is local-only
      }
    }
    const id = window.setInterval(() => void poll(), 1500)
    void poll()
    return () => window.clearInterval(id)
  }, [])

  const fireScale = 1 + Math.min(elapsed, 120) / 90

  const counts = useMemo(() => {
    const tally = { total: citizens.length, moving: 0, safe: 0 }
    for (const citizen of citizens) {
      if (citizen.status === 'evacuating' || citizen.status === 'tracking') tally.moving += 1
      if (citizen.status === 'safe') tally.safe += 1
    }
    return tally
  }, [citizens])

  const startProtocol = () => setProtocolOn(true)
  const stopProtocol = () => setProtocolOn(false)

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">Vigía</span>
          <span className="sep" />
          <div>
            <strong>{INCIDENT.cecop}</strong>
            <small>{INCIDENT.code}</small>
          </div>
        </div>
        <div className="incident">
          <span className={`pill ${protocolOn ? 'live' : ''}`}>
            {protocolOn ? 'Aviso activo' : 'Prealerta'}
          </span>
          <div>
            <strong>{INCIDENT.name}</strong>
            <small>{INCIDENT.area}</small>
          </div>
        </div>
        <div className="meta">
          <span>{AGENTS.length} agentes HappyRobot</span>
          <time>{formatClock(now)}</time>
        </div>
      </header>

      <aside className="panel left">
        <div className="kpis">
          <Kpi label="Población" value={counts.total} />
          <Kpi label="En tránsito" value={counts.moving} />
          <Kpi label="Zona segura" value={counts.safe} />
        </div>

        <div className="actions">
          <button
            className="primary"
            type="button"
            onClick={startProtocol}
            disabled={protocolOn}
          >
            {protocolOn ? `Aviso en curso · ${elapsed.toFixed(0)}s` : 'Activar protocolo de aviso'}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={stopProtocol}
            disabled={!protocolOn}
          >
            Detener aviso
          </button>
        </div>

        <h2>Zonas seguras</h2>
        <ul className="zones">
          {SAFE_ZONES.map((zone) => {
            const assigned = citizens.filter((c) => c.safeZoneId === zone.id)
            const arrived = assigned.filter((c) => c.status === 'safe').length
            const moving = assigned.filter((c) => c.status === 'evacuating').length
            return (
              <li key={zone.id}>
                <div>
                  <strong>{zone.name}</strong>
                  <span>
                    {arrived} en zona · {moving} en camino · {assigned.length} asignados
                  </span>
                </div>
              </li>
            )
          })}
        </ul>

        <h2>Focos</h2>
        <label className="row tight">
          <input
            type="checkbox"
            checked={showFirms}
            onChange={(event) => setShowFirms(event.target.checked)}
          />
          Superponer NASA FIRMS
        </label>
        <p className="fine">{firmsState}</p>
        <p className="fine">{SCENARIO_FIRES.length} focos operativos en el perímetro</p>
      </aside>

      <main className="map-wrap">
        <CommandMap
          token={token}
          citizens={citizens}
          fires={SCENARIO_FIRES}
          satelliteFires={showFirms ? firms : []}
          zones={SAFE_ZONES}
          selectedId={selectedId}
          fireScale={fireScale}
          onSelect={setSelectedId}
        />
        <div className="legend">
          <span><i className="swatch fire" /> Foco</span>
          <span><i className="swatch safe" /> Zona segura</span>
          <span><i className="swatch wait" /> En el perímetro</span>
          <span><i className="swatch move" /> En tránsito</span>
        </div>
      </main>
    </div>
  )
}

function Kpi({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="kpi">
      <em>{label}</em>
      <strong>{value}</strong>
    </div>
  )
}

function mergePings(current: Citizen[], pings: LivePing[]): Citizen[] {
  const next = [...current]
  for (const ping of pings) {
    const index = next.findIndex((citizen) => citizen.id === ping.id)
    const zoneId = nearestZone(ping.lng, ping.lat, SAFE_ZONES).zone.id
    if (index >= 0) {
      next[index] = {
        ...next[index],
        lng: ping.lng,
        lat: ping.lat,
        name: ping.name || next[index].name,
        status: next[index].status === 'safe' ? 'safe' : 'tracking',
        safeZoneId: zoneId,
        live: true,
      }
    } else {
      next.unshift({
        id: ping.id,
        name: ping.name,
        phone: 'GPS ciudadano',
        lng: ping.lng,
        lat: ping.lat,
        originLng: ping.lng,
        originLat: ping.lat,
        status: 'tracking',
        vulnerable: false,
        safeZoneId: zoneId,
        speedKmh: 0,
        callDelaySec: 0,
        outcome: 'tracking',
        live: true,
      })
    }
  }
  return next
}
