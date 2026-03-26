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
  cameraBeta: Math.PI / 4,              // 45° — matches debug_rooms angle
  cameraAlpha: -Math.PI * 5 / 12,      // ~-75° — matches debug_rooms angle
  cameraRadius: 30,
  cameraOrthoHalfSize: 7,              // ortho zoom level (halved = 2× zoom)
  cameraPanSpeed: 12,                   // world units/sec when panning with WASD/arrows
  cameraZoomMin: 4,        // tight zoom — individual characters fill the screen
  cameraZoomMax: 35,       // wide zoom — see whole hospital
  cameraZoomSpeed: 1.5,    // ortho half-size change per scroll notch

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
  patientSpawnIntervalSec: 10,
  receptionCheckDurationSec: 2,
  treatmentDurationSec: 4,
  patientPatienceDecayPerSec: 0.012, // patience drops per second while waiting
  shiftDurationSec: 180,

  // ───────────────────────────────────────────────────────────────────────────
  // Nurse grab / player control
  // ───────────────────────────────────────────────────────────────────────────
  nurseGrabRadius: 1.2,       // how close nurse must be to auto-attach a patient
  nurseTetherOffset: 1.0,     // patient follows this far behind the nurse
  nurseControlSpeed: 4.5,     // nurse move speed when player-controlled
  npcPickRadius: 1.5,         // tap within this world-distance to select an NPC

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
