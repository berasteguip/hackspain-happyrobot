import { useEffect, useMemo, useRef, useState } from 'react'
import { CommandMap } from './CommandMap'
import { fetchFirmsSpain } from './firms'
import {
  AGENTS,
  INITIAL_CITIZENS,
  INCIDENT,
  SAFE_ZONES,
  SCENARIO_FIRES,
} from './scenario'
import { advanceProtocol, moveEvacuees } from './simulation'
import type { CallEvent, Citizen, FireSpot } from './types'

const STATUS_LABEL: Record<Citizen['status'], string> = {
  pending: 'Pendiente',
  ringing: 'Llamando',
  no_answer: 'Sin respuesta',
  informed: 'Informado',
  tracking: 'Localizado',
  evacuating: 'En tránsito',
  safe: 'En zona segura',
  refused: 'Rechaza seguimiento',
}

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
  const [citizens, setCitizens] = useState<Citizen[]>(INITIAL_CITIZENS)
  const [events, setEvents] = useState<CallEvent[]>([])
  const [protocolOn, setProtocolOn] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [firms, setFirms] = useState<FireSpot[]>([])
  const [showFirms, setShowFirms] = useState(true)
  const [firmsState, setFirmsState] = useState('Cargando NASA FIRMS…')
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
    const started = performance.now()
    let last = started
    let frame = 0
    const loop = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.25)
      last = ts
      const nextElapsed = (ts - started) / 1000
      setElapsed(nextElapsed)
      setCitizens((current) => {
        const stepped = moveEvacuees(current, SAFE_ZONES, dt)
        const advanced = advanceProtocol(stepped, nextElapsed, [])
        const fresh = advanced.events.filter((event) => {
          if (seenEvents.current.has(event.id)) return false
          seenEvents.current.add(event.id)
          return true
        })
        if (fresh.length) {
          setEvents((prev) => [...fresh, ...prev].slice(0, 80))
        }
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

  const fires = useMemo(
    () => (showFirms ? [...SCENARIO_FIRES, ...firms] : SCENARIO_FIRES),
    [showFirms, firms],
  )

  const counts = useMemo(() => {
    const tally = {
      total: citizens.length,
      called: 0,
      moving: 0,
      safe: 0,
      silent: 0,
      vulnerable: 0,
    }
    for (const citizen of citizens) {
      if (citizen.status !== 'pending') tally.called += 1
      if (citizen.status === 'evacuating' || citizen.status === 'tracking') tally.moving += 1
      if (citizen.status === 'safe') tally.safe += 1
      if (citizen.status === 'no_answer') tally.silent += 1
      if (citizen.vulnerable && citizen.status !== 'safe') tally.vulnerable += 1
    }
    return tally
  }, [citizens])

  const selected = citizens.find((citizen) => citizen.id === selectedId) ?? null
  const filtered = citizens.filter((citizen) =>
    `${citizen.name} ${citizen.phone} ${STATUS_LABEL[citizen.status]}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

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
            {protocolOn ? 'Protocolo activo' : 'Prealerta'}
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
          <Kpi label="Avisados" value={counts.called} total={counts.total} />
          <Kpi label="En tránsito" value={counts.moving} />
          <Kpi label="Zona segura" value={counts.safe} />
          <Kpi label="Sin respuesta" value={counts.silent} warn />
        </div>

        <button
          className="primary"
          type="button"
          onClick={() => setProtocolOn(true)}
          disabled={protocolOn}
        >
          {protocolOn ? `Aviso en curso · ${elapsed.toFixed(0)}s` : 'Activar protocolo de aviso'}
        </button>
        <p className="hint">
          Los agentes de voz llaman a la población en riesgo, indican la zona segura
          más cercana y piden consentimiento para el seguimiento.
        </p>

        <h2>Zonas seguras</h2>
        <ul className="zones">
          {SAFE_ZONES.map((zone) => {
            const assigned = citizens.filter((c) => c.safeZoneId === zone.id)
            const arrived = assigned.filter((c) => c.status === 'safe').length
            return (
              <li key={zone.id}>
                <div>
                  <strong>{zone.name}</strong>
                  <span>
                    {arrived}/{assigned.length} llegados · cap. {zone.capacity}
                  </span>
                </div>
                <b>{Math.round((arrived / Math.max(assigned.length, 1)) * 100)}%</b>
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
        <p className="fine">
          {SCENARIO_FIRES.length} focos operativos en el perímetro de Gredos
          {counts.vulnerable ? ` · ${counts.vulnerable} personas vulnerables aún fuera` : ''}
        </p>
      </aside>

      <main className="map-wrap">
        <CommandMap
          token={token}
          citizens={citizens}
          fires={fires}
          zones={SAFE_ZONES}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="legend">
          <span><i className="swatch fire" /> Foco</span>
          <span><i className="swatch risk" /> Perímetro</span>
          <span><i className="swatch safe" /> Zona segura</span>
          <span><i className="swatch move" /> En tránsito</span>
          <span><i className="swatch wait" /> Pendiente / sin respuesta</span>
        </div>
      </main>

      <aside className="panel right">
        <h2>Población contactada</h2>
        <input
          className="search"
          placeholder="Buscar nombre o teléfono"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="people">
          {filtered.map((citizen) => (
            <li key={citizen.id}>
              <button
                type="button"
                className={citizen.id === selectedId ? 'selected' : ''}
                onClick={() => setSelectedId(citizen.id)}
              >
                <span className={`dot ${citizen.status}`} />
                <span>
                  <strong>
                    {citizen.name}
                    {citizen.vulnerable ? ' · vuln.' : ''}
                    {citizen.live ? ' · live' : ''}
                  </strong>
                  <em>{STATUS_LABEL[citizen.status]}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <div className="detail">
            <h3>{selected.name}</h3>
            <p>{selected.phone}</p>
            <p>{STATUS_LABEL[selected.status]}</p>
            <p>
              Zona asignada:{' '}
              {SAFE_ZONES.find((zone) => zone.id === selected.safeZoneId)?.name}
            </p>
          </div>
        )}

        <h2>Registro de llamadas</h2>
        <ol className="feed">
          {events.length === 0 && <li className="empty">Sin llamadas todavía.</li>}
          {events.map((event) => (
            <li key={event.id}>
              <time>{formatClock(new Date(event.ts))}</time>
              <span>
                <b>{event.agent}</b> → {event.name}
                <em>{event.detail}</em>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function Kpi({
  label,
  value,
  total,
  warn,
}: {
  label: string
  value: number
  total?: number
  warn?: boolean
}) {
  return (
    <div className={`kpi ${warn ? 'warn' : ''}`}>
      <em>{label}</em>
      <strong>
        {value}
        {total !== undefined && <small>/{total}</small>}
      </strong>
    </div>
  )
}

function mergePings(current: Citizen[], pings: LivePing[]): Citizen[] {
  const next = [...current]
  for (const ping of pings) {
    const index = next.findIndex((citizen) => citizen.id === ping.id)
    if (index >= 0) {
      next[index] = {
        ...next[index],
        lng: ping.lng,
        lat: ping.lat,
        name: ping.name || next[index].name,
        status: next[index].status === 'safe' ? 'safe' : 'tracking',
        live: true,
      }
    } else {
      next.unshift({
        id: ping.id,
        name: ping.name,
        phone: 'GPS ciudadano',
        lng: ping.lng,
        lat: ping.lat,
        status: 'tracking',
        vulnerable: false,
        safeZoneId: SAFE_ZONES[0].id,
        speedKmh: 0,
        callDelaySec: 0,
        outcome: 'tracking',
        live: true,
      })
    }
  }
  return next
}
