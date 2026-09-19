import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import scene from "../data/scene.json";
import { Background } from "../components/Background";
import { CrisisMap, SyntheticBadge, type HouseState } from "../components/CrisisMap";
import { Narration } from "../components/Narration";
import { curvedRoute, dist, type Pt } from "../lib/geometry";
import { C, FONT } from "../lib/theme";
import type { SceneDef } from "../script";

// Escena 7. Tres casas en negro. Lista de patrulla ordenada por minutos hasta
// el frente menos ETA (con una casa marcada "no ir": el fuego llega antes).
// Mensaje a la Guardia Civil redactado. Ranking de sectores para el
// helicóptero. Y el botón Aprobar pulsado por el operador antes de enviar nada.
export const NoAnswer: React.FC<{ def: SceneDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const fc = scene.fire.center;
  
  // Las 3 casas sin respuesta más cercanas al fuego (las que más importan)
  // Entre las más cercanas al fuego, tres que no se pisen en pantalla
  const nearFire = scene.houses
    .filter((h) => !h.answers)
    .map((h) => ({ ...h, dFire: dist(h, fc) }))
    .sort((a, b) => a.dFire - b.dFire)
    .slice(0, 12);
  const noAns: typeof nearFire = [];
  for (const h of nearFire) {
    if (noAns.every((o) => dist(o, h) > 45)) noAns.push(h);
    if (noAns.length === 3) break;
  }
  const patrol = scene.patrols[0];

  // Tiempos del relato: la más cercana al frente es la que ya no se puede
  // salvar con la patrulla. (En el producto real salen de minutes_to_front y
  // patrol_eta_min de la API.)
  const narrative = [
    { minutesToFront: 11, eta: 14 },
    { minutesToFront: 26, eta: 9 },
    { minutesToFront: 38, eta: 6 },
  ];
  const rows = noAns.map((h, i) => ({ ...h, ...narrative[i], margin: narrative[i].minutesToFront - narrative[i].eta }));
  // Regla: si la patrulla no llega antes que el fuego, NO va (se marca)
  rows.sort((a, b) => b.margin - a.margin);
  const skip = rows.find((r) => r.margin < 0) ?? rows[0];

  const houseStates: Record<string, HouseState> = {};
  scene.houses.forEach((h) => (houseStates[h.id] = h.answers ? "safe" : "unknown"));
  noAns.forEach((h) => (houseStates[h.id] = "no-answer"));

  const blink = 0.55 + 0.45 * Math.abs(Math.sin(t * 3));
  const listIn = rows.map((_, i) => spring({ frame: frame - fps * (3.6 + i * 0.5), fps, config: { damping: 13 } }));
  const msgIn = spring({ frame: frame - fps * 7.5, fps, config: { damping: 14 } });
  const airIn = spring({ frame: frame - fps * 11.5, fps, config: { damping: 14 } });
  const approveAt = 15.0;
  const approved = t >= approveAt;
  const approveIn = spring({ frame: frame - fps * 13.8, fps, config: { damping: 14 } });
  const sentA = interpolate(t, [approveAt, approveAt + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Ruta de patrulla dibujada tras aprobar
  const routes: Record<string, { pts: Pt[]; color: string; progress: number; width?: number }> = {};
  if (approved) {
    const targets = rows.filter((r) => r.id !== skip.id);
    let from: Pt = patrol;
    targets.forEach((r, i) => {
      routes[`pat-${i}`] = { pts: curvedRoute(from, r, 0.12, 1), color: C.patrol, progress: interpolate(t, [approveAt + i * 0.6, approveAt + 0.6 + i * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), width: 4 };
      from = r;
    });
  }

  const cam = { x: 1240, y: 460, zoom: interpolate(t, [0, 3], [1.0, 1.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) };

  return (
    <Background>
      <CrisisMap camera={cam} houseStates={houseStates} routes={routes} showPatrols showSectors={false} highlightSector={null} cone={{ bearingDeg: scene.fire.headBearingDeg - 26, radiusPx: 720, opacity: 0.8 }} fireScale={1.2}>
        {noAns.map((h) => (
          <g key={h.id}>
            <circle cx={h.x} cy={h.y} r={22} fill="none" stroke={C.danger} strokeWidth={2} opacity={blink * 0.8} />
            <circle cx={h.x} cy={h.y} r={38} fill="none" stroke={C.danger} strokeWidth={1} opacity={blink * 0.35} />
          </g>
        ))}
      </CrisisMap>

      {/* Lista de patrulla */}
      <div style={{ position: "absolute", left: 80, top: 100, width: 620, fontFamily: FONT.ui, color: C.text }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: 3, color: C.textDim, marginBottom: 12, opacity: listIn[0] }}>PATRULLA · {patrol.name.toUpperCase()} · orden por margen</div>
        {rows.map((r, i) => {
          const isSkip = r.id === skip.id;
          return (
            <div
              key={r.id}
              style={{
                opacity: listIn[i],
                transform: `translateX(${(1 - listIn[i]) * -30}px)`,
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "12px 14px",
                marginBottom: 8,
                borderRadius: 12,
                background: isSkip ? "rgba(255,59,59,0.08)" : C.bgPanel,
                border: `1px solid ${isSkip ? C.danger : C.line}`,
              }}
            >
              <div style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 700, color: isSkip ? C.danger : C.patrol, width: 40 }}>{isSkip ? "✕" : i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{r.address}</div>
                <div style={{ fontSize: 13, color: C.textDim, fontFamily: FONT.mono }}>
                  {r.residents} persona{r.residents > 1 ? "s" : ""} según censo{r.vulnerable ? " · VULNERABLE" : ""} · 2 intentos sin respuesta
                </div>
              </div>
              <div style={{ textAlign: "right", fontFamily: FONT.mono }}>
                <div style={{ fontSize: 13, color: C.textDim }}>frente {r.minutesToFront} min · ETA {r.eta} min</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: isSkip ? C.danger : C.ok }}>{isSkip ? "NO IR · llega el fuego antes" : `margen ${r.margin} min`}</div>
              </div>
            </div>
          );
        })}

        {/* Mensaje redactado */}
        <div style={{ marginTop: 18, opacity: msgIn, transform: `translateY(${(1 - msgIn) * 16}px)`, padding: 16, borderRadius: 12, background: C.bgPanelSoft, border: `1px solid ${C.line}`, fontFamily: FONT.mono, fontSize: 14, lineHeight: 1.6, color: C.text }}>
          <div style={{ color: C.textDim, fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>SMS + SLACK → {patrol.name} · BORRADOR</div>
          Casas sin respuesta en Losacio, en este orden: {rows.filter((r) => r.id !== skip.id).map((r) => r.address.split(",")[0]).join(" → ")}. No entrar en {skip.address.split(",")[0]}: el frente llega en {skip.minutesToFront} min. Personas esperadas: {rows.filter((r) => r.id !== skip.id).reduce((a, r) => a + r.residents, 0)}.
        </div>

        {/* Botón aprobar */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 16, opacity: approveIn }}>
          <div
            style={{
              padding: "14px 26px",
              borderRadius: 12,
              background: approved ? C.ok : C.human,
              color: approved ? "#04140a" : "#000",
              fontWeight: 700,
              fontSize: 18,
              fontFamily: FONT.ui,
              transform: `scale(${approved ? 0.98 : 1})`,
              boxShadow: approved ? "none" : "0 10px 30px rgba(255,255,255,0.18)",
            }}
          >
            {approved ? "✓ APROBADO · ENVIADO" : "APROBAR ENVÍO"}
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.textDim, letterSpacing: 1.5 }}>
            OPERADOR · CECOPI
            <br />
            nada sale sin una persona
          </div>
          <div style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 13, color: C.ok, opacity: sentA }}>
            SMS entregado 17:09:41
            <br />
            #cecopi-losacio publicado
          </div>
        </div>
      </div>

      {/* Ranking aéreo */}
      <div style={{ position: "absolute", right: 80, top: 100, width: 380, opacity: airIn, transform: `translateX(${(1 - airIn) * 30}px)`, fontFamily: FONT.ui, color: C.text }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: 3, color: C.textDim, marginBottom: 12 }}>MEDIOS AÉREOS · prioridad por gente dentro</div>
        {[
          { s: "Sector 2 · Losacio oeste", people: 41, vul: 6, rank: 1 },
          { s: "Sector 4 · Ferreruela sur", people: 18, vul: 2, rank: 2 },
          { s: "Sector 1 · sin población", people: 0, vul: 0, rank: 4 },
        ].map((r) => (
          <div key={r.s} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", marginBottom: 6, borderRadius: 10, background: r.rank === 1 ? "rgba(255,210,63,0.10)" : C.bgPanel, border: `1px solid ${r.rank === 1 ? C.patrol : C.line}` }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 20, fontWeight: 700, color: r.rank === 1 ? C.patrol : C.textDim, width: 28 }}>{r.rank}</div>
            <div style={{ flex: 1, fontSize: 15 }}>{r.s}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.textDim }}>
              {r.people} p · {r.vul} vul
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, fontFamily: FONT.mono, fontSize: 12, color: C.textDim, letterSpacing: 1.5 }}>El helicóptero descarga donde hay gente, no donde arde más.</div>
      </div>

      <SyntheticBadge />
      <Narration lines={def.lines} />
    </Background>
  );
};
