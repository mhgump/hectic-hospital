/**
 * Centralized gameplay tuning values.
 * Edit this file to adjust game feel without hunting through code.
 *
 * LLM note: This is THE place to change gameplay numbers.
 */

export const Tuning = {
  // ───────────────────────────────────────────────────────────────────────────
  // Physics
  // ───────────────────────────────────────────────────────────────────────────
  physicsEnabled: false, // character physics are kinematic, not Havok
  physicsGravityY: 9.81,

  // ───────────────────────────────────────────────────────────────────────────
  // Camera (top-down hospital view)
  // ───────────────────────────────────────────────────────────────────────────
  cameraBeta: Math.PI / 3,
  cameraAlpha: Math.PI / 2,
  cameraRadius: 30,
  cameraOrthoHalfSize: 18, // wider to see more of the hospital

  // ───────────────────────────────────────────────────────────────────────────
  // Arena / Hospital
  // ───────────────────────────────────────────────────────────────────────────
  hospitalFloorWidth: 40,
  hospitalFloorDepth: 30,
  arenaGroundScale: 1.8,

  // ───────────────────────────────────────────────────────────────────────────
  // NPC / Characters
  // ───────────────────────────────────────────────────────────────────────────
  npcMoveSpeed: 3.5,
  nurseMoveSpeed: 4.0,
  doctorMoveSpeed: 3.0,
  patientMoveSpeed: 2.5,
  npcColliderRadius: 0.4,
  npcArrivalThreshold: 0.3,

  // ───────────────────────────────────────────────────────────────────────────
  // Player
  // ───────────────────────────────────────────────────────────────────────────
  playerMoveSpeed: 5.0,
  playerArrivalThreshold: 0.05,
  playerColliderRadius: 0.4,

  // ───────────────────────────────────────────────────────────────────────────
  // Pipeline timing
  // ───────────────────────────────────────────────────────────────────────────
  patientSpawnIntervalSec: 6,
  receptionCheckDurationSec: 2,
  treatmentDurationSec: 5,
  patientPatienceDecayPerSec: 0.03, // patience drops per second while waiting
  shiftDurationSec: 180,

  // ───────────────────────────────────────────────────────────────────────────
  // Physics / Chaos (for P3)
  // ───────────────────────────────────────────────────────────────────────────
  knockbackThreshold: 4.0, // velocity * mass above this triggers a fall
  stunDurationSec: 1.5,
  defaultMass: 1.0,
  heavyMass: 2.5,

  // ───────────────────────────────────────────────────────────────────────────
  // Economy
  // ───────────────────────────────────────────────────────────────────────────
  healRewardBase: 100,
  healRewardRandom: 100,
  lawsuitPenaltyBase: 50,
  lawsuitPenaltyRandom: 150,
  angryPatientPenalty: 30,
  startingMoney: 500,

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy (sample code references — safe to remove when deleting sample/)
  // ───────────────────────────────────────────────────────────────────────────
  crystalGravity: 22,

  // ───────────────────────────────────────────────────────────────────────────
  // Input
  // ───────────────────────────────────────────────────────────────────────────
  cameraDragSensitivity: 0.005,

  // ───────────────────────────────────────────────────────────────────────────
  // Audio
  // ───────────────────────────────────────────────────────────────────────────
  defaultMasterVolume: 0.8,
} as const;

export type TuningKey = keyof typeof Tuning;
