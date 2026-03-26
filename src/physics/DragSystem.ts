import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Forces } from "./Forces";
import { Tuning } from "../config/tuning";

type GrabEntry = {
  nurseRoot: TransformNode;
  patientId: string;
  patientRoot: TransformNode;
};

/**
 * Spring-follow drag system. Nurse grabs a patient and the patient lerps behind.
 * Integrates with Forces to skip tether updates while a patient is ragdolling.
 *
 * Usage:
 *   const drag = new DragSystem(forces);
 *   drag.attach(nurseId, nurseRoot, patientId, patientRoot);
 *   // each frame:
 *   drag.update(dt);
 *   // on release:
 *   drag.release(nurseId);
 *
 * NOTE: PlayState wires this in. DragSystem only does position math.
 */
export class DragSystem {
  private _forces: Forces;
  private _grabs = new Map<string, GrabEntry>();

  constructor(forces: Forces) {
    this._forces = forces;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  attach(
    nurseId: string,
    nurseRoot: TransformNode,
    patientId: string,
    patientRoot: TransformNode,
  ): void {
    this._grabs.set(nurseId, { nurseRoot, patientId, patientRoot });
  }

  release(nurseId: string): void {
    this._grabs.delete(nurseId);
  }

  isAttached(nurseId: string): boolean {
    return this._grabs.has(nurseId);
  }

  getAttachedPatientId(nurseId: string): string | null {
    return this._grabs.get(nurseId)?.patientId ?? null;
  }

  /**
   * Call once per frame. Moves patient toward the tether point behind the nurse.
   * Skips update while patient is in ragdoll/recovering state.
   */
  update(_dt: number): void {
    for (const [_nurseId, grab] of this._grabs) {
      // Let physics handle the patient while ragdolling
      if (this._forces.isRagdolling(grab.patientId)) continue;

      const nurseRoot = grab.nurseRoot;
      const patientRoot = grab.patientRoot;

      // Tether target: directly behind the nurse based on its yaw rotation
      const nurseYaw = nurseRoot.rotation?.y ?? 0;
      const offsetX = -Math.sin(nurseYaw) * Tuning.nurseTetherOffset;
      const offsetZ = -Math.cos(nurseYaw) * Tuning.nurseTetherOffset;
      const targetPos = new Vector3(
        nurseRoot.position.x + offsetX,
        0,
        nurseRoot.position.z + offsetZ,
      );

      // Spring-follow lerp (migrated from PlayState tether code)
      patientRoot.position.x +=
        (targetPos.x - patientRoot.position.x) * Tuning.dragSpringStiffness;
      patientRoot.position.z +=
        (targetPos.z - patientRoot.position.z) * Tuning.dragSpringStiffness;

      // Face the nurse
      const toNurse = nurseRoot.position.subtract(patientRoot.position);
      toNurse.y = 0;
      if (toNurse.lengthSquared() > 0.01) {
        const yaw = Math.atan2(toNurse.x, toNurse.z);
        patientRoot.rotationQuaternion = null;
        patientRoot.rotation = new Vector3(0, yaw, 0);
      }
    }
  }

  dispose(): void {
    this._grabs.clear();
  }
}
