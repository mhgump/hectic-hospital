import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export type OrthoCameraRig = {
  camera: ArcRotateCamera;
  teardown: () => void;
};

export function createOrthoArcRotateCameraRig(opts: {
  engine: AbstractEngine;
  scene: Scene;
  target: Vector3;
  alpha: number;
  beta: number;
  radius: number;
  orthoHalfSize: number;
  /** Clamp beta to keep tilt readable. */
  betaLimits?: { min: number; max: number };
}): OrthoCameraRig {
  const camera = new ArcRotateCamera(
    "camera",
    opts.alpha,
    opts.beta,
    opts.radius,
    opts.target,
    opts.scene
  );

  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

  const updateOrtho = () => {
    const aspect = opts.engine.getRenderWidth() / opts.engine.getRenderHeight();
    const arenaHalfSize = opts.orthoHalfSize;
    if (aspect >= 1) {
      camera.orthoLeft = -arenaHalfSize * aspect;
      camera.orthoRight = arenaHalfSize * aspect;
      camera.orthoTop = arenaHalfSize;
      camera.orthoBottom = -arenaHalfSize;
    } else {
      camera.orthoLeft = -arenaHalfSize;
      camera.orthoRight = arenaHalfSize;
      camera.orthoTop = arenaHalfSize / aspect;
      camera.orthoBottom = -arenaHalfSize / aspect;
    }
  };

  updateOrtho();
  const obs: Observer<AbstractEngine> = opts.engine.onResizeObservable.add(updateOrtho);

  // Lock zoom (radius), but allow rotation via drag-to-look.
  camera.lowerRadiusLimit = camera.radius;
  camera.upperRadiusLimit = camera.radius;

  if (opts.betaLimits) {
    camera.lowerBetaLimit = opts.betaLimits.min;
    camera.upperBetaLimit = opts.betaLimits.max;
  }

  opts.scene.activeCamera = camera;

  return {
    camera,
    teardown() {
      opts.engine.onResizeObservable.remove(obs);
    },
  };
}


