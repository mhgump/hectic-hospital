import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

export const enum CharacterAnimState {
  IDLE,
  WALK,
  STUNNED,
  RAGDOLL,
  GRABBED,
  RECOVERING,
}

export type CharacterAnimatorOpts = {
  root: TransformNode;
  idle?: AnimationGroup;
  walk?: AnimationGroup;
};

/**
 * Character animation state machine.
 * Handles transitions: IDLE ↔ WALK → STUNNED → RAGDOLL → RECOVERING → IDLE
 * Works with or without P2 AnimationGroups — falls back to transform-based fakes.
 *
 * Usage:
 *   const anim = new CharacterAnimator({ root });
 *   anim.setState(CharacterAnimState.WALK);
 *   // each frame:
 *   anim.update(dt);
 */
export class CharacterAnimator {
  private readonly _root: TransformNode;
  private readonly _idle: AnimationGroup | null;
  private readonly _walk: AnimationGroup | null;
  private _state = CharacterAnimState.IDLE;
  private _elapsed = 0;

  // Saved root rotation for restoring after stunned/ragdoll tilt
  private _baseRotationX = 0;
  private _baseRotationZ = 0;

  constructor(opts: CharacterAnimatorOpts) {
    this._root = opts.root;
    this._idle = opts.idle ?? null;
    this._walk = opts.walk ?? null;
    this._idle?.start(true);
  }

  get state(): CharacterAnimState {
    return this._state;
  }

  setState(next: CharacterAnimState): void {
    if (next === this._state) return;

    const prev = this._state;
    this._state = next;
    this._elapsed = 0;

    // Stop previous animation-group playback
    this._stopAnims();

    // Restore root tilt from any transform-based fake
    this._resetTilt();

    switch (next) {
      case CharacterAnimState.IDLE:
        this._idle?.start(true);
        break;

      case CharacterAnimState.WALK:
        this._walk?.start(true);
        break;

      case CharacterAnimState.STUNNED:
        // Stun tilt applied in update()
        break;

      case CharacterAnimState.RAGDOLL:
        // Forces system takes full control of the body
        this._stopAnims();
        break;

      case CharacterAnimState.GRABBED:
        // Slight forward lean applied in update()
        break;

      case CharacterAnimState.RECOVERING:
        // Lerp back to standing in update()
        break;
    }
  }

  /** Convenience: set IDLE or WALK based on a moving flag. */
  setMoving(moving: boolean): void {
    if (moving && this._state === CharacterAnimState.IDLE) {
      this.setState(CharacterAnimState.WALK);
    } else if (!moving && this._state === CharacterAnimState.WALK) {
      this.setState(CharacterAnimState.IDLE);
    }
  }

  /**
   * Call once per frame. Drives transform-based fake animations
   * when P2 AnimationGroups are not available.
   */
  update(dt: number): void {
    this._elapsed += dt;

    // Ensure rotationQuaternion is null so euler rotation works
    this._root.rotationQuaternion = null;

    switch (this._state) {
      case CharacterAnimState.IDLE:
        if (!this._idle) {
          // Subtle idle bob
          this._root.position.y = Math.sin(this._elapsed * 2) * 0.03;
        }
        break;

      case CharacterAnimState.WALK:
        if (!this._walk) {
          // Walk bob + slight forward lean
          this._root.position.y = Math.abs(Math.sin(this._elapsed * 8)) * 0.06;
          this._root.rotation.x = this._baseRotationX + 0.05;
        }
        break;

      case CharacterAnimState.STUNNED:
        // Tilt sideways
        this._root.rotation.z =
          this._baseRotationZ + Math.sin(this._elapsed * 6) * 0.3;
        break;

      case CharacterAnimState.RAGDOLL:
        // Forces system handles position — nothing to do here
        break;

      case CharacterAnimState.GRABBED: {
        // Forward lean while being dragged
        this._root.rotation.x = this._baseRotationX + 0.15;
        // Slight side sway
        this._root.rotation.z =
          this._baseRotationZ + Math.sin(this._elapsed * 3) * 0.08;
        break;
      }

      case CharacterAnimState.RECOVERING: {
        // Lerp tilt back to zero
        const t = Math.min(1, this._elapsed * 3);
        this._root.rotation.x =
          this._baseRotationX * (1 - t);
        this._root.rotation.z =
          this._baseRotationZ * (1 - t);
        this._root.position.y *= 1 - t;
        break;
      }
    }
  }

  dispose(): void {
    this._idle?.dispose();
    this._walk?.dispose();
    this._resetTilt();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _stopAnims(): void {
    this._idle?.stop();
    this._walk?.stop();
  }

  private _resetTilt(): void {
    if (!this._root.rotationQuaternion) {
      this._root.rotation.x = this._baseRotationX;
      this._root.rotation.z = this._baseRotationZ;
    }
    this._root.position.y = 0;
  }
}
