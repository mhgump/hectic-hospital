import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CharacterPhysics } from "../physics/CharacterPhysics";
import type { Forces } from "../physics/Forces";
import type { HospitalEvent } from "./types";
import { Tuning } from "../config/tuning";

type InjuryCallback = (event: HospitalEvent) => void;

/**
 * Bridge between CharacterPhysics collisions and game-level HospitalEvents.
 * Subscribes to CharacterPhysics.onCollision, triggers ragdolls via Forces,
 * and emits injury events for P1's GameModel to consume.
 *
 * Usage:
 *   const injury = new InjurySystem(physics, forces);
 *   injury.onInjury((event) => model.events.push(event));
 *   // CharacterPhysics.update() fires collisions → InjurySystem handles the rest
 */
export class InjurySystem {
  private _physics: CharacterPhysics;
  private _forces: Forces;
  private _callbacks: InjuryCallback[] = [];

  constructor(physics: CharacterPhysics, forces: Forces) {
    this._physics = physics;
    this._forces = forces;

    this._physics.onCollision(
      (entityA: string, entityB: string, impactForce: number) => {
        this._handleCollision(entityA, entityB, impactForce);
      },
    );
  }

  onInjury(cb: InjuryCallback): void {
    this._callbacks.push(cb);
  }

  dispose(): void {
    this._callbacks = [];
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _handleCollision(
    entityA: string,
    entityB: string,
    impactForce: number,
  ): void {
    // Below knockback threshold — no injury
    if (impactForce < Tuning.knockbackThreshold) return;

    // Determine which entity gets ragdolled (lighter one, or both if equal)
    const a = this._physics.getEntity(entityA);
    const b = this._physics.getEntity(entityB);
    if (!a || !b) return;

    if (impactForce >= Tuning.ragdollThreshold) {
      // Compute impact direction (A → B)
      const dir = b.root.position.subtract(a.root.position);
      dir.y = 0;
      const len = dir.length();
      if (len > 0.001) dir.scaleInPlace(1 / len);

      // Ragdoll the lighter entity (or both if equal mass)
      if (a.mass <= b.mass) {
        this._forces.triggerRagdoll(
          entityA,
          dir.scale(-impactForce * 0.5),
        );
      }
      if (b.mass <= a.mass) {
        this._forces.triggerRagdoll(
          entityB,
          dir.scale(impactForce * 0.5),
        );
      }
    }

    // Emit collision event — severity normalized to [0, 1]
    const severity = Math.min(
      1,
      (impactForce - Tuning.knockbackThreshold) /
        (Tuning.ragdollThreshold - Tuning.knockbackThreshold),
    );

    const event: HospitalEvent = {
      type: "collision",
      sourceId: entityA,
      targetId: entityB,
      severity,
      timestamp: Date.now(),
    };

    for (const cb of this._callbacks) {
      cb(event);
    }
  }
}
