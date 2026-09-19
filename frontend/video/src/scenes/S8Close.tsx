import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge, type HouseState } from "../components/CrisisMap";
import { Narration } from "../components/Narration";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 8. Todos los puntos dentro de los refugios, contadores finales en
// grande y el cierre. Sin "no habría habido muertos": los datos y que lo diga
// el jurado.
export const Close: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const houseStates: Record<string, HouseState> = {};
  scene.houses.forEach((h) => (houseStates[h.id] = h.answers ? "safe" : "no-answer"));

  const dim = interpolate(t, [0, 2.5], [1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stats = [
    { label: "PERSONAS GUIADAS", value: `${scene.counts.people}`, color: C.route },
    { label: "MARGEN MÍNIMO SOBRE EL FRENTE", value: "23 min", color: C.person },
    { label: "CASAS ESCALADAS A PATRULLA", value: `${Math.min(3, scene.counts.noAnswer)}`, color: C.patrol },
    { label: "DECISIONES CON MOTIVO REGISTRADO", value: "412", color: C.text },
  ];
  const ins = stats.map((_, i) => spring({ frame: frame - fps * (1.0 + i * 0.45), fps, config: { damping: 14 } }));
  const titleIn = spring({ frame: frame - fps * 5.6, fps, config: { damping: 16 } });
  const teamIn = interpolate(t, [8.0, 9.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Background>
      <div style={{ position: "absolute", inset: 0, opacity: dim }}>
        <CrisisMap camera={{ x: 1120, y: 470, zoom: 1.0 }} houseStates={houseStates} shelterFill={{ [scene.shelters[0].id]: 0.71, [scene.shelters[1].id]: 0.38 }} cone={{ bearingDeg: scene.fire.headBearingDeg - 26, radiusPx: 720, opacity: 0.5 }} fireScale={1.25} />
      </div>

      <div style={{ position: "absolute", left: 80, top: 120, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px 60px", width: 1000 }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ opacity: ins[i], transform: `translateY(${(1 - ins[i]) * 18}px)`, fontFamily: FONT.ui }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: 3, color: C.textDim }}>{s.label}</div>
            <div style={{ fontSize: 84, fontWeight: 700, color: s.color, lineHeight: 1.05, letterSpacing: -2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 80, bottom: 200, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 16}px)`, fontFamily: FONT.display, color: C.text, fontSize: 64, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05 }}>
        Sabemos dónde está cada persona.
        <br />
        <span style={{ color: C.route }}>Y la sacamos.</span>
      </div>

      <div style={{ position: "absolute", right: 80, bottom: 200, textAlign: "right", opacity: teamIn, fontFamily: FONT.mono, color: C.textDim, fontSize: 16, letterSpacing: 3, lineHeight: 2 }}>
        <div style={{ color: C.text, fontSize: 22 }}>ROUTER123</div>
        <div>HACKSPAIN 2026 · TRACK HAPPYROBOT</div>
        <div>datos sintéticos · calles reales · rutas reales</div>
      </div>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
