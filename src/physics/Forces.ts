import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Tuning } from "../config/tuning";

// Internal type only — not exported
type RagdollEntry = {
  entityId: string;
  root: TransformNode;
  aggregates: PhysicsAggregate[]; // [head, torso, legs]
  bodies: PhysicsBody[];          // [head, torso, legs]
  meshes: Mesh[];
  state: "normal" | "ragdoll" | "recovering";
  timer: number;
};

// Body layout: [head, torso, legs]
// Size: { width, height, depth }
const BODY_SIZES: { width: number; height: number; depth: number }[] = [
  { width: 0.3, height: 0.3, depth: 0.3 }, // head
  { width: 0.4, height: 0.6, depth: 0.3 }, // torso
  { width: 0.4, height: 0.7, depth: 0.3 }, // legs
];

// Y offsets from root position
const BODY_Y_OFFSETS = [1.6, 0.9, 0.35];

/**
 * Ragdoll system for hospital NPCs.
 * Uses Havok Physics v2 for ragdoll bodies (box-limb approach: head, torso, legs).
 * Bodies are kinematic (ANIMATED) by default, switch to DYNAMIC on ragdoll trigger.
 *
 * Usage:
 *   const forces = new Forces(scene);      // after enableHavokPhysics()
 *   forces.register(id, root);
 *   // on hard collision:
 *   forces.triggerRagdoll(id, impactDir.scale(force));
 *   // each frame:
 *   forces.update(dt);
 */
export class Forces {
  private _scene: Scene;
  private _entries = new Map<string, RagdollEntry>();

  constructor(scene: Scene) {
    this._scene = scene;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an entity. Creates 3 Havok bodies (head/torso/legs) in ANIMATED
   * (kinematic) mode. Bodies are invisible until ragdoll triggers.
   */
  register(entityId: string, root: TransformNode): void {
    if (this._entries.has(entityId)) return;

    const aggregates: PhysicsAggregate[] = [];
    const bodies: PhysicsBody[] = [];
    const meshes: Mesh[] = [];

    for (let i = 0; i < 3; i++) {
      const size = BODY_SIZES[i]!;
      const yOffset = BODY_Y_OFFSETS[i]!;
      const partName = ["head", "torso", "legs"][i]!;

      const mesh = MeshBuilder.CreateBox(
        `ragdoll_${partName}_${entityId}`,
        size,
        this._scene,
      );
      mesh.isVisible = false;
      mesh.position = root.position.add(new Vector3(0, yOffset, 0));

      // mass: 0 creates a STATIC body; we'll switch to ANIMATED immediately
      const agg = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.BOX,
        { mass: 0 },
        this._scene,
      );

      // Switch to ANIMATED (kinematic — follows mesh position, pushes others)
      agg.body.setMotionType(PhysicsMotionType.ANIMATED);

      aggregates.push(agg);
      bodies.push(agg.body);
      meshes.push(mesh);
    }

    this._entries.set(entityId, {
      entityId,
      root,
      aggregates,
      bodies,
      meshes,
      state: "normal",
      timer: 0,
    });
  }

  /** Remove entity and dispose its physics bodies. */
  unregister(entityId: string): void {
    const entry = this._entries.get(entityId);
    if (!entry) return;
    for (const agg of entry.aggregates) {
      agg.dispose();
    }
    for (const mesh of entry.meshes) {
      mesh.dispose();
    }
    this._entries.delete(entityId);
  }

  /**
   * Trigger ragdoll on an entity. Called from CharacterPhysics.onCollision
   * when force > Tuning.ragdollThreshold.
   * impactForce: world-space vector (XZ direction used; Y gets a small upward kick).
   */
  triggerRagdoll(entityId: string, impactForce: Vector3): void {
    const entry = this._entries.get(entityId);
    if (!entry || entry.state !== "normal") return;

    // Sync body positions to current root position before going dynamic
    this._syncBodiesToRoot(entry);

    // Switch all bodies to DYNAMIC
    for (const body of entry.bodies) {
      body.setMassProperties({ mass: 1 });
      body.setMotionType(PhysicsMotionType.DYNAMIC);
    }

    // Apply impulse to torso (index 1)
    const torsoBody = entry.bodies[1]!;
    const impulse = new Vector3(impactForce.x, 3.0, impactForce.z);
    torsoBody.applyImpulse(impulse, torsoBody.transformNode.absolutePosition);

    entry.state = "ragdoll";
    entry.timer = Tuning.ragdollDurationSec;
  }

  /** Returns true if entity is currently ragdolling or recovering. */
  isRagdolling(entityId: string): boolean {
    const entry = this._entries.get(entityId);
    return entry !== undefined && entry.state !== "normal";
  }

  /**
   * Call once per frame. Handles:
   * - Syncing root XZ position from torso during ragdoll.
   * - Auto-recovery after ragdollDurationSec.
   * - Lerp recovery during recoverySec.
   */
  update(dt: number): void {
    for (const entry of this._entries.values()) {
      if (entry.state === "ragdoll") {
        // Keep root XZ in sync so other systems (CharacterPhysics, etc.) see the new position
        const torsoPos = entry.bodies[1]!.transformNode.absolutePosition;
        entry.root.position.x = torsoPos.x;
        entry.root.position.z = torsoPos.z;

        entry.timer -= dt;
        if (entry.timer <= 0) {
          entry.state = "recovering";
          entry.timer = Tuning.ragdollRecoverSec;
        }
      } else if (entry.state === "recovering") {
        entry.timer -= dt;
        const t = 1 - Math.max(0, entry.timer / Tuning.ragdollRecoverSec);

        // Lerp each body back toward its standing position
        for (let i = 0; i < entry.bodies.length; i++) {
          const bodyNode = entry.bodies[i]!.transformNode;
          const targetPos = entry.root.position.add(
            new Vector3(0, BODY_Y_OFFSETS[i]!, 0),
          );
          bodyNode.position = Vector3.Lerp(bodyNode.position, targetPos, t * 0.3);
        }

        if (entry.timer <= 0) {
          // Revert to kinematic
          for (const body of entry.bodies) {
            body.setMassProperties({ mass: 0 });
            body.setMotionType(PhysicsMotionType.ANIMATED);
          }
          entry.state = "normal";
        }
      } else {
        // Normal state: keep bodies tracking the root (kinematic follow)
        this._syncBodiesToRoot(entry);
      }
    }
  }

  dispose(): void {
    for (const entry of this._entries.values()) {
      for (const agg of entry.aggregates) {
        agg.dispose();
      }
      for (const mesh of entry.meshes) {
        mesh.dispose();
      }
    }
    this._entries.clear();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _syncBodiesToRoot(entry: RagdollEntry): void {
    for (let i = 0; i < entry.bodies.length; i++) {
      const bodyNode = entry.bodies[i]!.transformNode;
      bodyNode.position.x = entry.root.position.x;
      bodyNode.position.y = BODY_Y_OFFSETS[i]!;
      bodyNode.position.z = entry.root.position.z;
    }
  }
}
