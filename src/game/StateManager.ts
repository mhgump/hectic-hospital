import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { AudioManager } from "../audio/AudioManager";
import type { InputManager } from "../input/InputManager";
import type { GameModel } from "./GameModel";

export type StateKey = string;

export type StateContext = {
  stateManager: StateManager;
  engine: Engine;
  input: InputManager;
  audio: AudioManager;
  model: GameModel;
};

export interface GameState {
  readonly key: StateKey;
  enter(ctx: StateContext): Promise<void> | void;
  exit(ctx: StateContext): Promise<void> | void;
  getScene(): Scene | null;
}

export class StateManager {
  private readonly states = new Map<StateKey, GameState>();
  private current: GameState | null = null;
  private readonly baseCtx: Omit<StateContext, "stateManager">;

  private isTransitioning = false;
  private pendingKey: StateKey | null = null;

  constructor(baseCtx: Omit<StateContext, "stateManager">) {
    this.baseCtx = baseCtx;
  }

  register(state: GameState) {
    if (this.states.has(state.key)) {
      throw new Error(`Duplicate state key: ${state.key}`);
    }
    this.states.set(state.key, state);
  }

  getCurrentKey(): StateKey | null {
    return this.current?.key ?? null;
  }

  getCurrentScene(): Scene | null {
    return this.current?.getScene() ?? null;
  }

  /**
   * Request a transition. Calls are queued; it is safe to call this from inside enter().
   */
  goTo(key: StateKey) {
    this.pendingKey = key;
    void this.flushTransitions();
  }

  private async flushTransitions() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    try {
      while (this.pendingKey) {
        const nextKey = this.pendingKey;
        this.pendingKey = null;
        await this.performTransition(nextKey);
      }
    } finally {
      this.isTransitioning = false;
    }
  }

  private async performTransition(nextKey: StateKey) {
    const next = this.states.get(nextKey);
    if (!next) {
      throw new Error(`Unknown state key: ${nextKey}`);
    }

    const ctx: StateContext = { stateManager: this, ...this.baseCtx };
    const prev = this.current;
    if (prev) {
      await prev.exit(ctx);
      const prevScene = prev.getScene();
      if (prevScene) {
        // Ensure a full dispose for restartability.
        prevScene.dispose();
      }
    }

    this.current = next;
    await next.enter(ctx);
  }
}


