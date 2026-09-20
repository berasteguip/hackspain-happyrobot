import { TOUR_INTRO } from './demoTour'

export function TourIntro({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return <aside className="tour-intro" role="dialog" aria-labelledby="tour-intro-title" aria-describedby="tour-intro-copy">
    <header className="tour-intro-head">
      <p className="eyebrow">{TOUR_INTRO.kicker}</p>
      <span className="status-pill">Guía</span>
    </header>
    <div className="tour-intro-body">
      <h2 id="tour-intro-title">{TOUR_INTRO.title}</h2>
      <p id="tour-intro-copy">{TOUR_INTRO.lede}</p>
      <ol className="tour-intro-checklist">
        {TOUR_INTRO.checklist.map(item => <li key={item}>{item}</li>)}
      </ol>
    </div>
    <div className="tour-intro-actions">
      <button type="button" className="cop-primary" data-demo="tour-begin" onClick={onStart}>{TOUR_INTRO.primary}</button>
      <button type="button" className="cop-secondary" data-demo="tour-skip" onClick={onDismiss}>{TOUR_INTRO.secondary}</button>
    </div>
  </aside>
}
