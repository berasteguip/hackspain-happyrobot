import { useEffect, useMemo, useRef, useState } from 'react'
import { ageLabel, fetchCallLog, isStale, sourceOf, TOPICS, zoneLabel } from './call-log'
import type { CallLogEntry } from './call-log'

type Filter = 'all' | 'open' | 'official'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'open', label: 'Sin respuesta' },
  { key: 'official', label: 'Oficial' },
]

/**
 * Memoria compartida: el log de llamadas, en vivo sobre el mapa.
 *
 * No es el registro de decisiones del sistema —eso es otra cosa y va en otro sitio—:
 * esto es lo que han dicho las personas, y es lo que el mando necesita para saber qué
 * se sabe ya sin preguntárselo a nadie.
 */
export function CallLog() {
  const [entries, setEntries] = useState<CallLogEntry[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const seen = useRef(new Set<string>())
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const tick = async () => {
      try {
        const rows = await fetchCallLog(controller.signal)
        if (!alive) return
        setEntries(rows)
        setError('')
      } catch (e) {
        if (!alive || controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'sin conexión')
      }
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => { alive = false; controller.abort(); clearInterval(id) }
  }, [])

  // La antigüedad envejece sola: «hace 3 min» tiene que subir aunque no llegue nada,
  // o el mando lee un dato viejo como si fuera reciente.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(id)
  }, [])

  // Destello cuando entra algo: es un canal vivo, no una tabla.
  useEffect(() => {
    const fresh = entries.filter(e => !seen.current.has(e.id))
    if (!fresh.length) return
    const first = seen.current.size === 0
    for (const e of fresh) seen.current.add(e.id)
    if (first) return
    setPulse(true)
    const id = setTimeout(() => setPulse(false), 1400)
    return () => clearTimeout(id)
  }, [entries])

  const shown = useMemo(() => entries.filter(e => {
    if (filter === 'open') return e.answer == null
    if (filter === 'official') return sourceOf(e.source_id).official
    return true
  }), [entries, filter])

  const open = entries.filter(e => e.answer == null).length

  return (
    <section className={`call-log${collapsed ? ' collapsed' : ''}`} aria-label="Memoria compartida entre llamadas">
      <header>
        <span className={`log-dot${pulse ? ' pulsing' : ''}`} aria-hidden="true" />
        <strong>Memoria compartida</strong>
        <span className="log-count">{entries.length}</span>
        {open > 0 && <span className="log-count open" title="Dudas sin respuesta">{open} abiertas</span>}
        <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'Desplegar' : 'Plegar'} onClick={() => setCollapsed(v => !v)}>{collapsed ? '▴' : '▾'}</button>
      </header>

      {!collapsed && <>
        <div className="log-filters" role="group" aria-label="Filtrar anotaciones">
          {FILTERS.map(f => (
            <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>

        <div className="log-body">
          {error && <p className="log-empty">Sin conexión con la API.<br /><small>{error}</small></p>}
          {!error && !shown.length && <p className="log-empty">{entries.length
            ? 'Nada con este filtro.'
            : 'Todavía no se ha aprendido nada. Lo que averigüe una llamada aparecerá aquí y lo sabrán todas las demás.'}</p>}
          {shown.map(entry => {
            const src = sourceOf(entry.source_id)
            const unanswered = entry.answer == null
            const stale = isStale(entry, now)
            return (
              <article key={entry.id} className={`log-entry${src.official ? ' official' : ''}${unanswered ? ' unanswered' : ''}${stale ? ' stale' : ''}`}>
                <div className="log-head">
                  <span className="log-src">{src.label}{entry.source_detail ? ` · ${entry.source_detail}` : ''}</span>
                  <span className="log-age">{ageLabel(entry.created_at, now)}</span>
                </div>
                <p className="log-q">{entry.question}</p>
                {unanswered
                  ? <p className="log-pending">Sin respuesta todavía</p>
                  : <p className="log-a">{entry.answer}</p>}
                <div className="log-tags">
                  {entry.road && <span className="log-tag road">{entry.road}</span>}
                  {entry.locality_id && <span className="log-tag">{zoneLabel(entry.locality_id)}</span>}
                  {entry.place_text && <span className="log-tag">{entry.place_text}</span>}
                  {entry.topic && entry.topic !== 'other' && <span className="log-tag">{TOPICS[entry.topic] ?? entry.topic}</span>}
                  {stale && <span className="log-tag stale">caducado</span>}
                  {entry.simulated && <span className="log-tag sim">simulado</span>}
                </div>
              </article>
            )
          })}
        </div>
      </>}
    </section>
  )
}
