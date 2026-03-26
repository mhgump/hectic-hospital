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
  /** Enable Havok physics (WASM) integration. */
  physicsEnabled: true,
  /** World gravity magnitude (units/sec^2). */
  physicsGravityY: 9.81,

  // ───────────────────────────────────────────────────────────────────────────
  // Player
  // ───────────────────────────────────────────────────────────────────────────
  /** Player movement speed (units per second) */
  playerMoveSpeed: 4.5,

  /** How close to target before stopping (tap-to-move) */
  playerArrivalThreshold: 0.05,

  /** Approx player collider radius on ground plane (units) */
  playerColliderRadius: 0.35,

  // ───────────────────────────────────────────────────────────────────────────
  // Camera
  // ───────────────────────────────────────────────────────────────────────────
  /** Camera angle from vertical axis (radians). π/3 = 60° = Clash Royale style */
  cameraBeta: Math.PI / 3,

  /** Camera side angle (radians). π/2 = looking from +X toward -X */
  cameraAlpha: Math.PI / 2,

  /** Camera distance from target (affects ortho bounds calculation) */
  cameraRadius: 30,

  /** Half-size of visible arena in orthographic mode */
  cameraOrthoHalfSize: 12,

  // ───────────────────────────────────────────────────────────────────────────
  // Arena / Environment
  // ───────────────────────────────────────────────────────────────────────────
  /** Target floor size in X/Z after normalization (units) */
  arenaFloorSizeXZ: 40,
  /** Scale factor to extend ground beyond the visible view (keeps edges offscreen). */
  arenaGroundScale: 1.8,

  // ───────────────────────────────────────────────────────────────────────────
  // Gameplay
  // ───────────────────────────────────────────────────────────────────────────
  /** Pickup collection radius */
  pickupCollectionRadius: 0.8,

  /** Number of crystals to spawn each run */
  crystalCount: 15,

  /** Spawn crystals from this height so they fall down at round start / machine drops */
  crystalDropStartY: 10,

  /** Downward acceleration for non-physics fallback (units/sec^2) */
  crystalGravity: 22,

  /** Keep crystals away from arena edges (world units) */
  crystalSpawnMargin: 1.5,

  /** Min distance between spawned crystals (world units) */
  crystalMinDistanceBetween: 2.0,

  /** Min distance from player spawn (world units) */
  crystalMinDistanceFromPlayer: 2.5,

  /** Extra clearance from obstacle circles when spawning (world units) */
  crystalObstacleClearance: 0.5,

  // ───────────────────────────────────────────────────────────────────────────
  // Interactables / UI demo
  // ───────────────────────────────────────────────────────────────────────────
  /** How close the player must be to interact with the crystal machine */
  machineInteractRadius: 1.6,

  /** Circle collider radius for the machine (prevents walking through it) */
  machineColliderRadius: 1.0,

  /** How many crystals the machine drops when you press the button */
  machineCrystalDropCount: 10,

  // ───────────────────────────────────────────────────────────────────────────
  // Input
  // ───────────────────────────────────────────────────────────────────────────
  /** Camera drag sensitivity (radians per pixel) - only used if camera rotation is enabled */
  cameraDragSensitivity: 0.005,

  // ───────────────────────────────────────────────────────────────────────────
  // Audio
  // ───────────────────────────────────────────────────────────────────────────
  /** Default master volume (0-1) */
  defaultMasterVolume: 0.8,
} as const;

// Type helper for autocomplete
export type TuningKey = keyof typeof Tuning;
