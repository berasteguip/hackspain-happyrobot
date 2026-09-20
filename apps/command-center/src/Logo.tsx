/**
 * Marca de router.
 *
 * El logotipo es el nombre: minúscula, trazo de grosor constante —una carretera—
 * y una sola letra lleva la idea. La «o» cuenta dos cosas a la vez: es una rotonda
 * (anillo abierto por la salida, con isleta en el centro) y es el aparato que da
 * nombre al equipo (dos antenas).
 *
 * Geometría en unidades «u» con la altura de equis en 60 u: trazo 12 u, anillo
 * ⌀ 60 u con el hueco de 64° centrado a las 4:30, isleta ⌀ 12 u, antenas de 16 u
 * y 34 u rematadas en bola ⌀ 12 u. Las antenas nunca miden lo mismo: dos astas
 * iguales sobre un círculo se leen como orejas de animal.
 *
 * El color sale de los tokens de la app, así que la marca sigue al tema:
 * la palabra en currentColor y la «o» en --move.
 */

/** Las cinco letras neutras: r · u · t · e · r */
const WORD = [
  'M6,94 V60 C6,49.5 12.5,46 22.5,46',
  'M110.5,46 V70 A24,24 0 0 0 158.5,70 V46',
  'M189.5,6 V79 C189.5,88.5 195.5,94 203.5,94 M175.5,46 H209.5',
  'M226.5,70 H274.5 A24,24 0 1 0 264.3,89.7',
  'M294.5,94 V60 C294.5,49.5 301,46 311,46',
]

/** La «o», en las coordenadas del brief; la palabra la coloca con un translate */
const RING = 'M35.4,93.4 A24,24 0 1 1 53.4,75.4'
const MASTS = 'M13.9,52.2 V36.2 M46.1,52.2 V18.2'
const DOTS = [
  { cx: 13.9, cy: 36.2 },
  { cx: 46.1, cy: 18.2 },
  { cx: 30, cy: 70 },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-6 -10 332 118" role="img" aria-label="router" focusable="false">
      <g className="logo-word">
        {WORD.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g transform="translate(36.5,0)">
        <g className="logo-accent">
          <path d={RING} />
          <path d={MASTS} />
        </g>
        <g className="logo-dot">
          {DOTS.map((dot) => (
            <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={6} />
          ))}
        </g>
      </g>
    </svg>
  )
}
