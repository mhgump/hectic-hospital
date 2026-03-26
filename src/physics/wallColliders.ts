/**
 * Hospital wall collision layer.
 *
 * 1. `addWallPhysics`  — attaches Havok **static** bodies to every wall mesh
 *    so the engine can be extended with full physics later.
 * 2. `collectWallAABBs` / `resolveWallPenetrations` — lightweight 2-D AABB
 *    overlap test that runs *after* the existing NPC movement each frame and
 *    pushes characters back out of walls.  This avoids touching NPC movement
 *    code while still preventing wall pass-through.
 */

import "@babylonjs/core/Physics/v2/physicsAggregate";

import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// ── Wall AABB (2-D on the ground plane) ──────────────────────────────────────

export interface WallAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Wall mesh names: `<room>_<dir>_<l|r|h>`
const WALL_TAG_RE = /_(n|s|w|e)_(l|r|h)$/;

// ── Havok static bodies (for future full-physics use) ────────────────────────

/**
 * Add Havok static bodies to all hospital wall meshes.
 * Returns { dispose, wallAABBs }.
 */
export function addWallPhysics(scene: Scene): {
  dispose: () => void;
  wallAABBs: WallAABB[];
} {
  const aggregates: PhysicsAggregate[] = [];
  const wallAABBs: WallAABB[] = [];

  for (const mesh of scene.meshes) {
    if (!WALL_TAG_RE.test(mesh.name)) continue;

    // ── Havok static body ──
    const agg = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      { mass: 0, friction: 0.5, restitution: 0 },
      scene,
    );
    aggregates.push(agg);

    // ── 2-D AABB for lightweight collision ──
    // Wall meshes are axis-aligned boxes created by MeshBuilder.CreateBox,
    // so bounding-info min/max gives exact world bounds.
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const min = bi.boundingBox.minimumWorld;
    const max = bi.boundingBox.maximumWorld;

    // Only include wall sections that reach the ground (skip door headers
    // whose bottom edge is above character height).
    if (min.y > 1.0) continue;

    wallAABBs.push({
      minX: min.x,
      maxX: max.x,
      minZ: min.z,
      maxZ: max.z,
    });
  }

  return {
    dispose: () => { for (const a of aggregates) a.dispose(); },
    wallAABBs,
  };
}

// ── Post-movement penetration resolution ─────────────────────────────────────

/**
 * For each `root` in `agents`, check whether the character circle (position +
 * radius) overlaps any wall AABB. If it does, push it out along the axis of
 * minimum penetration.
 *
 * Call this once per frame **after** NPC movement has finished.
 */
export function resolveWallPenetrations(
  agents: { root: TransformNode }[],
  walls: WallAABB[],
  characterRadius: number,
): void {
  for (const agent of agents) {
    const pos = agent.root.position;
    // Multiple iterations for corners where two walls meet.
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      for (const w of walls) {
        pushed = pushOutOfAABB(pos, characterRadius, w) || pushed;
      }
      if (!pushed) break;
    }
  }
}

/**
 * If the circle (pos.x, pos.z, r) overlaps the AABB, push pos out along the
 * shortest penetration axis. Returns true if a push happened.
 */
function pushOutOfAABB(
  pos: Vector3,
  r: number,
  w: WallAABB,
): boolean {
  // Expand the AABB by the character radius.
  const eMinX = w.minX - r;
  const eMaxX = w.maxX + r;
  const eMinZ = w.minZ - r;
  const eMaxZ = w.maxZ + r;

  // Check if the point is inside the expanded AABB.
  if (pos.x <= eMinX || pos.x >= eMaxX || pos.z <= eMinZ || pos.z >= eMaxZ) {
    return false; // no overlap
  }

  // Find the axis with smallest penetration depth and push out.
  const dLeft  = pos.x - eMinX;
  const dRight = eMaxX - pos.x;
  const dTop   = pos.z - eMinZ;
  const dBot   = eMaxZ - pos.z;

  const minD = Math.min(dLeft, dRight, dTop, dBot);

  if (minD === dLeft)       pos.x = eMinX;
  else if (minD === dRight) pos.x = eMaxX;
  else if (minD === dTop)   pos.z = eMinZ;
  else                      pos.z = eMaxZ;

  return true;
}
