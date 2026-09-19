import React from "react";
import scene from "../data/scene.json";
import { C, FONT } from "../lib/theme";
import { conePolygon, seeded, toPolygon, type Pt } from "../lib/geometry";

export type HouseState = "unknown" | "calling" | "answered" | "moving" | "safe" | "no-answer";

export type MapProps = {
  // 0..1: cuánto del trazado base (pueblos, carreteras) está dibujado
  reveal?: number;
  // Estado por casa. Las que faltan se pintan como unknown.
  houseStates?: Record<string, HouseState>;
  // Posición actual de cada persona/grupo en movimiento (id casa -> punto)
  positions?: Record<string, Pt>;
  // Rutas dibujadas: id -> {pts, color, progress 0..1, dashed}
  routes?: Record<string, { pts: Pt[]; color: string; progress: number; dashed?: boolean; width?: number }>;
  // Cono de avance del fuego: rumbo y radio en px. Si radius 0, no se pinta.
  cone?: { bearingDeg: number; radiusPx: number; opacity?: number };
  // Refugios: ocupación 0..1 por id; los no listados aparecen sin barra.
  shelterFill?: Record<string, number>;
  showShelters?: boolean;
  showPatrols?: boolean;
  showSectors?: boolean;
  highlightSector?: string | null;
  // Escala del fuego (1 = el polígono del dataset)
  fireScale?: number;
  // Etiquetas de pueblo
  labels?: boolean;
  // Transformación de cámara (zoom hacia un punto)
  camera?: { x: number; y: number; zoom: number };
  children?: React.ReactNode;
};

const houseColor = (s: HouseState) => {
  switch (s) {
    case "answered":
    case "moving":
      return C.person;
    case "safe":
      return C.route;
    case "calling":
      return C.hrAccent;
    case "no-answer":
      return C.personNoAnswer;
    default:
      return C.personUnknown;
  }
};

