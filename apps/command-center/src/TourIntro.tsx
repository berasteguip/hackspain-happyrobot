import { useState } from 'react'
import { TOUR_INTRO } from './demoTour'

/**
 * La invitación al recorrido. El botón grande es empezar; saltárselo es un enlace pequeño que además
 * pide un segundo clic: el recorrido son dos minutos y sin él la demo no se entiende.
 */
export function TourIntro({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const [confirmSkip, setConfirmSkip] = useState(false)
  return <aside className="tour-intro" role="dialog" aria-labelledby="tour-intro-title">
    <div className="tour-intro-body">
      <h2 id="tour-intro-title">{TOUR_INTRO.title}</h2>
      <ol className="tour-intro-checklist">
        {TOUR_INTRO.checklist.map(item => <li key={item}>{item}</li>)}
      </ol>
    </div>
    <div className="tour-intro-actions">
      <button type="button" className="cop-primary" data-demo="tour-begin" autoFocus onClick={onStart}>{TOUR_INTRO.primary}</button>
      {confirmSkip
        ? <p className="tour-intro-skip-confirm" role="status">{TOUR_INTRO.secondaryConfirm} <button type="button" data-demo="tour-skip-confirm" onClick={onDismiss}>Sí, explorar</button> <button type="button" onClick={onStart}>No, empezar</button></p>
        : <button type="button" className="tour-intro-skip" data-demo="tour-skip" onClick={() => setConfirmSkip(true)}>{TOUR_INTRO.secondary}</button>}
    </div>
  </aside>
}
