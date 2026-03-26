import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PhysicsEntity, CollisionCallback } from "../hospital/types";
import { Tuning } from "../config/tuning";

/**
 * Kinematic circle-circle collision for hospital NPCs.
 * No Havok — pure position math on the XZ ground plane.
 *
 * Usage:
 *   const physics = new CharacterPhysics();
 *   physics.addEntity(id, root, Tuning.npcColliderRadius, Tuning.defaultMass);
 *   physics.onCollision((a, b, force) => { ... });
 *   // each frame:
 *   physics.update(dt);
 */
export class CharacterPhysics {
  private entities = new Map<string, PhysicsEntity>();
  private prevPositions = new Map<string, Vector3>();
  private callbacks: CollisionCallback[] = [];

  // ─── Public API ────────────────────────────────────────────────────────────

  addEntity(id: string, root: TransformNode, radius: number, mass: number): void {
    this.entities.set(id, {
      id,
      root,
      radius,
      mass,
      velocity: Vector3.Zero(),
      stunTimer: 0,
    });
    this.prevPositions.set(id, root.position.clone());
  }

  removeEntity(id: string): void {
    this.entities.delete(id);
    this.prevPositions.delete(id);
  }

  onCollision(cb: CollisionCallback): void {
    this.callbacks.push(cb);
  }

  getEntity(id: string): PhysicsEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Call once per frame after moving NPCs.
   * 1. Derives velocity from position delta.
   * 2. Separates overlapping circles (mass-weighted).
   * 3. Fires collision callbacks + sets stunTimers on hard impacts.
   */
  update(dt: number): void {
    const entities = Array.from(this.entities.values());
    const safeDt = Math.max(dt, 1e-6);

    // ── Step 1: derive velocity from position delta ──────────────────────────
    for (const e of entities) {
      const prev = this.prevPositions.get(e.id);
      if (prev) {
        e.velocity.x = (e.root.position.x - prev.x) / safeDt;
        e.velocity.y = 0;
        e.velocity.z = (e.root.position.z - prev.z) / safeDt;
      }
      this.prevPositions.set(e.id, e.root.position.clone());
    }

    // ── Step 2: tick stun timers ─────────────────────────────────────────────
    for (const e of entities) {
      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
      }
    }

    // ── Step 3: circle-circle overlap resolution ─────────────────────────────
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!;
        const b = entities[j]!;

        const dx = b.root.position.x - a.root.position.x;
        const dz = b.root.position.z - a.root.position.z;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dz * dz;

        if (distSq >= minDist * minDist || distSq < 1e-12) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        // ── Compute impact force from closing velocity ──────────────────────
        const relVx = b.velocity.x - a.velocity.x;
        const relVz = b.velocity.z - a.velocity.z;
        const closingSpeed = -(relVx * nx + relVz * nz); // positive = approaching
        const impactForce = Math.max(0, closingSpeed) * ((a.mass + b.mass) / 2);

        // ── Separate proportional to mass (heavier = less displacement) ─────
        const totalMass = a.mass + b.mass;
        const pushA = b.mass / totalMass;
        const pushB = a.mass / totalMass;

        a.root.position.x -= nx * overlap * pushA;
        a.root.position.z -= nz * overlap * pushA;
        b.root.position.x += nx * overlap * pushB;
        b.root.position.z += nz * overlap * pushB;

        // ── Stun the lighter entity on hard impact ──────────────────────────
        if (impactForce > Tuning.knockbackThreshold) {
          if (a.mass <= b.mass) {
            a.stunTimer = Math.max(a.stunTimer, Tuning.stunDurationSec);
          }
          if (b.mass <= a.mass) {
            b.stunTimer = Math.max(b.stunTimer, Tuning.stunDurationSec);
          }
        }

        // ── Notify subscribers ──────────────────────────────────────────────
        if (this.callbacks.length > 0) {
          for (const cb of this.callbacks) {
            cb(a.id, b.id, impactForce);
          }
        }
      }
    }
  }

  dispose(): void {
    this.entities.clear();
    this.prevPositions.clear();
    this.callbacks = [];
  }
}
