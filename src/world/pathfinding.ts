/**
 * A* pathfinding over the hospital waypoint graph.
 *
 * The graph is tiny (~15 nodes) so performance is a non-issue; this runs in
 * microseconds. The public API returns an ordered array of Vector3 positions
 * the NPC should walk through to reach the destination.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Waypoint } from "../hospital/types";

/**
 * Compute a path from `start` to `goal` through the waypoint graph.
 *
 * @returns Ordered list of world positions to walk through (excluding the
 *          start position, including the final goal position). Returns `[goal]`
 *          if no graph path is found (straight-line fallback).
 */
export function findPath(
  waypointMap: Map<string, Waypoint>,
  start: Vector3,
  goal: Vector3,
): Vector3[] {
  const startWp = nearestWaypoint(waypointMap, start);
  const goalWp = nearestWaypoint(waypointMap, goal);

  if (startWp.id === goalWp.id) {
    return [goal.clone()];
  }

  // ── A* search ────────────────────────────────────────────────────────────

  const openSet = new Set<string>([startWp.id]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startWp.id, 0);
  fScore.set(startWp.id, dist(startWp.position, goalWp.position));

  while (openSet.size > 0) {
    let currentId = "";
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        currentId = id;
      }
    }

    if (currentId === goalWp.id) {
      return reconstructPath(waypointMap, cameFrom, startWp.id, goalWp.id, goal);
    }

    openSet.delete(currentId);
    const current = waypointMap.get(currentId)!;
    const g = gScore.get(currentId) ?? Infinity;

    for (const neighborId of current.connections) {
      const neighbor = waypointMap.get(neighborId);
      if (!neighbor) continue;

      const tentativeG = g + dist(current.position, neighbor.position);
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + dist(neighbor.position, goalWp.position));
        openSet.add(neighborId);
      }
    }
  }

  // No path found — straight-line fallback
  return [goal.clone()];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nearestWaypoint(map: Map<string, Waypoint>, pos: Vector3): Waypoint {
  let best: Waypoint | null = null;
  let bestDist = Infinity;
  for (const wp of map.values()) {
    const d = dist(pos, wp.position);
    if (d < bestDist) {
      bestDist = d;
      best = wp;
    }
  }
  return best!;
}

function dist(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Walk the cameFrom chain backwards and produce an ordered path of positions.
 * The start waypoint is omitted (NPC is already there). The final position is
 * the actual goal (not necessarily the goal waypoint center).
 */
function reconstructPath(
  map: Map<string, Waypoint>,
  cameFrom: Map<string, string>,
  startId: string,
  goalId: string,
  goalPos: Vector3,
): Vector3[] {
  const ids: string[] = [];
  let id = goalId;
  while (id !== startId) {
    ids.push(id);
    const prev = cameFrom.get(id);
    if (!prev) break;
    id = prev;
  }
  ids.reverse();

  const path: Vector3[] = [];
  for (const wpId of ids) {
    path.push(map.get(wpId)!.position.clone());
  }
  // Replace the last point with the exact goal so NPCs end up at the precise
  // target (e.g. jittered waiting-room position) rather than waypoint center.
  if (path.length > 0) {
    path[path.length - 1] = goalPos.clone();
  }
  return path;
}
