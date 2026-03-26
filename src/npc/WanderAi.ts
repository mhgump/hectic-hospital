import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PlayerController } from "../player/PlayerController";

export type WanderAiOpts = {
  /** Controller used to move the NPC */
  controller: PlayerController;
  /** Root node position is used to measure arrival */
  root: TransformNode;
  /** Square bounds in X/Z around (0,0,0) to pick targets within */
  halfSize: number;
  /** Minimum seconds to idle between moves */
  idleMinSec: number;
  /** Maximum seconds to idle between moves */
  idleMaxSec: number;
  /** How close is “arrived” (units) */
  arriveDist: number;
  /** NPC move speed scalar (0..1+) */
  speedScale?: number;
};

/**
 * Tiny deterministic-ish “calm wander” AI:
 * - waits a bit
 * - picks a random target in the arena
 * - walks there
 * - repeats
 */
export class WanderAi {
  private state: "idle" | "move" = "idle";
  private idleLeft = 0;
  private target: Vector3 | null = null;
  private readonly speedScale: number;

  constructor(private readonly opts: WanderAiOpts) {
    this.speedScale = opts.speedScale ?? 1.0;
    this.resetIdle();
  }

  update(scene: Scene) {
    const dt = scene.getEngine().getDeltaTime() / 1000;

    if (this.state === "idle") {
      this.idleLeft -= dt;
      if (this.idleLeft <= 0) {
        this.pickNewTarget();
      }
      return;
    }

    if (!this.target) {
      this.state = "idle";
      this.resetIdle();
      return;
    }

    const pos = this.opts.root.position;
    const d2 = Vector3.DistanceSquared(
      new Vector3(pos.x, 0, pos.z),
      new Vector3(this.target.x, 0, this.target.z)
    );
    if (d2 <= this.opts.arriveDist * this.opts.arriveDist) {
      this.state = "idle";
      this.target = null;
      this.resetIdle();
      return;
    }

    // Nudge movement: re-issue target occasionally if we’re blocked/stopped.
    if (!this.opts.controller.isMoving()) {
      this.opts.controller.setMoveTarget(this.target);
    }
  }

  private resetIdle() {
    this.idleLeft = lerp(this.opts.idleMinSec, this.opts.idleMaxSec, Math.random());
  }

  private pickNewTarget() {
    const hs = this.opts.halfSize;
    const tx = lerp(-hs, hs, Math.random());
    const tz = lerp(-hs, hs, Math.random());
    this.target = new Vector3(tx, this.opts.root.position.y, tz);
    this.state = "move";
    this.opts.controller.setMoveTarget(this.target);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}


