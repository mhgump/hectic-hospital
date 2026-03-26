import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type SpawnObstacle = {
  center: Vector3;
  radius: number;
};

export function sampleRandomPositions(opts: {
  count: number;
  halfSize: number;
  halfSizeX?: number;
  halfSizeZ?: number;
  minDistBetween: number;
  minDistFromOrigin: number;
  obstacles: SpawnObstacle[];
  obstacleClearance: number;
  existing: Vector3[];
  /** Optional RNG for determinism (e.g. E2E tests). Must return [0, 1). */
  rng?: () => number;
}): Vector3[] {
  const out: Vector3[] = [];
  const attemptsMax = Math.max(200, opts.count * 60);
  const minBetween2 = opts.minDistBetween * opts.minDistBetween;
  const minOrigin2 = opts.minDistFromOrigin * opts.minDistFromOrigin;

  const rng = opts.rng ?? Math.random;
  const rand = (min: number, max: number) => min + rng() * (max - min);
  const halfX = opts.halfSizeX ?? opts.halfSize;
  const halfZ = opts.halfSizeZ ?? opts.halfSize;

  const ok = (p: Vector3): boolean => {
    // Avoid player spawn (assumed origin for now).
    if (p.x * p.x + p.z * p.z < minOrigin2) return false;

    // Avoid obstacles.
    for (const o of opts.obstacles) {
      const dx = p.x - o.center.x;
      const dz = p.z - o.center.z;
      const r = o.radius + opts.obstacleClearance;
      if (dx * dx + dz * dz < r * r) return false;
    }

    // Avoid other new points.
    for (const q of out) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      if (dx * dx + dz * dz < minBetween2) return false;
    }

    // Avoid existing spawned points.
    for (const q of opts.existing) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      if (dx * dx + dz * dz < minBetween2) return false;
    }

    return true;
  };

  for (let i = 0; i < attemptsMax && out.length < opts.count; i++) {
    const p = new Vector3(rand(-halfX, halfX), 0, rand(-halfZ, halfZ));
    if (ok(p)) out.push(p);
  }

  return out;
}

