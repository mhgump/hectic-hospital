# How To: JamKit Recipes

Quick recipes for common tasks. Each one is self-contained.

---

## Add a New 3D Model

### 1. Copy the file

```bash
# From Kenney bundle
cp kenney/Models/something.glb public/assets/models/my-model.glb

# Or your own model
cp ~/Downloads/my-model.glb public/assets/models/
```

### 2. Register in AssetId

`src/assets/assetIds.ts`:
```typescript
export enum AssetId {
  // ... existing
  MyNewModel = "MyNewModel",
}
```

### 3. Add to registry

`src/assets/assetRegistry.ts`:
```typescript
[AssetId.MyNewModel]: { kind: "model", path: "assets/models/my-model.glb" },
```

### 4. Load and use

```typescript
import { loadModelContainer } from "../assets/loaders";
import { AssetId } from "../assets/assetIds";

const container = await loadModelContainer(scene, AssetId.MyNewModel);
container.addAllToScene();

// For reliable positioning/scaling:
const root = container.createRootMesh();
root.position = new Vector3(5, 0, 0);
root.scaling = new Vector3(2, 2, 2);
```

---

## Add a New Sound Effect

### 1. Copy the file (prefer .mp3 for iOS)

```bash
cp kenney/Audio/something.mp3 public/assets/sounds/my-sound.mp3
```

### 2. Register

`src/assets/assetIds.ts`:
```typescript
MyNewSound = "MyNewSound",
```

`src/assets/assetRegistry.ts`:
```typescript
[AssetId.MyNewSound]: {
  kind: "audio",
  mp3Path: "assets/sounds/my-sound.mp3",
  // oggPath: "assets/sounds/my-sound.ogg", // optional
},
```

### 3. Play

```typescript
// Prefer calling this from a user gesture (click/tap) to satisfy mobile autoplay rules.
void audio.unlock().then(() => audio.playSfx(AssetId.MyNewSound));
```

---

## Add a New Game State/Screen

### 1. Create the state file

`src/states/MyState.ts`:
```typescript
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { createSceneBase } from "../engine/createSceneBase";
import type { GameState, StateContext } from "../game/StateManager";
import { clearUiRoot } from "../ui/uiRoot";

export class MyState implements GameState {
  readonly key = "my-state";
  private scene: Scene | null = null;

  constructor(private readonly engine: Engine) {}

  enter(ctx: StateContext) {
    clearUiRoot();
    this.scene = createSceneBase(this.engine);
    
    // Add your scene content here
    // Mount your UI here
  }

  exit() {
    // Scene disposal is handled by StateManager, but clear refs and teardown UI here.
    this.scene = null;
  }

  getScene(): Scene | null {
    return this.scene;
  }
}
```

### 2. Register in main.ts

```typescript
import { MyState } from "./states/MyState";

game.getStates().register(new MyState(engine));
```

### 3. Transition to it

```typescript
ctx.stateManager.goTo("my-state");
```

---

## Add a New UI Element (HTML overlay)

### 1. Create UI component

`src/ui/screens/myScreen.ts`:
```typescript
import { getUiRoot } from "../uiRoot";

export function mountMyScreen(opts: { onAction: () => void }) {
  const root = getUiRoot();
  root.innerHTML = `
    <div class="jk_myscreen">
      <h1>My Screen</h1>
      <button class="jk_btn" data-action="do-thing">Do Thing</button>
    </div>
  `;

  root.querySelector('[data-action="do-thing"]')?.addEventListener("click", opts.onAction);

  return {
    teardown: () => {
      root.innerHTML = "";
    },
  };
}
```

### 2. Add styles

`src/ui/styles.css`:
```css
.jk_myscreen {
  /* your styles */
}
```

### 3. Mount from a state

```typescript
const ui = mountMyScreen({
  onAction: () => console.log("clicked!"),
});

// On exit:
ui.teardown();
```

### Layer a panel on top of the HUD (without replacing it)

JamKit’s `#ui-root` is `pointer-events: none` by default (see `src/ui/styles.css`), so **overlays must opt-in** with `pointer-events: auto`.

For in-game panels, prefer **append/remove** instead of `root.innerHTML = ...` so you can keep the HUD mounted.

Example: JamKit’s sample interactable uses a panel:
- UI component: `src/ui/machinePanel.ts`
- Wiring + proximity show/hide: `src/sample/CrystalMachine.ts`

---

## Lock UI to a Fixed Design Resolution (Portrait UI)

If you want the **same amount of content visible** on all screens (mobile feel),
use a fixed design size and scale the whole game shell uniformly.

High-level steps:

1) **Pick a design size** (e.g. 480×800).
2) **Wrap the game shell** in a scaling container.
3) **CSS**: the inner shell stays at design size, the outer wrapper scales.
4) **Resize handler**: compute scale = `min(viewportW / designW, viewportH / designH)`
   and apply it to the wrapper.
5) **Fidelity**: on larger screens, increase Babylon render resolution using
   `engine.setHardwareScalingLevel(1 / renderScale)` instead of changing layout.

Result: dialogs and UI never “explode,” and bigger screens just look sharper.

---

## Add a New Input Action

### 1. Define the action

`src/input/actions.ts`:
```typescript
export enum Action {
  // ... existing
  MyAction = "MyAction",
}
```

### 2. Bind a key (optional, for keyboard)

`src/input/bindings.ts`:
```typescript
{ action: Action.MyAction, codes: ["KeyE"] },
```

### 3. Check in gameplay

```typescript
if (ctx.input.wasPressed(Action.MyAction)) {
  // Do something
}
```

---

## Add a New Pickup Type

### 1. Create the pickup class or extend Pickups

You can either:
- Add a new spawn method to `src/world/Pickups.ts`
- Create a new class following the same pattern

### 2. Register a new model/sound

Follow "Add a New 3D Model" and "Add a New Sound Effect" above.

### 3. Handle collection

```typescript
// In Pickups or your new class:
if (collected) {
  deps.onCollect();
  deps.audio.playSfx(AssetId.MyPickupSound);
}
```

---

## Change the Camera

See `documentation/cameras.md` for detailed camera recipes including:
- Perspective vs orthographic
- Following vs fixed
- Changing angles
- Locking/unlocking rotation

---

## Add Music (Looping Background)

### 1. Add the file

```bash
cp my-music.mp3 public/assets/sounds/music/background.mp3
```

### 2. Register

```typescript
[AssetId.MusicBackground]: {
  kind: "audio",
  mp3Path: "assets/sounds/music/background.mp3",
  // oggPath: "assets/sounds/music/background.ogg", // optional
},
```

### 3. Extend AudioManager (if needed)

The current `AudioManager` has `playSfx`. For looping music, you'd add:

```typescript
// JamKit uses WebAudio (AudioContext). Follow the same pattern as playSfx:
// - ensure unlocked
// - fetch + decode to AudioBuffer
// - play via AudioBufferSourceNode with loop=true
```

---

## Tune Gameplay Values

All gameplay numbers are in `src/config/tuning.ts`:

```typescript
export const Tuning = {
  playerMoveSpeed: 4.5,
  gameDurationSec: 60,
  pickupCollectionRadius: 0.8,
  // etc.
};
```

Import and use:
```typescript
import { Tuning } from "../config/tuning";

new PlayerController({ root: playerRoot, moveSpeed: Tuning.playerMoveSpeed });
```
