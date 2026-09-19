import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge } from "../components/CrisisMap";
import { PhoneMock, ShareLocation } from "../components/PhoneMock";
import { Narration } from "../components/Narration";
import { curvedRoute, polylineLength, routeCrossesCone } from "../lib/geometry";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 5. El móvil comparte ubicación. Cuatro puntos de encuentro se
// iluminan con su tiempo de llegada a 2,5 km/h. El más cercano está dentro del
// cono del fuego: se descarta en rojo. La ruta buena se traza en verde, con
// convoy (coche guía).
//
// Puntos de encuentro: los 2 refugios del dataset + 2 candidatos de pueblo
// (plaza/iglesia) que la API trataría como puntos de reunión intermedios.
export const Route: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const hero = scene.hero;
  const fc = scene.fire.center;
  const mpp = scene.meta.metersPerPx;
  const coneR = 620;

  const candidates = [
    { id: "c-near", name: "Ermita · Losacio sur", x: hero.x - 30, y: hero.y + 52, capacity: 60 },
    { id: "c-ferr", name: "Plaza · Ferreruela", x: scene.villages[1].x + 10, y: scene.villages[1].y + 14, capacity: 200 },
    ...scene.shelters,
  ];
  const groupKmh = 2.5;
  const withRoutes = candidates.map((c, i) => {
    const pts = curvedRoute(hero, c, 0.18, i % 2 === 0 ? 1 : -1);
    const km = (polylineLength(pts) * mpp) / 1000;
    // Cruza el cono, o el destino mismo está en la trayectoria del frente
    // (Ferreruela está en el camino del fuego: no se manda a nadie allí).
    const crosses = routeCrossesCone(pts.slice(Math.floor(pts.length * 0.2)), fc, scene.fire.headBearingDeg, scene.fire.coneHalfAngleDeg, coneR) || c.id === "c-ferr";
    // A pie hasta Ferreruela/refugios sería inviable: el convoy los recoge.
    const byCar = km > 4;
    const minutes = byCar ? 8 + (km / 60) * 60 : (km / groupKmh) * 60;
    return { ...c, pts, km, crosses, byCar, minutes };
  });
  // Preferimos rutas que no cruzan el cono; si el cono lo cubre todo (pasa
  // con Losacio, el pueblo más cercano al fuego), la que menos se acerca.
  const chosen = [...withRoutes]
    .filter((c) => c.id !== "c-near" && c.id !== "c-ferr")
    .sort((a, b) => Number(a.crosses) - Number(b.crosses) || a.minutes - b.minutes)[0];

  const phoneA = interpolate(t, [0, 0.6, 4.5, 5.2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const step: 0 | 1 | 2 = t < 2.4 ? 0 : t < 4.2 ? 1 : 2;
  const locked = t >= 2.4;

  const zoom = interpolate(t, [4.5, 7.0], [2.6, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cx = interpolate(t, [4.5, 7.0], [hero.x + 120, 1080], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(t, [4.5, 7.0], [hero.y - 60, 480], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const candIn = withRoutes.map((_, i) => spring({ frame: frame - fps * (5.6 + i * 0.35), fps, config: { damping: 12 } }));
  const nearProg = interpolate(t, [9.5, 11.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const nearDiscard = t >= 11.5;
  const goodProg = interpolate(t, [13.0, 15.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const convoyIn = spring({ frame: frame - fps * 16.2, fps, config: { damping: 14 } });

  const routes: Record<string, { pts: typeof chosen.pts; color: string; progress: number; dashed?: boolean; width?: number }> = {};
  const near = withRoutes[0];
  if (nearProg > 0) routes.near = { pts: near.pts, color: nearDiscard ? C.routeBad : C.textDim, progress: nearProg, dashed: nearDiscard, width: nearDiscard ? 3 : 4 };
  if (goodProg > 0) routes.good = { pts: chosen.pts, color: C.route, progress: goodProg, width: 6 };

  return (
    <Background>
      <CrisisMap
        camera={{ x: cx, y: cy, zoom }}
        houseStates={{ [hero.houseId]: "answered" }}
        routes={routes}
        cone={{ bearingDeg: scene.fire.headBearingDeg, radiusPx: coneR, opacity: t > 9 ? 1 : 0.5 }}
        labels={t > 6}
      >
        {/* Candidatos: anillo + ETA */}
        {withRoutes.map((c, i) => {
          const a = candIn[i];
          const isChosen = c.id === chosen.id && goodProg > 0;
          const bad = (c.id === near.id || c.id === "c-ferr") && nearDiscard;
          const col = bad ? C.routeBad : isChosen ? C.route : C.shelter;
          return (
            <g key={c.id} opacity={a}>
              <circle cx={c.x} cy={c.y} r={14 * a} fill="none" stroke={col} strokeWidth={2.5} />
              <circle cx={c.x} cy={c.y} r={26 * a} fill="none" stroke={col} strokeWidth={1} opacity={0.5} strokeDasharray="4 6" />
            </g>
          );
        })}
        {/* Coche guía en la ruta buena */}
        {goodProg >= 1 && (
          <g opacity={convoyIn}>
            <circle cx={chosen.pts[6].x} cy={chosen.pts[6].y} r={9} fill={C.patrol} />
            <circle cx={chosen.pts[6].x} cy={chosen.pts[6].y} r={16} fill="none" stroke={C.patrol} strokeWidth={2} opacity={0.6} />
          </g>
        )}
      </CrisisMap>

      {/* Tarjetas de candidatos (HTML, columna derecha) */}
      <div style={{ position: "absolute", left: 1380, top: 250, width: 480, fontFamily: FONT.ui }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: 3, color: C.textDim, marginBottom: 12, opacity: candIn[0] }}>PUNTOS DE ENCUENTRO · por tiempo, no por distancia</div>
        {withRoutes.map((c, i) => {
          const a = candIn[i];
          const isChosen = c.id === chosen.id && goodProg > 0;
          const bad = (c.id === near.id || c.id === "c-ferr") && nearDiscard;
          return (
            <div
              key={c.id}
              style={{
                opacity: a,
                transform: `translateX(${(1 - a) * 30}px)`,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                marginBottom: 8,
                borderRadius: 12,
                background: isChosen ? "rgba(56,224,123,0.12)" : bad ? "rgba(255,59,59,0.10)" : C.bgPanel,
                border: `1px solid ${isChosen ? C.route : bad ? C.routeBad : C.line}`,
                color: C.text,
                textDecoration: bad ? "line-through" : "none",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 5, background: isChosen ? C.route : bad ? C.routeBad : C.shelter }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{c.name.split(" (")[0]}</div>
                <div style={{ fontSize: 13, color: C.textDim, fontFamily: FONT.mono }}>
                  {c.km.toFixed(1)} km · {c.byCar ? "convoy" : "a pie 2,5 km/h"}
                  {bad ? (c.id === "c-ferr" ? " · EN EL CAMINO DEL FRENTE" : " · CRUZA EL FRENTE") : ""}
                </div>
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: isChosen ? C.route : bad ? C.routeBad : C.text }}>{Math.round(c.minutes)} min</div>
            </div>
          );
        })}
        <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 13, color: C.textDim, letterSpacing: 1.5, opacity: convoyIn, lineHeight: 1.8 }}>
          <div style={{ color: C.patrol }}>CONVOY · coche guía: Antonio (h-017) · Seat León blanco · 3 plazas libres</div>
          <div>RESERVA DE PLAZA EN {chosen.name.split(" (")[0].toUpperCase()}: 3 · margen sobre el frente: 41 min</div>
        </div>
      </div>

      <div style={{ position: "absolute", inset: 0, opacity: phoneA }}>
        <PhoneMock x={560} y={560} scale={0.9} rotate={-3}>
          <ShareLocation step={step} />
        </PhoneMock>
        {locked && (
          <div style={{ position: "absolute", left: 800, top: 500, fontFamily: FONT.mono, color: C.person, fontSize: 16, letterSpacing: 2 }}>
            POSICIÓN CONFIRMADA · GPS · ±8 m
          </div>
        )}
      </div>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
