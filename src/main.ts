import "./ui/styles.css";

// ───────────────────────────────────────────────────────────────────────────────
// Babylon.js ES-module side-effects
// ───────────────────────────────────────────────────────────────────────────────
// When using tree-shaken @babylonjs/core, shaders and materials are NOT included
// unless something imports them. glTF models use PBRMaterial, so we must import it
// (or its base) to ensure the pbr vertex/fragment shaders are registered.
// Without this, Babylon tries to fetch shaders at runtime → Vite returns index.html
// → WebGL compile error "syntax error: '<'".
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"; // required for shadows
import "@babylonjs/core/Culling/ray"; // required for scene.pick() raycasting

// GlowLayer / blur shaders (avoid runtime shader fetch → Vite returning index.html)
import "@babylonjs/core/Shaders/glowBlurPostProcess.fragment";
import "@babylonjs/core/Shaders/kernelBlur.fragment";
import "@babylonjs/core/Shaders/kernelBlur.vertex";
import "@babylonjs/core/Shaders/depthBoxBlur.fragment";
import "@babylonjs/core/Shaders/glowMapGeneration.fragment";
import "@babylonjs/core/Shaders/glowMapGeneration.vertex";
import "@babylonjs/core/Shaders/glowMapMerge.fragment";
import "@babylonjs/core/Shaders/glowMapMerge.vertex";
import "@babylonjs/core/Shaders/postprocess.vertex";

// Shadow map shaders (avoid runtime shader fetch → Vite returning index.html)
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

// Particle shaders (avoid runtime shader fetch → Vite returning index.html)
import "@babylonjs/core/Shaders/particles.vertex";
import "@babylonjs/core/Shaders/particles.fragment";

// RGBD decode shader (used by GlowLayer/postprocessing texture operations)
import "@babylonjs/core/Shaders/rgbdDecode.fragment";

import { createEngine } from "./engine/createEngine";
import { Game } from "./game/Game";
import { InputManager } from "./input/InputManager";
import { defaultKeyBindings } from "./input/bindings";
import { AudioManager } from "./audio/AudioManager";
import { DebugOverlay } from "./debug/DebugOverlay";
import { ErrorOverlay } from "./debug/ErrorOverlay";
import { Tuning } from "./config/tuning";
import { Runtime } from "./config/runtimeConfig";
import { UiLayout, getRenderScale, getShellScale } from "./config/uiLayout";
import { trackPlay } from "./utils/trackPlay";
import { BootState } from "./states/BootState";
import { MenuState } from "./states/MenuState";
import { PlayState } from "./states/PlayState";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) {
  throw new Error("Missing #game-canvas");
}

const shell = document.querySelector<HTMLDivElement>("#game-shell");
if (!shell) {
  throw new Error("Missing #game-shell");
}

const shellScale = document.querySelector<HTMLDivElement>("#game-shell-scale");
if (!shellScale) {
  throw new Error("Missing #game-shell-scale");
}

const uiRoot = document.querySelector<HTMLDivElement>("#ui-root");
if (!uiRoot) {
  throw new Error("Missing #ui-root");
}

// UI is owned by states (Menu/HUD/Results). Start with an empty root.
uiRoot.innerHTML = "";

const { engine } = createEngine(canvas);

const applyLayoutScale = () => {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const scale = getShellScale(viewportWidth, viewportHeight);
  const renderScale = getRenderScale(scale, window.devicePixelRatio ?? 1);

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--design-width", `${UiLayout.designWidth}px`);
  rootStyle.setProperty("--design-height", `${UiLayout.designHeight}px`);
  rootStyle.setProperty("--shell-scale", scale.toFixed(4));
  rootStyle.setProperty("--ui-scale", `${UiLayout.baseUiScale}`);

  engine.setHardwareScalingLevel(1 / renderScale);
  engine.resize();
};

applyLayoutScale();
window.addEventListener("resize", applyLayoutScale, { passive: true });

const input = new InputManager({ element: canvas, keyBindings: defaultKeyBindings });
const audio = new AudioManager({
  unlockElement: document.body,
  initialVolume: Runtime.e2e && Runtime.muteAudio ? 0 : Tuning.defaultMasterVolume,
});
const debug = new DebugOverlay({ engine, input });
new ErrorOverlay();

const game = new Game({ engine, input, audio, debug });
game.getStates().register(new BootState());
game.getStates().register(new MenuState());
const playState = new PlayState(engine);
game.getStates().register(playState);
game.start("boot");

if (!Runtime.e2e) {
  void trackPlay();
}

if (Runtime.e2e) {
  document.documentElement.dataset.jkE2e = "1";
  const w = window as any;
  w.__jk = {
    getStateKey: () => game.getStates().getCurrentKey(),
    getModel: () => {
      const m = game.getModel();
      return {
        money: m.money,
        reputation: m.reputation,
        shiftTimeLeft: m.shiftTimeLeft,
        patientCount: m.getActivePatients().length,
      };
    },
    getPlayerPos: () => {
      const p = playState.getPlayerPosition();
      if (!p) return null;
      return { x: p.x, y: p.y, z: p.z };
    },
    getReady: () => document.documentElement.dataset.jkReady ?? null,
  };
}

// Ensure canvas can receive pointer events immediately on mobile.
canvas.addEventListener(
  "pointerdown",
  () => {
    canvas.focus({ preventScroll: true });
  },
  { passive: true }
);
