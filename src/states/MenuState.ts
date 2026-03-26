import type { Scene } from "@babylonjs/core/scene";
import { AssetId } from "../assets/assetIds";
import type { GameState, StateContext } from "../game/StateManager";
import { mountMenuScreen } from "../ui/screens/menu";

export class MenuState implements GameState {
  readonly key = "menu";
  private scene: Scene | null = null;
  private teardownUi: (() => void) | null = null;

  enter(ctx: StateContext) {
    const mount = mountMenuScreen({
      onStart() {
        void ctx.audio.unlock().then(() => ctx.audio.playSfx(AssetId.KenneySfxClick));
        ctx.stateManager.goTo("play");
      },
    });
    this.teardownUi = mount.teardown;
  }

  exit(_ctx: StateContext) {
    this.teardownUi?.();
    this.teardownUi = null;
  }

  getScene(): Scene | null {
    return this.scene;
  }
}


