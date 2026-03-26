import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

function computeMeshesBounds(meshes: AbstractMesh[]): {
  min: Vector3;
  max: Vector3;
  size: Vector3;
} {
  let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bb.minimumWorld);
    max = Vector3.Maximize(max, bb.maximumWorld);
  }
  return { min, max, size: max.subtract(min) };
}

/**
 * Babylon-native way to move/scale an entire loaded model container reliably,
 * regardless of internal parenting/hierarchy.
 */
export function createRootForContainer(container: AssetContainer, name: string): TransformNode {
  container.addAllToScene();
  const rootMesh = container.createRootMesh();
  rootMesh.name = name;
  return rootMesh;
}

/**
 * Normalize a container root in world space:
 * - scales so max(X,Z) matches desiredMaxSizeXZ
 * - optionally centers in X/Z
 * - lifts so the lowest point sits at desiredMinY
 */
export function normalizeRootToWorld(opts: {
  root: TransformNode;
  meshes: AbstractMesh[];
  desiredMaxSizeXZ: number;
  desiredMinY: number;
  centerXZ: boolean;
}) {
  const { root, meshes } = opts;
  if (meshes.length === 0) return;

  const before = computeMeshesBounds(meshes);
  const maxSize = Math.max(before.size.x, before.size.z);
  if (maxSize > 0.0001) {
    const s = opts.desiredMaxSizeXZ / maxSize;
    root.scaling.scaleInPlace(s);
  }

  const after = computeMeshesBounds(meshes);
  const offset = new Vector3(0, 0, 0);
  if (opts.centerXZ) {
    offset.x = -(after.min.x + after.max.x) * 0.5;
    offset.z = -(after.min.z + after.max.z) * 0.5;
  }
  offset.y = opts.desiredMinY - after.min.y;

  root.position.addInPlace(offset);
}

/**
 * Normalize a container root within its parent space:
 * - scales so height (Y) matches desiredHeightY
 * - lifts so the lowest point sits at desiredMinY
 */
export function normalizeRootToParent(opts: {
  root: TransformNode;
  meshes: AbstractMesh[];
  desiredHeightY: number;
  desiredMinY: number;
}) {
  const { root, meshes } = opts;
  if (meshes.length === 0) return;

  const before = computeMeshesBounds(meshes);
  const height = before.size.y;
  if (height > 0.0001) {
    const s = opts.desiredHeightY / height;
    root.scaling.scaleInPlace(s);
  }

  const after = computeMeshesBounds(meshes);
  root.position.y += opts.desiredMinY - after.min.y;
}


