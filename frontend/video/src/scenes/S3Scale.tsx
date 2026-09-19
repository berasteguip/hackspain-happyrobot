import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge, type HouseState } from "../components/CrisisMap";
import { HRCard, Stat } from "../components/HappyRobotUI";
import { Narration } from "../components/Narration";
import { seeded } from "../lib/geometry";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 3. La tarjeta de la conversación se encoge y se multiplica: 120
// tarjetas (una por casa) se despliegan en rejilla, mientras la cámara se
// aleja y en el mapa las casas se van encendiendo una a una. Contador de
// llamadas en paralelo subiendo. Al final, todas menos las que no contestan
// están en azul; la cámara vuelve a la casa protagonista.
export const Scale: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const houses = scene.houses;
  const rnd = seeded(7);
  // Orden aleatorio pero fijo en que se van llamando las casas
  const order = React.useMemo(() => {
    const idx = houses.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callProgress = interpolate(t, [1.0, 6.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const answerLag = 1.4; // s desde que suena hasta que contesta
  const called = Math.floor(callProgress * houses.length);

  const houseStates: Record<string, HouseState> = {};
  order.forEach((hi, k) => {
    const h = houses[hi];
    const callAt = 1.0 + (k / houses.length) * 5.5;
    if (t < callAt) return;
    if (t < callAt + answerLag) houseStates[h.id] = "calling";
    else houseStates[h.id] = h.answers ? "answered" : "no-answer";
  });
  const answered = Object.values(houseStates).filter((s) => s === "answered").length;
  const inCall = Object.values(houseStates).filter((s) => s === "calling").length;

  const zoom = interpolate(t, [0, 3.5, 8.5, def.seconds], [3.2, 1.15, 1.15, 2.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cx = interpolate(t, [0, 3.5, 8.5, def.seconds], [scene.hero.x + 120, 1240, 1240, scene.hero.x + 160], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(t, [0, 3.5, 8.5, def.seconds], [scene.hero.y - 40, 420, 420, scene.hero.y - 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Rejilla de tarjetas: 12 x 10 mini-tarjetas en el lado izquierdo
  const cols = 12;
  const cardW = 64;
  const cardH = 40;
  const gridX = 90;
  const gridY = 300;
  const gridA = interpolate(t, [0.8, 1.6, 8.0, 9.0], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Background>
      <CrisisMap camera={{ x: cx, y: cy, zoom }} houseStates={houseStates} showShelters={false} cone={{ bearingDeg: scene.fire.headBearingDeg, radiusPx: 620, opacity: 0.5 }} />

      {/* Rejilla de conversaciones */}
      <div style={{ position: "absolute", left: gridX, top: gridY, opacity: gridA }}>
        <div style={{ fontFamily: FONT.mono, color: C.textDim, fontSize: 13, letterSpacing: 3, marginBottom: 12 }}>HAPPYROBOT · RUNS EN PARALELO</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cardW}px)`, gap: 6 }}>
          {order.map((hi, k) => {
            const h = houses[hi];
            const st = houseStates[h.id];
            const on = st !== undefined;
            const col = st === "answered" ? C.person : st === "no-answer" ? C.danger : st === "calling" ? C.hrAccent : C.line;
            return (
              <div
                key={h.id}
                style={{
                  width: cardW,
                  height: cardH,
                  borderRadius: 6,
                  background: on ? C.hrPanel : "transparent",
                  border: `1px solid ${on ? col : C.line}`,
                  opacity: on ? 1 : 0.35,
                  transform: `scale(${on ? 1 : 0.9})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "0 6px",
                  fontFamily: FONT.mono,
                  fontSize: 9,
                  color: C.hrTextDim,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: col, flexShrink: 0 }} />
                {h.id}
              </div>
            );
          })}
        </div>
      </div>

      <Stat label="LLAMADAS EN CURSO" value={inCall} color={C.hrAccent} x={1500} y={120} />
      <Stat label="CASAS LOCALIZADAS" value={`${answered} / ${houses.length}`} color={C.person} x={1500} y={260} />
      <Stat label="SIN RESPUESTA" value={Object.values(houseStates).filter((s) => s === "no-answer").length} color={C.danger} x={1500} y={400} small />

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
