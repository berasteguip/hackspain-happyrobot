export type Pt = { x: number; y: number };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

// Ruta provisional: curva cuadrática con el control desplazado hacia un lado,
// para que parezca carretera y no una regla. TODO: sustituir por la polilínea
// real de OSRM que devuelve backend/api en assigned_route.
export function curvedRoute(from: Pt, to: Pt, bend = 0.25, side = 1, steps = 40): Pt[] {
  const mid = lerpPt(from, to, 0.5);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ctrl = { x: mid.x - dy * bend * side, y: mid.y + dx * bend * side };
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
    });
  }
  return pts;
}

export function polylineLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

// Punto a una fracción t (0..1) de la longitud total.
export function pointAlong(pts: Pt[], t: number): Pt {
  const total = polylineLength(pts);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (target <= seg) return lerpPt(pts[i - 1], pts[i], seg === 0 ? 0 : target / seg);
    target -= seg;
  }
  return pts[pts.length - 1];
}

export const toPath = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

export const toPolygon = (pts: Pt[]) => toPath(pts) + " Z";

// Cono de avance del fuego: sector circular desde el centro, apuntando a
// bearingDeg (0 = norte, sentido horario), con media apertura halfAngleDeg.
export function conePolygon(center: Pt, bearingDeg: number, halfAngleDeg: number, radius: number): Pt[] {
  const pts: Pt[] = [center];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = bearingDeg - halfAngleDeg + (2 * halfAngleDeg * i) / steps;
    const r = (a * Math.PI) / 180;
    // En pantalla y crece hacia abajo, por eso el coseno va con signo negativo.
    pts.push({ x: center.x + radius * Math.sin(r), y: center.y - radius * Math.cos(r) });
  }
  return pts;
}

export function insideCone(p: Pt, center: Pt, bearingDeg: number, halfAngleDeg: number, radius: number) {
  const d = dist(p, center);
  if (d > radius) return false;
  const ang = (Math.atan2(p.x - center.x, -(p.y - center.y)) * 180) / Math.PI;
  let diff = ((ang - bearingDeg + 540) % 360) - 180;
  return Math.abs(diff) <= halfAngleDeg;
}

export function routeCrossesCone(route: Pt[], center: Pt, bearingDeg: number, halfAngleDeg: number, radius: number) {
  return route.some((p) => insideCone(p, center, bearingDeg, halfAngleDeg, radius));
}

// Generador determinista (mismo vídeo en cada render).
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
