// ───────────────────────────────────────────────────────────────────────────────
// Havok-based character colliders
// ───────────────────────────────────────────────────────────────────────────────
// Attaches DYNAMIC physics bodies to character TransformNodes so Havok resolves
// overlaps automatically. Characters are moved via setLinearVelocity(); the
// physics engine handles collision response each step.

import "@babylonjs/core/Physics/v2/physicsEngineComponent";

import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeCylinder } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export interface CharacterBodyOpts {
  radius: number;
  height: number;
  mass: number;
}

const DEFAULT_OPTS: CharacterBodyOpts = {
  radius: 0.4,
  height: 1.7,
  mass: 1.0,
};

/**
 * Create a DYNAMIC cylinder physics body on a character root node.
 * Gravity is disabled; rotation is heavily damped so characters stay upright.
 */
export function createCharacterBody(
  root: TransformNode,
  scene: Scene,
  opts: Partial<CharacterBodyOpts> = {},
): PhysicsBody {
  const { radius, height, mass } = { ...DEFAULT_OPTS, ...opts };

  const body = new PhysicsBody(root, PhysicsMotionType.DYNAMIC, false, scene);

  const shape = new PhysicsShapeCylinder(
    new Vector3(0, 0, 0),
    new Vector3(0, height, 0),
    radius,
    scene,
  );
  shape.material = { friction: 0.5, restitution: 0 };

  body.shape = shape;
  body.setMassProperties({ mass });
  body.setGravityFactor(0);
  body.setAngularDamping(10000);
  body.setLinearDamping(4);

  return body;
}

/** Dispose a character body and its shape. */
export function disposeCharacterBody(body: PhysicsBody): void {
  body.shape?.dispose();
  body.dispose();
}
