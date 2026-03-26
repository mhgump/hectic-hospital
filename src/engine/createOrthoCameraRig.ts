import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export type OrthoCameraRig = {
  camera: ArcRotateCamera;
  /** Change the orthographic zoom level (smaller = more zoomed in). */
  setZoom: (halfSize: number) => void;
  getZoom: () => number;
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

  let currentHalfSize = opts.orthoHalfSize;

  const updateOrtho = () => {
    const aspect = opts.engine.getRenderWidth() / opts.engine.getRenderHeight();
    if (aspect >= 1) {
      camera.orthoLeft = -currentHalfSize * aspect;
      camera.orthoRight = currentHalfSize * aspect;
      camera.orthoTop = currentHalfSize;
      camera.orthoBottom = -currentHalfSize;
    } else {
      camera.orthoLeft = -currentHalfSize;
      camera.orthoRight = currentHalfSize;
      camera.orthoTop = currentHalfSize / aspect;
      camera.orthoBottom = -currentHalfSize / aspect;
    }
  };

  updateOrtho();
  const obs: Observer<AbstractEngine> = opts.engine.onResizeObservable.add(updateOrtho);

  // Lock radius — zoom is controlled via ortho half-size, not camera distance.
  camera.lowerRadiusLimit = camera.radius;
  camera.upperRadiusLimit = camera.radius;

  if (opts.betaLimits) {
    camera.lowerBetaLimit = opts.betaLimits.min;
    camera.upperBetaLimit = opts.betaLimits.max;
  }

  opts.scene.activeCamera = camera;

  return {
    camera,
    setZoom(halfSize: number) {
      currentHalfSize = halfSize;
      updateOrtho();
    },
    getZoom() {
      return currentHalfSize;
    },
    teardown() {
      opts.engine.onResizeObservable.remove(obs);
    },
  };
}
