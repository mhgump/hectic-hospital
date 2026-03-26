import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { Action } from "../input/actions";
import type { InputManager } from "../input/InputManager";

export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private visible = false;
  private inspectorOpen = false;
  private sceneGetter: (() => Scene | null) | null = null;

  constructor(private readonly deps: { engine: Engine; input: InputManager }) {
    this.el = document.createElement("div");
    this.el.className = "jk_debug";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <div class="jk_debug_row">
        <div class="jk_debug_label">FPS</div>
        <div class="jk_debug_value" data-jk-fps>—</div>
      </div>
      <div class="jk_debug_row">
        <div class="jk_debug_label">Inspector</div>
        <div class="jk_debug_value" data-jk-inspector>Off</div>
      </div>
      <div class="jk_debug_hint">Z = debug overlay | X = inspector (dev only)</div>
    `;
    document.body.appendChild(this.el);
  }

  /** Call this to allow inspector to access the current scene */
  setSceneGetter(getter: () => Scene | null) {
    this.sceneGetter = getter;
  }

  dispose() {
    this.el.remove();
  }

  update() {
    if (this.deps.input.wasPressed(Action.DebugToggle)) {
      this.setVisible(!this.visible);
    }

    // Inspector toggle (X) - only in dev mode
    if (this.deps.input.wasPressed(Action.InspectorToggle)) {
      void this.toggleInspector();
    }

    if (!this.visible) return;

    const fpsEl = this.el.querySelector<HTMLElement>("[data-jk-fps]");
    if (fpsEl) {
      fpsEl.textContent = String(Math.round(this.deps.engine.getFps()));
    }

    const inspectorEl = this.el.querySelector<HTMLElement>("[data-jk-inspector]");
    if (inspectorEl) {
      inspectorEl.textContent = this.inspectorOpen ? "On" : "Off";
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.el.style.display = v ? "block" : "none";
  }

  private async toggleInspector(): Promise<void> {
    // Inspector only available in dev mode
    if (!import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("Inspector disabled in production build");
      return;
    }

    const scene = this.sceneGetter?.();
    if (!scene) return;

    if (this.inspectorOpen) {
      scene.debugLayer.hide();
      this.inspectorOpen = false;
    } else {
      // Dynamically import inspector (only loaded when X is pressed in dev)
      try {
        // @vite-ignore tells Vite not to analyze this import statically
        await import(/* @vite-ignore */ "@babylonjs/inspector");
        await scene.debugLayer.show({ embedMode: true });
        this.inspectorOpen = true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Inspector not available", err);
      }
    }
  }
}



