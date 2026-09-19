import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge } from "../components/CrisisMap";
import { Narration } from "../components/Narration";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 1. Negro. El mapa se dibuja en línea fina. El fuego aparece y late.
// Cierra con el problema en una frase grande.
export const ColdOpen: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const reveal = interpolate(t, [0.3, 3.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fireIn = interpolate(t, [1.8, 3.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + 0.04 * Math.sin(t * 2.2);
  const coneR = interpolate(t, [3.5, 6.5], [0, 620], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleA = interpolate(t, [4.6, 5.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cam = {
    x: interpolate(t, [0, def.seconds], [1000, 1180]),
    y: interpolate(t, [0, def.seconds], [560, 520]),
    zoom: interpolate(t, [0, def.seconds], [1.0, 1.18]),
  };

  return (
    <Background>
      <AbsoluteFill style={{ opacity: fireIn }}>
        <CrisisMap reveal={reveal} fireScale={fireIn * pulse} cone={{ bearingDeg: scene.fire.headBearingDeg, radiusPx: coneR, opacity: 0.8 }} camera={cam} showShelters={false} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - fireIn }}>
        <CrisisMap reveal={reveal} fireScale={0} camera={cam} showShelters={false} />
      </AbsoluteFill>

      {/* Ficha del incendio, estilo parte oficial */}
      <div style={{ position: "absolute", left: 80, top: 90, fontFamily: FONT.mono, color: C.textDim, fontSize: 16, letterSpacing: 2, opacity: reveal, lineHeight: 2 }}>
        <div style={{ color: C.text, fontSize: 22, letterSpacing: 4 }}>INCENDIO FORESTAL · ZAMORA</div>
        <div>VIENTO {scene.fire.windKmh} km/h · RACHAS 52</div>
        <div>AVANCE {Math.round(scene.fire.spreadRateMh)} m/h · RUMBO {Math.round(scene.fire.headBearingDeg)}°</div>
        <div>
          {scene.counts.houses} CASAS · {scene.counts.people} PERSONAS · {scene.counts.vulnerable} VULNERABLES
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 190,
          fontFamily: FONT.display,
          color: C.text,
          fontSize: 78,
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: -2,
          opacity: titleA,
          transform: `translateY(${(1 - titleA) * 20}px)`,
          maxWidth: 900,
        }}
      >
        Ve el fuego.
        <br />
        <span style={{ color: C.person }}>No ve a la gente.</span>
      </div>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
