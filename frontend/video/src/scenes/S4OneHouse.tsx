import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge } from "../components/CrisisMap";
import { ExtractPanel, HRCard, Transcript } from "../components/HappyRobotUI";
import { Narration } from "../components/Narration";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 4. Una casa. Izquierda: la conversación y el Extract rellenándose.
// Derecha: en el mapa el punto pasa de "1" a un grupo de 3 con la velocidad
// del más lento. Es donde vive el producto: la información que saca la
// conversación cambia la física de la evacuación.
export const OneHouse: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const hero = scene.hero;

  const turns = [
    { who: "agent" as const, text: def.lines[0].text },
    { who: "neighbor" as const, text: def.lines[1].text },
    { who: "agent" as const, text: "Entendido. Tres personas, una con noventa y uno. ¿Tienen coche?" },
    { who: "neighbor" as const, text: "No, el coche lo tiene mi hijo en Zamora." },
  ];
  const visible = interpolate(t, [0.3, 0.31, 2.8, 2.81, 7.5, 7.51, 10.5, 10.51], [0, 1, 1, 2, 2, 3, 3, 4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lastIdx = Math.ceil(visible) - 1;
  const lastStart = [0.3, 2.8, 7.5, 10.5][lastIdx] ?? 0;
  const typed = lastIdx >= 0 ? Math.floor(interpolate(t, [lastStart, lastStart + 2.2], [0, turns[lastIdx].text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) : 0;

  const fields = [
    { k: "answered", v: "true", color: C.ok },
    { k: "people_at_home", v: "3" },
    { k: "ages", v: "[72, 91, 9]" },
    { k: "mobility", v: '"reduced"', color: C.warn },
    { k: "has_car", v: "false", color: C.danger },
    { k: "will_evacuate", v: "true", color: C.ok },
    { k: "group_speed_kmh", v: "2.5", color: C.warn },
  ];
  const filled = Math.floor(interpolate(t, [4.0, 5.5, 6.0, 6.5, 12.5, 13.0, 13.5], [0, 2, 3, 4, 5, 6, 7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  // Mapa: zoom fuerte en la casa; a los 6.5 s el punto se convierte en grupo
  const groupIn = spring({ frame: frame - fps * 6.5, fps, config: { damping: 12 } });
  const speedIn = spring({ frame: frame - fps * 9.0, fps, config: { damping: 14 } });
  const cam = { x: hero.x - 150, y: hero.y + 30, zoom: 2.6 };
  // Posición en pantalla de la casa con esa cámara
  const hx = 960 + (hero.x - cam.x) * cam.zoom;
  const hy = 540 + (hero.y - cam.y) * cam.zoom;

  // Posiciones de los 3 miembros del grupo alrededor de la casa (en px de mapa)
  const members = [
    { dx: 0, dy: 0, r: 9, col: C.person, tag: "72" },
    { dx: -16, dy: 10, r: 8, col: C.warn, tag: "91" },
    { dx: 15, dy: 11, r: 6, col: C.person, tag: "9" },
  ];

  return (
    <Background>
      <CrisisMap camera={cam} houseStates={{ [hero.houseId]: "answered" }} labels={false} showShelters={false} cone={{ bearingDeg: scene.fire.headBearingDeg, radiusPx: 620, opacity: 0.5 }}>
        {/* El grupo: tres puntos que salen del punto de la casa */}
        <g>
          {members.map((m, i) => (
            <g key={i} opacity={groupIn}>
              <circle cx={hero.x + m.dx * groupIn} cy={hero.y + m.dy * groupIn} r={m.r / 2.6} fill={m.col} />
            </g>
          ))}
          <circle cx={hero.x} cy={hero.y + 4} r={22 / 2.6 + 12 * groupIn} fill="none" stroke={C.person} strokeWidth={1} opacity={0.6 * groupIn} strokeDasharray="3 3" />
        </g>
      </CrisisMap>

      {/* Etiqueta del grupo, en HTML sobre el mapa (posición de pantalla) */}
      <div
        style={{
          position: "absolute",
          left: hx + 60,
          top: hy - 30,
          opacity: speedIn,
          transform: `translateY(${(1 - speedIn) * 10}px)`,
          fontFamily: FONT.mono,
          color: C.text,
          fontSize: 16,
          background: "rgba(7,9,15,0.85)",
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: "10px 14px",
          lineHeight: 1.7,
        }}
      >
        <div style={{ color: C.person, fontSize: 13, letterSpacing: 2 }}>GRUPO {hero.houseId.toUpperCase()} · 3 PERSONAS</div>
        <div>
          velocidad del grupo <span style={{ color: C.warn, fontWeight: 700 }}>2,5 km/h</span> <span style={{ color: C.textDim }}>(la más lenta: 91 años)</span>
        </div>
        <div>
          a pie · sin coche · <span style={{ color: C.danger }}>prioridad alta</span>
        </div>
      </div>

      <HRCard title={`Run · ${hero.houseId} · ${hero.name}`} status="Llamada · 01:12" x={80} y={120} w={720}>
        <Transcript turns={turns} visible={visible} typingChars={typed} />
        <div style={{ height: 16 }} />
        <ExtractPanel fields={fields} filled={filled} />
      </HRCard>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
