/**
 * Shared types for Hectic Hospital.
 *
 * This is the CONTRACT file. All 3 team members code against these interfaces.
 * Do NOT change without telling the team.
 */

import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// ─────────────────────────────────────────────────────────────────────────────
// Patient
// ─────────────────────────────────────────────────────────────────────────────

export type PatientState =
  | "entering"
  | "reception"
  | "waiting"
  | "nurse_coming"   // nurse assigned, walking to patient
  | "escorted"       // nurse + patient walking to room together
  | "assigned"
  | "in_treatment"
  | "exiting"
  | "gone";

export type Diagnosis =
  | "flu"
  | "broken_bone"
  | "food_poisoning"
  | "headache"
  | "mystery_rash";

export interface Patient {
  id: string;
  state: PatientState;
  health: number;       // 0–1 (0 = dead, 1 = fully healed)
  patience: number;     // 0–1 (0 = leaves angrily, 1 = calm)
  dangerous: boolean;
  diagnosis: Diagnosis | null;
  assignedRoom: string | null;
  assignedDoctor: string | null;
  mesh: TransformNode | null;

  /** NPC preset identity — null only for legacy/stub patients */
  presetId: string | null;
  displayName: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff
// ─────────────────────────────────────────────────────────────────────────────

export type StaffRole = "receptionist" | "nurse" | "doctor";

export type StaffState = "idle" | "moving" | "working" | "stunned";

export interface Staff {
  id: string;
  role: StaffRole;
  state: StaffState;
  target: Vector3 | null;
  assignedPatient: string | null;
  mesh: TransformNode | null;
  mass: number; // for physics: heavier = harder to push
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms
// ─────────────────────────────────────────────────────────────────────────────

export type RoomId = "reception" | "waiting" | "patient_room_1" | "patient_room_2" | "doctor_office";

export interface Room {
  id: RoomId;
  position: Vector3;      // center of the room in world space
  entryPoint: Vector3;    // where NPCs walk to when entering this room
  occupied: boolean;
  occupantId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Waypoints (for P2 navigation)
// ─────────────────────────────────────────────────────────────────────────────

export interface Waypoint {
  id: string;
  position: Vector3;
  connections: string[]; // ids of connected waypoints
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type HospitalEventType =
  | "injury"
  | "heal"
  | "attack"
  | "collision"
  | "patient_angry_left"
  | "lawsuit";

export interface HospitalEvent {
  type: HospitalEventType;
  sourceId: string;
  targetId: string;
  severity: number; // 0–1
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity (generic, for physics system — P3 codes against this)
// ─────────────────────────────────────────────────────────────────────────────

export interface PhysicsEntity {
  id: string;
  root: TransformNode;
  radius: number;
  mass: number;
  velocity: Vector3;
  stunTimer: number; // seconds remaining in stun; 0 = not stunned
}

// ─────────────────────────────────────────────────────────────────────────────
// Collision callback (P3 → P1 contract)
// ─────────────────────────────────────────────────────────────────────────────

export type CollisionCallback = (
  entityA: string,
  entityB: string,
  impactForce: number,
) => void;
