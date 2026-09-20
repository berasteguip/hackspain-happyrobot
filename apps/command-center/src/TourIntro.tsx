export function TourIntro({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return <aside className="tour-intro" aria-label="Introducción al mapa">
    <span>Un recorrido por el mapa</span>
    <button type="button" className="tour-intro-start" data-demo="tour-begin" onClick={onStart}>Ver guía <span aria-hidden="true">→</span></button>
    <button type="button" className="tour-intro-close" data-demo="tour-skip" aria-label="Cerrar introducción" onClick={onDismiss}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </aside>
}