export const CrisisMap: React.FC<MapProps> = ({
  reveal = 1,
  houseStates = {},
  positions = {},
  routes = {},
  cone,
  shelterFill = {},
  showShelters = true,
  showPatrols = false,
  showSectors = false,
  highlightSector = null,
  fireScale = 1,
  labels = true,
  camera,
  children,
}) => {
  const { width, height } = scene.meta;
  const fc = scene.fire.center;
  // El perímetro del dataset es un rectángulo. Para el vídeo lo convertimos en
  // una mancha orgánica del mismo tamaño, con borde irregular fijo (seed).
  const fireExtent = Math.max(...scene.fire.polygon.map((p) => Math.abs(p.x - fc.x)), ...scene.fire.polygon.map((p) => Math.abs(p.y - fc.y)));
  const firePts = React.useMemo(() => {
    const rnd = seeded(3);
    const n = 28;
    const wob = Array.from({ length: n }, () => 0.62 + rnd() * 0.38);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      // alargado hacia el rumbo del frente
      const head = ((scene.fire.headBearingDeg - 90) * Math.PI) / 180;
      const stretch = 1 + 0.45 * Math.max(0, Math.cos(a - head));
      const r = fireExtent * 0.75 * wob[i] * stretch * fireScale;
      return { x: fc.x + Math.cos(a) * r, y: fc.y + Math.sin(a) * r };
    });
  }, [fireExtent, fireScale, fc.x, fc.y]);
  const conePts = cone && cone.radiusPx > 0 ? conePolygon(fc, cone.bearingDeg, scene.fire.coneHalfAngleDeg, cone.radiusPx) : null;

  const cam = camera ?? { x: width / 2, y: height / 2, zoom: 1 };
  const transform = `translate(${width / 2} ${height / 2}) scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="fireGlow">
          <stop offset="0%" stopColor={C.fire} stopOpacity={0.95} />
          <stop offset="60%" stopColor={C.fireDeep} stopOpacity={0.6} />
          <stop offset="100%" stopColor={C.fireDeep} stopOpacity={0} />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={transform}>
        {/* Sectores */}
        {showSectors &&
          scene.sectors.map((s) => (
            <path
              key={s.id}
              d={toPolygon(s.polygon)}
              fill={highlightSector === s.id ? `${C.patrol}22` : "transparent"}
              stroke={highlightSector === s.id ? C.patrol : C.line}
              strokeWidth={highlightSector === s.id ? 3 : 1}
              strokeDasharray={highlightSector === s.id ? undefined : "6 10"}
            />
          ))}

        {/* Cono de avance */}
        {conePts && (
          <path d={toPolygon(conePts)} fill={C.cone} fillOpacity={0.12 * (cone?.opacity ?? 1)} stroke={C.cone} strokeOpacity={0.55 * (cone?.opacity ?? 1)} strokeWidth={2} strokeDasharray="10 8" />
        )}

        {/* Fuego */}
        <circle cx={fc.x} cy={fc.y} r={fireExtent * 1.3 * fireScale} fill="url(#fireGlow)" opacity={0.55} />
        <path d={toPolygon(firePts)} fill={C.fire} fillOpacity={0.8} stroke={C.fire} strokeWidth={3} filter="url(#glow)" />
        <path d={toPolygon(firePts.map((p) => ({ x: fc.x + (p.x - fc.x) * 0.55, y: fc.y + (p.y - fc.y) * 0.55 })))} fill="#ffb347" fillOpacity={0.55} />

        {/* Rutas */}
        {Object.entries(routes).map(([id, r]) => {
          const n = Math.max(2, Math.round(r.pts.length * Math.min(1, Math.max(0, r.progress))));
          const pts = r.pts.slice(0, n);
          if (pts.length < 2) return null;
          return (
            <path
              key={id}
              d={pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")}
              fill="none"
              stroke={r.color}
              strokeWidth={r.width ?? 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={r.dashed ? "10 10" : undefined}
              filter="url(#softGlow)"
            />
          );
        })}

        {/* Pueblos */}
        {scene.villages.map((v, i) => {
          const a = Math.min(1, Math.max(0, reveal * 3 - i));
          return (
            <g key={v.name} opacity={a}>
              <circle cx={v.x} cy={v.y} r={46} fill="none" stroke={C.line} strokeWidth={1.5} />
              <circle cx={v.x} cy={v.y} r={46 * 1.9} fill="none" stroke={C.line} strokeWidth={1} strokeDasharray="4 8" />
              {labels && (
                <text x={v.x} y={v.y - 100} textAnchor="middle" fill={C.textDim} fontFamily={FONT.mono} fontSize={20} letterSpacing={2}>
                  {v.name.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}

        {/* Casas */}
        {scene.houses.map((h) => {
          const st = houseStates[h.id] ?? "unknown";
          const p = positions[h.id] ?? h;
          const col = houseColor(st);
          const r = st === "unknown" ? 4 : 6 + Math.min(3, h.residents);
          return (
            <g key={h.id} opacity={reveal}>
              {(st === "answered" || st === "moving") && <circle cx={p.x} cy={p.y} r={r + 8} fill={col} opacity={0.18} />}
              {st === "calling" && <circle cx={p.x} cy={p.y} r={r + 10} fill="none" stroke={col} strokeWidth={2} opacity={0.7} />}
              <circle cx={p.x} cy={p.y} r={r} fill={col} stroke={st === "no-answer" ? C.danger : "none"} strokeWidth={st === "no-answer" ? 3 : 0} />
            </g>
          );
        })}

        {/* Refugios */}
        {showShelters &&
          scene.shelters.map((s) => {
            const fill = shelterFill[s.id] ?? 0;
            return (
              <g key={s.id} opacity={reveal}>
                <rect x={s.x - 18} y={s.y - 18} width={36} height={36} rx={8} fill={C.bgPanel} stroke={C.shelter} strokeWidth={3} />
                <path d={`M${s.x - 9} ${s.y + 8} V${s.y - 2} L${s.x} ${s.y - 10} L${s.x + 9} ${s.y - 2} V${s.y + 8} Z`} fill={C.shelter} />
                <text x={s.x} y={s.y + 44} textAnchor="middle" fill={C.text} fontFamily={FONT.ui} fontSize={18}>
                  {s.name.split(" (")[0]}
                </text>
                {fill > 0 && (
                  <>
                    <rect x={s.x - 40} y={s.y + 54} width={80} height={8} rx={4} fill={C.line} />
                    <rect x={s.x - 40} y={s.y + 54} width={80 * Math.min(1, fill)} height={8} rx={4} fill={fill > 0.8 ? C.warn : C.shelter} />
                    <text x={s.x} y={s.y + 80} textAnchor="middle" fill={C.textDim} fontFamily={FONT.mono} fontSize={14}>
                      {Math.round(fill * s.capacity)}/{s.capacity}
                    </text>
                  </>
                )}
              </g>
            );
          })}

        {/* Patrullas */}
        {showPatrols &&
          scene.patrols.map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={11} fill={C.patrol} />
              <circle cx={p.x} cy={p.y} r={18} fill="none" stroke={C.patrol} strokeWidth={2} opacity={0.5} />
            </g>
          ))}

        {children}
      </g>
    </svg>
  );
};

// Etiqueta obligatoria: los datos son sintéticos.
export const SyntheticBadge: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 28,
      right: 36,
      fontFamily: FONT.mono,
      fontSize: 14,
      letterSpacing: 2,
      color: C.textDim,
      border: `1px solid ${C.line}`,
      padding: "6px 12px",
      borderRadius: 6,
      background: "rgba(7,9,15,0.7)",
    }}
  >
    DATOS SINTÉTICOS · SIMULACIÓN
  </div>
);
