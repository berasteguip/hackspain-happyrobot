import React from "react";
import { AbsoluteFill, Series, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SCENES, type SceneDef } from "./script";
import { FPS } from "./lib/theme";
import { ColdOpen } from "./scenes/S1ColdOpen";
import { TheCall } from "./scenes/S2TheCall";
import { Scale } from "./scenes/S3Scale";
import { OneHouse } from "./scenes/S4OneHouse";
import { Route } from "./scenes/S5Route";
import { Village } from "./scenes/S6Village";
import { NoAnswer } from "./scenes/S7NoAnswer";
import { Close } from "./scenes/S8Close";

export const SCENE_COMPONENTS: Record<string, React.FC<{ def: SceneDef }>> = {
  "cold-open": ColdOpen,
  "the-call": TheCall,
  scale: Scale,
  "one-house": OneHouse,
  route: Route,
  village: Village,
  "no-answer": NoAnswer,
  close: Close,
};

// Fundido corto entre escenas para que el corte no sea seco.
const Fade: React.FC<{ durationFrames: number; children: React.ReactNode }> = ({ durationFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.round(fps * 0.35);
  const a = interpolate(frame, [0, f, durationFrames - f, durationFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: a }}>{children}</AbsoluteFill>;
};

export const Master: React.FC = () => (
  <AbsoluteFill style={{ background: "#07090f" }}>
    <Series>
      {SCENES.map((def) => {
        const Comp = SCENE_COMPONENTS[def.id];
        const frames = Math.round(def.seconds * FPS);
        return (
          <Series.Sequence key={def.id} durationInFrames={frames} name={def.title}>
            <Fade durationFrames={frames}>
              <Comp def={def} />
            </Fade>
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
