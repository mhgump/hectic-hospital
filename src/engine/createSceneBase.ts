import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

export function createSceneBase(engine: Engine): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.06, 0.08, 1);
  return scene;
}



