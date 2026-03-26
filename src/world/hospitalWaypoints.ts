/**
 * Waypoint graph for NPC navigation through the hospital.
 *
 * Nodes are placed at room centers, doorway thresholds, and hallway junctions.
 * Connections are bidirectional — if A lists B, B must list A.
 *
 * Coordinate reference (from HospitalLayout.ts):
 *
 *   Z=-15  ┌──────────────────────┐
 *          │   RECEPTION  10×10   │  center (0, 0, -10)
 *   Z=-5   └──────────┬───────────┘
 *                      │  N-S hallway (X: -2 to +2)
 *   Z=-3   ┌──────────┼───────────┐
 *          │ waiting   │ p_room_1  │  centers (±7, 0, +0.5)
 *   Z=+4   └──────────┼───────────┘
 *                      │  E-W hallway strips
 *   Z=+7   ┌──────────┼───────────┐
 *          │ p_room_2  │ dr_office │  centers (±7, 0, +10.5)
 *   Z=+14  └──────────┴───────────┘
 *
 * Room dimensions: ROOM_W=10, GRID_D=7, RECEPTION_D=10, WALL_T=0.15
 * Doorways: 1.5 unit gap centered in each wall.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Waypoint } from "../hospital/types";

export const HOSPITAL_WAYPOINTS: Waypoint[] = [
  // ── Room centers (final destinations) ──────────────────────────────────────

  { id: "reception_center",
    position: new Vector3(0, 0, -10),
    connections: ["reception_door_s"] },

  { id: "waiting_center",
    position: new Vector3(-7, 0, 0.5),
    connections: ["waiting_door_e"] },

  { id: "p_room_1_center",
    position: new Vector3(7, 0, 0.5),
    connections: ["p_room_1_door_w"] },

  { id: "p_room_2_center",
    position: new Vector3(-7, 0, 10.5),
    connections: ["p_room_2_door_e"] },

  { id: "dr_office_center",
    position: new Vector3(7, 0, 10.5),
    connections: ["dr_office_door_w"] },

  // ── Doorway nodes ──────────────────────────────────────────────────────────
  // Placed just outside the wall on the hallway side so NPCs step through.

  // Reception south wall → N-S corridor  (wall at Z = -10 + 10/2 = -5)
  { id: "reception_door_s",
    position: new Vector3(0, 0, -4.8),
    connections: ["reception_center", "hall_ns_north"] },

  // Waiting room east wall → N-S corridor  (wall at X = -7 + 10/2 = -2)
  { id: "waiting_door_e",
    position: new Vector3(-1.8, 0, 0.5),
    connections: ["waiting_center", "hall_ns_mid"] },

  // Patient room 1 west wall → N-S corridor  (wall at X = 7 - 10/2 = 2)
  { id: "p_room_1_door_w",
    position: new Vector3(1.8, 0, 0.5),
    connections: ["p_room_1_center", "hall_ns_mid"] },

  // Patient room 2 east wall → N-S corridor  (wall at X = -7 + 10/2 = -2)
  { id: "p_room_2_door_e",
    position: new Vector3(-1.8, 0, 10.5),
    connections: ["p_room_2_center", "hall_ns_south"] },

  // Doctor office west wall → N-S corridor  (wall at X = 7 - 10/2 = 2)
  { id: "dr_office_door_w",
    position: new Vector3(1.8, 0, 10.5),
    connections: ["dr_office_center", "hall_ns_south"] },

  // ── Hallway junction nodes ─────────────────────────────────────────────────

  // Top of N-S corridor (just south of reception door)
  { id: "hall_ns_north",
    position: new Vector3(0, 0, -4),
    connections: ["reception_door_s", "hall_ns_mid"] },

  // Middle of N-S corridor (between top-row rooms)
  { id: "hall_ns_mid",
    position: new Vector3(0, 0, 0.5),
    connections: ["hall_ns_north", "waiting_door_e", "p_room_1_door_w", "hall_ew_center"] },

  // E-W corridor center (between top and bottom rows, Z ≈ 5.5)
  { id: "hall_ew_center",
    position: new Vector3(0, 0, 5.5),
    connections: ["hall_ns_mid", "hall_ns_south"] },

  // Bottom of N-S corridor (between bottom-row rooms)
  { id: "hall_ns_south",
    position: new Vector3(0, 0, 10.5),
    connections: ["hall_ew_center", "p_room_2_door_e", "dr_office_door_w"] },

  // ── Entry / Exit ───────────────────────────────────────────────────────────

  // Patients spawn near north edge (Z ≈ -14) and walk in
  { id: "spawn_north",
    position: new Vector3(0, 0, -14),
    connections: ["reception_door_s"] },

  // Exit point off the north edge of the map
  { id: "exit_north",
    position: new Vector3(0, 0, -17),
    connections: ["spawn_north"] },
];

/** Look-up table built once for fast id→Waypoint access. */
const _byId = new Map<string, Waypoint>(HOSPITAL_WAYPOINTS.map((w) => [w.id, w]));

/** Returns the waypoint map for pathfinding. */
export function getWaypointMap(): Map<string, Waypoint> {
  return _byId;
}
