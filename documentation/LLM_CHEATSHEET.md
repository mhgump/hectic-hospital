# LLM Cheatsheet for JamKit

**Purpose:** Quick reference for LLMs working on this codebase. Stable file locations, conventions, and rules.

---

## Critical Rules

1. **Never load runtime assets from `kenney/`** — copy to `public/assets/` and register
2. **Touch-first is primary** — tap-to-move, drag-to-look. Keyboard is fallback.
3. **No fallbacks** — primary methods must work; don't hide errors with fallback logic
4. **Don't restart dev server** — user runs it; just tell them to refresh
5. **Dispose scenes on state exit** — avoid memory leaks on restart
6. **Template UI is not fixed** — once a team starts building, the on-screen UI/branding may differ completely from the starter. Verify against current UI/code, not historical screenshots.

---

## Stable File Locations

| Purpose | File |
|---------|------|
| **Bootstrap** | `src/main.ts` |
| **Babylon side-effect imports** | `src/main.ts` (top) |
| **Gameplay tuning values** | `src/config/tuning.ts` |
| **Input bindings** | `src/input/bindings.ts` |
| **Input logic** | `src/input/InputManager.ts` |
| **Asset IDs** | `src/assets/assetIds.ts` |
| **Asset paths** | `src/assets/assetRegistry.ts` |
| **Asset loaders** | `src/assets/loaders.ts` |
| **Game state machine** | `src/game/StateManager.ts` |
| **Main game orchestration** | `src/game/Game.ts` |
| **Shared game model (score)** | `src/game/GameModel.ts` |
| **Player movement** | `src/player/PlayerController.ts` |
| **Pickups** | `src/world/Pickups.ts` |
| **Play state (main gameplay)** | `src/states/PlayState.ts` |
| **UI styles** | `src/ui/styles.css` |
| **HUD** | `src/ui/hud.ts` |

---

## Adding Things

### New Asset (Model/Sound)

1. Copy file to `public/assets/models/` or `public/assets/sounds/`
2. Add enum to `src/assets/assetIds.ts`
3. Add registry entry to `src/assets/assetRegistry.ts`
4. Use `loadModelContainer(scene, AssetId.X)` or `audio.playSfx(AssetId.X)`

### New State/Screen

1. Create `src/states/MyState.ts` implementing `GameState`
2. Register in `src/main.ts`: `game.getStates().register(new MyState(engine))`
3. Transition: `ctx.stateManager.goTo("my-state")`

### New Input Action

1. Add to `src/input/actions.ts`
2. Add key binding to `src/input/bindings.ts`
3. Check with `ctx.input.wasPressed(Action.X)`

### New UI Screen

1. Create `src/ui/screens/myScreen.ts`
2. Add styles to `src/ui/styles.css`
3. Mount from state, teardown on exit

---

## Babylon.js Side-Effect Imports

**CRITICAL**: If you see shader errors with `<!doctype html>` in the shader code, Babylon is trying to fetch shaders at runtime and getting HTML instead.

**Fix**: Add shader imports to `src/main.ts`. You need BOTH material classes AND shader files:

```typescript
// For glTF models (PBR) - most common:
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
// Plus PBR shader includes (see babylon-imports.md for full list)

// For MeshBuilder primitives:
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";

// For particles:
import "@babylonjs/core/Shaders/particles.vertex";
import "@babylonjs/core/Shaders/particles.fragment";
```

**Finding missing shaders**: `ls node_modules/@babylonjs/core/Shaders/ | grep -i <name>`

See `documentation/babylon-imports.md` for complete copy-paste import blocks.

---

## Coordinate System

- **Y is up**
- Ground plane is at `y = 0`
- Camera looks from +X toward -X (with current alpha)
- Player starts at `(0, 0, 0)`

---

## State Transitions

```typescript
// From any state:
ctx.stateManager.goTo("menu");
ctx.stateManager.goTo("play");
ctx.stateManager.goTo("results");
```

States: `boot` → `play` (skips menu currently), `play` → `results`, `results` → `play`

---

## Asset Paths

```
public/assets/
├── models/kenney/...    ← 3D models
├── sounds/kenney/...    ← Audio (prefer .mp3 for iOS)
└── ui/kenney/...        ← UI images
```

Resolved at runtime as `/assets/models/kenney/...`

---

## Commands That Must Stay Working

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Serve production build
```

---

## TypeScript Conventions

- Simple types, avoid advanced patterns
- Prefer `const` and explicit types where helpful
- Use `void` for fire-and-forget async calls: `void this.loadAssets()`
- Import types with `import type { X }` when only using for typing

---

## UI Conventions (HTML Overlay)

- All UI classes prefixed with `jk_` (e.g., `jk_hud`, `jk_btn`)
- Use `data-` attributes for action bindings
- Mount UI in state `enter()`, teardown in `exit()`
- `clearUiRoot()` clears previous UI on state entry

---

## Debug Tools

- **Z**: Toggle FPS overlay
- **X**: Toggle Babylon Inspector (dev only). Uses `import(/* @vite-ignore */ "@babylonjs/inspector")` to avoid Vite import-analysis errors.
- Check `src/debug/DebugOverlay.ts`

---

## Don't Break These

- `npm run dev/build/preview` scripts
- Touch-to-move on mobile
- Scene disposal on state transitions
- Asset loading from `public/assets/`
- Mobile audio unlock flow
