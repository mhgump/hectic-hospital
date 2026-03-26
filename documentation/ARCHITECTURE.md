# JamKit Architecture / Mental Model

This is a small, intentionally boring architecture meant for **fast prototyping** and **LLM-friendly edits**.

## Core loop (render loop → states → scene)

- **Bootstrap**: `src/main.ts`
  - Creates Babylon `Engine`
  - Creates `InputManager`, `AudioManager`, `DebugOverlay`
  - Registers states in `StateManager`
  - Starts the game in an initial state

- **Render loop**: `src/game/Game.ts`
  - The Babylon engine runs a single loop:
    - `input.beginFrame()` (clears per-frame drag deltas)
    - render current scene (if any)
    - `debug.update()` (reads input actions like Z/X)
    - `input.endFrame()` (clears one-frame actions like “pressed”)

## State machine (StateManager) and scene ownership

- **State manager**: `src/game/StateManager.ts`
  - `goTo(key)` **queues** transitions (safe to call from inside `enter()`)
  - On transition:
    - Calls `prev.exit()`
    - Disposes the previous state’s scene (`prev.getScene()?.dispose()`)
    - Calls `next.enter(ctx)`

- **Scene ownership rule**
  - A state “owns” its scene.
  - A state must return it from `getScene()` so:
    - the render loop can render it
    - the debug inspector can target it
  - The `StateManager` disposes scenes on transitions to keep restarts clean.

## Where per-frame gameplay updates live

JamKit uses Babylon’s scene observables for per-frame logic:

- In a gameplay state (usually `src/states/PlayState.ts`), register:
  - `scene.onBeforeRenderObservable.add(() => { ... })`

Inside that callback you typically:

- Read input (`ctx.input.consumeTaps()`, `ctx.input.getMoveAxis()`, `ctx.input.consumeLookDragDelta()`)
- Update controllers/systems (`player.update(scene)`, NPC AI, pickups)
- Update the shared run model (`ctx.model.score`, `ctx.model.timeLeftSec`)
- Trigger state transitions (`ctx.stateManager.goTo("results")`)

## UI model (HTML overlay) and teardown rules

- **UI root**: `#ui-root` in `index.html` (overlay, separate from the canvas)
- **Helpers**: `src/ui/uiRoot.ts`
  - `clearUiRoot()` wipes the UI (used when entering a state)

Pattern:

- A state mounts UI in `enter()` (menu, HUD, results)
- A state removes listeners and clears UI in `exit()`

Examples:

- Menu: `src/states/MenuState.ts` → `src/ui/screens/menu.ts`
- Results: `src/states/ResultsState.ts` → `src/ui/screens/results.ts`
- HUD: `src/ui/hud.ts`

## Where “systems” should go (recommended pattern)

As your prototype grows, keep `PlayState` as an **orchestrator** and move mechanics into small “systems” / modules.

Good places:

- **Reusable engine/world helpers**: `src/engine/`, `src/world/`
  - Example: `src/world/modelNormalize.ts` (model root + normalization helpers)
  - Example: `src/world/randomPositions.ts` (spawn sampling helper)

- **Sample-only gameplay**: `src/sample/`
  - Put “demo” mechanics here so a new game can delete them cleanly.
  - Example: `src/sample/CrystalMachine.ts`

Suggested structure for new mechanics:

- A system is usually a small class with:
  - `update(dt)` (called each frame by the orchestrator)
  - `dispose()` (remove listeners, dispose meshes, clear references)

Rule of thumb:

- **`PlayState` wires things together**
- **Systems do the work**
- **States own scenes + UI lifecycle**


