import React from "react";
import { Composition, registerRoot } from "remotion";
import { Master, SCENE_COMPONENTS } from "./Master";
import { SCENES, TOTAL_SECONDS } from "./script";
import { FPS, H, W } from "./lib/theme";

const Root: React.FC = () => (
  <>
    <Composition id="Master" component={Master} durationInFrames={Math.round(TOTAL_SECONDS * FPS)} fps={FPS} width={W} height={H} />
    {/* Cada escena suelta, para iterar sin recorrer todo el vídeo */}
    {SCENES.map((def) => {
      const Comp = SCENE_COMPONENTS[def.id];
      const Wrapped: React.FC = () => <Comp def={def} />;
      return <Composition key={def.id} id={`Scene-${def.id}`} component={Wrapped} durationInFrames={Math.round(def.seconds * FPS)} fps={FPS} width={W} height={H} />;
    })}
  </>
);

registerRoot(Root);
