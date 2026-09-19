import React from "react";
import { C, FONT } from "../lib/theme";

// Mockup de la UI de HappyRobot: tarjeta de conversación (Run) con la
// transcripción en vivo y el panel de AI Extract rellenándose. Claro, para
// contrastar con el mapa oscuro y que se lea "esto es la plataforma".

export type Turn = { who: "agent" | "neighbor"; text: string };

export const HRCard: React.FC<{
  title: string;
  status?: string;
  x: number;
  y: number;
  w?: number;
  scale?: number;
  opacity?: number;
  children?: React.ReactNode;
}> = ({ title, status = "En curso", x, y, w = 560, scale = 1, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      opacity,
      background: C.hrPanel,
      border: `1px solid ${C.hrBorder}`,
      borderRadius: 16,
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      fontFamily: FONT.ui,
      color: C.hrText,
      overflow: "hidden",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.hrBorder}`, background: C.hrBg }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: C.hrAccent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 700 }}>
        hr
      </div>
      <div style={{ fontWeight: 600, fontSize: 17, flex: 1 }}>{title}</div>
      <div style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, background: C.hrAccentSoft, color: C.hrAccent, fontWeight: 600 }}>{status}</div>
    </div>
    <div style={{ padding: 18 }}>{children}</div>
  </div>
);

export const Transcript: React.FC<{ turns: Turn[]; visible: number; typingChars?: number }> = ({ turns, visible, typingChars }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {turns.slice(0, Math.ceil(visible)).map((t, i) => {
      const isLast = i === Math.ceil(visible) - 1;
      const txt = isLast && typingChars !== undefined ? t.text.slice(0, typingChars) : t.text;
      const agent = t.who === "agent";
      return (
        <div key={i} style={{ display: "flex", justifyContent: agent ? "flex-start" : "flex-end" }}>
          <div
            style={{
              maxWidth: "82%",
              padding: "10px 14px",
              borderRadius: 14,
              background: agent ? C.hrAccentSoft : "#f1f2f6",
              color: C.hrText,
              fontSize: 17,
              lineHeight: 1.35,
              borderBottomLeftRadius: agent ? 4 : 14,
              borderBottomRightRadius: agent ? 14 : 4,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: agent ? C.hrAccent : C.hrTextDim, marginBottom: 4, fontFamily: FONT.mono }}>
              {agent ? "AGENTE" : "VECINA"}
            </div>
            {txt}
            {isLast && typingChars !== undefined && typingChars < t.text.length && <span style={{ opacity: 0.5 }}>▍</span>}
          </div>
        </div>
      );
    })}
  </div>
);

// Panel de AI Extract: JSON que se va rellenando campo a campo.
export const ExtractPanel: React.FC<{ fields: { k: string; v: string; color?: string }[]; filled: number }> = ({ fields, filled }) => (
  <div style={{ fontFamily: FONT.mono, fontSize: 15, background: "#0f1320", color: "#cfd6ea", borderRadius: 12, padding: "14px 16px", lineHeight: 1.7 }}>
    <div style={{ color: C.hrTextDim, fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>AI EXTRACT · calls/outcome</div>
    <div>{"{"}</div>
    {fields.map((f, i) => {
      const on = i < filled;
      return (
        <div key={f.k} style={{ paddingLeft: 18, opacity: on ? 1 : 0.25 }}>
          <span style={{ color: "#8fb4ff" }}>"{f.k}"</span>: <span style={{ color: on ? f.color ?? "#ffd28a" : "#666" }}>{on ? f.v : "null"}</span>
          {i < fields.length - 1 ? "," : ""}
        </div>
      );
    })}
    <div>{"}"}</div>
  </div>
);

// Contador grande del HUD (llamadas en paralelo, personas localizadas...)
export const Stat: React.FC<{ label: string; value: string | number; color?: string; x: number; y: number; small?: boolean }> = ({ label, value, color = C.text, x, y, small }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: FONT.ui }}>
    <div style={{ fontSize: small ? 12 : 14, letterSpacing: 3, color: C.textDim, fontFamily: FONT.mono }}>{label}</div>
    <div style={{ fontSize: small ? 40 : 64, fontWeight: 700, color, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

// Registro de decisiones del sistema, escribiéndose.
export const DecisionLog: React.FC<{ entries: { t: string; text: string; color?: string }[]; visible: number; x: number; y: number; w?: number }> = ({ entries, visible, x, y, w = 520 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, fontFamily: FONT.mono, fontSize: 15, color: C.text }}>
    <div style={{ fontSize: 12, letterSpacing: 3, color: C.textDim, marginBottom: 10 }}>DECISION LOG</div>
    {entries.slice(0, visible).map((e, i) => (
      <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.line}`, opacity: i === visible - 1 ? 1 : 0.7 }}>
        <span style={{ color: C.textDim, minWidth: 54 }}>{e.t}</span>
        <span style={{ color: e.color ?? C.text }}>{e.text}</span>
      </div>
    ))}
  </div>
);
