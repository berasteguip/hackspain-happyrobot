import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../lib/theme";
import type { Line } from "../script";

// Subtítulos de las líneas de voz. Cada voz con su estilo para que se
// distinga quién habla sin oírlo. Cuando haya audio, aquí van los <Audio>.
const STYLE: Record<Line["voice"], { color: string; label: string; bg: string }> = {
  system: { color: C.text, label: "SISTEMA", bg: "rgba(7,9,15,0.82)" },
  agent: { color: "#d9d4ff", label: "AGENTE · llamada", bg: "rgba(38,30,80,0.88)" },
  neighbor: { color: "#ffe9c2", label: "VECINA", bg: "rgba(70,45,10,0.88)" },
};

// Duración en pantalla: proporcional al texto, con mínimo.
const holdFor = (text: string) => Math.max(2.4, Math.min(7, text.length / 22));

export const Narration: React.FC<{ lines: Line[]; bottom?: number }> = ({ lines, bottom = 64 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <>
      {lines.map((l) => {
        const start = l.at;
        const end = l.at + holdFor(l.text);
        if (t < start - 0.2 || t > end + 0.3) return null;
        const inA = interpolate(t, [start - 0.2, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const outA = interpolate(t, [end, end + 0.3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const a = Math.min(inA, outA);
        const s = STYLE[l.voice];
        return (
          <div
            key={l.id}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom,
              display: "flex",
              justifyContent: "center",
              opacity: a,
              transform: `translateY(${(1 - a) * 12}px)`,
            }}
          >
            <div
              style={{
                maxWidth: 1240,
                padding: "16px 28px",
                borderRadius: 14,
                background: s.bg,
                border: `1px solid ${C.line}`,
                fontFamily: FONT.ui,
                color: s.color,
                fontSize: 34,
                lineHeight: 1.3,
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              }}
            >
              <div style={{ fontSize: 15, letterSpacing: 3, color: C.textDim, marginBottom: 6, fontFamily: FONT.mono }}>{s.label}</div>
              {l.text}
            </div>
          </div>
        );
      })}
    </>
  );
};
