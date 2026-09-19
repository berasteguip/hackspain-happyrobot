import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge } from "../components/CrisisMap";
import { IncomingCall, PhoneMock } from "../components/PhoneMock";
import { HRCard, Transcript } from "../components/HappyRobotUI";
import { Narration } from "../components/Narration";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 2. Zoom al punto de la casa protagonista. Sale un móvil vibrando.
// Se descuelga y al lado aparece la tarjeta de HappyRobot con lo que dice el
// agente, escribiéndose. Es el gancho: un segundo de "persona", y ya estamos
// dentro del sistema.
export const TheCall: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const hero = scene.hero;

  const zoom = interpolate(t, [0, 2.2], [1.2, 3.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cam = { x: hero.x + 120, y: hero.y - 40, zoom };

  const phoneIn = spring({ frame: frame - fps * 1.2, fps, config: { damping: 14, stiffness: 120 } });
  const answered = t >= 1.9;
  const shake = !answered && t > 1.2 ? Math.sin(t * 60) * 2.5 : 0;

  const cardIn = spring({ frame: frame - fps * 2.2, fps, config: { damping: 16 } });
  const agentLine = def.lines[0].text;
  const typed = Math.floor(interpolate(t, [2.4, 7.0], [0, agentLine.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  // Estado de la casa protagonista: llamando, luego contestada.
  const houseStates: Record<string, "calling" | "answered"> = { [hero.houseId]: answered ? "answered" : "calling" };

  return (
    <Background>
      <CrisisMap camera={cam} houseStates={houseStates} labels={false} showShelters={false} fireScale={1} cone={{ bearingDeg: scene.fire.headBearingDeg, radiusPx: 620, opacity: 0.5 }} />

      {/* Etiqueta de la casa sobre el mapa */}
      <div style={{ position: "absolute", left: 80, top: 160, fontFamily: FONT.mono, color: C.textDim, fontSize: 16, letterSpacing: 2, lineHeight: 1.9, opacity: interpolate(t, [0.6, 1.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <div style={{ color: C.person, fontSize: 22 }}>{hero.houseId.toUpperCase()}</div>
        <div>{hero.address.toUpperCase()}</div>
        <div>CENSO: {hero.household} PERSONAS</div>
        <div>TELÉFONO SINTÉTICO · +34 600 99x xxx</div>
      </div>

      <div style={{ position: "absolute", inset: 0, opacity: phoneIn }}>
        <PhoneMock x={640 + shake} y={560} scale={0.9 * phoneIn + 0.1} rotate={-4}>
          <IncomingCall from="Protección Civil · Zamora" sub="Aviso de emergencia" answered={answered} seconds={Math.max(0, t - 1.9)} />
        </PhoneMock>
      </div>

      <div style={{ position: "absolute", inset: 0, opacity: cardIn, transform: `translateX(${(1 - cardIn) * 40}px)` }}>
        <HRCard title={`Run · ${hero.houseId} · ${hero.name}`} status={answered ? `Llamada · 00:${String(Math.floor(t - 1.9)).padStart(2, "0")}` : "Marcando"} x={1000} y={330} w={720}>
          <Transcript turns={[{ who: "agent", text: agentLine }]} visible={1} typingChars={typed} />
        </HRCard>
      </div>

      {/* Pie: la obligación legal, dicha como ventaja */}
      <div style={{ position: "absolute", left: 1000, top: 640, fontFamily: FONT.mono, color: C.textDim, fontSize: 14, letterSpacing: 2, opacity: interpolate(t, [6, 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        SE IDENTIFICA COMO IA EN LA PRIMERA FRASE · AI ACT ART. 50
      </div>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
