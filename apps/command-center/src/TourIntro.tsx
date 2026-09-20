export function TourIntro({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return <aside className="tour-intro" role="dialog" aria-labelledby="tour-intro-title" aria-describedby="tour-intro-copy">
    <p className="tour-intro-kicker">Primera vez aquí</p>
    <h2 id="tour-intro-title">Así se usa el puesto de mando</h2>
    <p id="tour-intro-copy">El mapa enseña el incendio y las personas. Cinco pasos para leer lo que ves y saber de dónde se llama.</p>
    <div className="tour-intro-actions">
      <button type="button" className="cop-primary" data-demo="tour-begin" onClick={onStart}>Ver guía</button>
      <button type="button" className="cop-secondary" data-demo="tour-skip" onClick={onDismiss}>Saltar</button>
    </div>
  </aside>
}
