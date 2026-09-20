import { TOUR_INTRO } from './demoTour'

export function TourIntro({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <aside className="tour-intro" role="dialog" aria-labelledby="tour-intro-title" aria-describedby="tour-intro-lede">
      <p className="tour-intro-kicker">{TOUR_INTRO.kicker}</p>
      <h2 id="tour-intro-title">{TOUR_INTRO.title}</h2>
      <p id="tour-intro-lede" className="tour-intro-lede">{TOUR_INTRO.lede}</p>
      <ol className="tour-intro-checklist">
        {TOUR_INTRO.checklist.map(item => <li key={item}>{item}</li>)}
      </ol>
      <div className="tour-intro-actions">
        <button type="button" className="cop-primary" onClick={onStart}>{TOUR_INTRO.primary}</button>
        <button type="button" className="cop-secondary" onClick={onDismiss}>{TOUR_INTRO.secondary}</button>
      </div>
    </aside>
  )
}
