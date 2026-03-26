import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type PlayerControllerOpts = {
  root: TransformNode;
  moveSpeed: number; // units/sec
  /** How close to a target before stopping (units). */
  arrivalThreshold?: number;
};

export type CircleObstacle = {
  /** Center on ground plane (y ignored) */
  center: Vector3;
  /** Radius on ground plane */
  radius: number;
};

export class PlayerController {
  private readonly root: TransformNode;
  private readonly moveSpeed: number;
  private readonly arrivalThreshold: number;
  private moveTarget: Vector3 | null = null;
  private moveDir: Vector3 | null = null;

  private obstacles: CircleObstacle[] = [];
  private playerRadius = 0.35;
  private movedLastFrame = false;

  constructor(opts: PlayerControllerOpts) {
    this.root = opts.root;
    this.moveSpeed = opts.moveSpeed;
    this.arrivalThreshold = opts.arrivalThreshold ?? 0.05;
  }

  /** Configure simple 2D circle colliders on the ground plane. */
  setColliders(opts: { obstacles: CircleObstacle[]; playerRadius: number }) {
    this.obstacles = opts.obstacles;
    this.playerRadius = opts.playerRadius;
  }

  /** True if the player actually moved during the most recent update() call. */
  isMoving(): boolean {
    return this.movedLastFrame;
  }

  /** Read-only position snapshot (useful for E2E/debug). */
  getPosition(): Vector3 {
    return this.root.position.clone();
  }

  setMoveTarget(worldPos: Vector3) {
    const candidate = worldPos.clone();
    candidate.y = this.root.position.y;
    this.moveTarget = this.projectTargetOutOfObstacles(candidate);
    this.moveDir = null;
  }

  setMoveDirection(dir: Vector3 | null) {
    this.moveDir = dir ? dir.clone() : null;
    if (this.moveDir) {
      this.moveDir.y = 0;
      if (this.moveDir.lengthSquared() > 0) {
        this.moveDir.normalize();
      }
    }
    if (this.moveDir) {
      this.moveTarget = null;
    }
  }

  update(scene: Scene) {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    this.movedLastFrame = false;

    if (this.moveDir && this.moveDir.lengthSquared() > 0) {
      const prev = this.root.position.clone();
      const step = this.moveSpeed * dt;
      const next = this.root.position.add(this.moveDir.scale(step));
      const resolved = this.resolveCollisions(next);
      this.root.position.copyFrom(resolved);
      this.movedLastFrame = Vector3.DistanceSquared(prev, resolved) > 1e-8;

      const yaw = Math.atan2(this.moveDir.x, this.moveDir.z);
      this.root.rotationQuaternion = null;
      this.root.rotation = new Vector3(0, yaw, 0);
      return;
    }

    if (!this.moveTarget) return;

    // IMPORTANT: root.position is a mutable Vector3 instance. Capture a snapshot before mutating it.
    const prevPos = this.root.position.clone();
    const to = this.moveTarget.subtract(prevPos);
    to.y = 0;

    const dist = to.length();
    if (dist < this.arrivalThreshold) {
      this.moveTarget = null;
      return;
    }

    const dir = to.scale(1 / Math.max(dist, 1e-6));
    const step = Math.min(dist, this.moveSpeed * dt);
    const next = prevPos.add(dir.scale(step));
    const resolved = this.resolveCollisions(next);
    this.root.position.copyFrom(resolved);
    this.movedLastFrame = Vector3.DistanceSquared(prevPos, resolved) > 1e-8;

    // If we couldn't move (blocked), stop target movement to avoid jitter.
    if (Vector3.DistanceSquared(prevPos, resolved) < 1e-10) {
      this.moveTarget = null;
    }

    // Face movement direction.
    const yaw = Math.atan2(dir.x, dir.z);
    this.root.rotationQuaternion = null;
    this.root.rotation = new Vector3(0, yaw, 0);
  }

  private resolveCollisions(candidate: Vector3): Vector3 {
    if (this.obstacles.length === 0) return candidate;

    // Only ground-plane collision.
    const out = candidate.clone();
    out.y = this.root.position.y;

    // A few iterations to handle overlapping multiple obstacles.
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      for (const o of this.obstacles) {
        const dx = out.x - o.center.x;
        const dz = out.z - o.center.z;
        const r = o.radius + this.playerRadius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;

        const d = Math.sqrt(Math.max(d2, 1e-12));
        const nx = dx / d;
        const nz = dz / d;
        out.x = o.center.x + nx * r;
        out.z = o.center.z + nz * r;
        pushed = true;
      }
      if (!pushed) break;
    }
    return out;
  }

  private projectTargetOutOfObstacles(candidate: Vector3): Vector3 {
    if (this.obstacles.length === 0) return candidate;

    // If the target is inside an obstacle, push it out to the nearest valid point.
    let out = candidate.clone();
    out.y = this.root.position.y;
    for (const o of this.obstacles) {
      const dx = out.x - o.center.x;
      const dz = out.z - o.center.z;
      const r = o.radius + this.playerRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(Math.max(d2, 1e-12));
      const nx = dx / d;
      const nz = dz / d;
      out.x = o.center.x + nx * r;
      out.z = o.center.z + nz * r;
    }
    return out;
  }
}



