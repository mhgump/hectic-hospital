import type { Engine } from "@babylonjs/core/Engines/engine";
import { StateManager } from "./StateManager";
import type { InputManager } from "../input/InputManager";
import type { AudioManager } from "../audio/AudioManager";
import type { DebugOverlay } from "../debug/DebugOverlay";
import { GameModel } from "./GameModel";

export type GameDeps = {
  engine: Engine;
  input: InputManager;
  audio: AudioManager;
  debug?: DebugOverlay;
  model?: GameModel;
};

export class Game {
  private readonly stateManager: StateManager;
  private started = false;
  private readonly model: GameModel;

  constructor(private readonly deps: GameDeps) {
    this.model = deps.model ?? new GameModel();
    this.stateManager = new StateManager({
      engine: deps.engine,
      input: deps.input,
      audio: deps.audio,
      model: this.model,
    });
  }

  getStates() {
    return this.stateManager;
  }

  getModel() {
    return this.model;
  }

  start(initialStateKey: string) {
    if (this.started) return;
    this.started = true;

    // Wire up debug overlay's scene getter for inspector
    this.deps.debug?.setSceneGetter(() => this.stateManager.getCurrentScene());

    const { engine } = this.deps;
    engine.runRenderLoop(() => {
      this.deps.input.beginFrame();
      const scene = this.stateManager.getCurrentScene();
      if (scene) {
        scene.render();
      }
      this.deps.debug?.update();
      this.deps.input.endFrame();
    });

    this.stateManager.goTo(initialStateKey);
  }
}


