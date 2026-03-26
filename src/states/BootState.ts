import type { Scene } from "@babylonjs/core/scene";
import type { GameState, StateContext } from "../game/StateManager";
import { Runtime } from "../config/runtimeConfig";

export class BootState implements GameState {
  readonly key = "boot";
  private scene: Scene | null = null;

  async enter(ctx: StateContext) {
    // Boot is where you'd do preloading later. For now we start directly in Play.
    // Note: Audio is unlocked by the first user gesture; see AudioManager.
    const next = Runtime.e2e && Runtime.startState ? Runtime.startState : "play";
    queueMicrotask(() => ctx.stateManager.goTo(next));
  }

  exit(_ctx: StateContext) {
  }

  getScene(): Scene | null {
    return this.scene;
  }
}


