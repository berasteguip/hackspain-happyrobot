import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../lib/theme";

// Fondo del puesto de mando: negro azulado, rejilla tenue y viñeta.
export const Background: React.FC<{ grid?: boolean; children?: React.ReactNode }> = ({ grid = true, children }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {grid && (
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line}22 1px, transparent 1px), linear-gradient(90deg, ${C.line}22 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    )}
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)",
      }}
    />
    {children}
  </AbsoluteFill>
);
