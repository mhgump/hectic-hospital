export type RuntimeConfig = {
  /** Enable E2E test hooks (explicit opt-in via query param). */
  e2e: boolean;
  /** Seed used for deterministic RNG when e2e is enabled. */
  seed: number | null;
  /** Mute audio when e2e is enabled (keeps code paths but avoids timing issues). */
  muteAudio: boolean;
  /** Optional start state override (useful for UI/menu tests). */
  startState: string | null;
};

function parseOptionalInt(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid query param (expected integer): ${key}=${raw}`);
  }
  return n;
}

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const e2e = params.get("e2e") === "1";

  // Only parse / validate E2E params when explicitly enabled.
  if (!e2e) {
    return { e2e: false, seed: null, muteAudio: false, startState: null };
  }

  const seed = parseOptionalInt(params, "seed") ?? 1;

  // Default to mute in E2E mode; can be overridden via `muteAudio=0`.
  const muteAudioParam = params.get("muteAudio");
  const muteAudio = muteAudioParam === null ? true : muteAudioParam !== "0";

  const startState = params.get("startState");

  return { e2e: true, seed, muteAudio, startState };
}

export const Runtime = parseRuntimeConfig(window.location.search);
