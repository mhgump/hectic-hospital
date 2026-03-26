# JamKit Documentation

This folder contains technical documentation for LLMs and developers working on JamKit.

Note: JamKit is a *starter template*. Once a team begins building their own game, the UI/branding/flow may diverge completely from the sample. Do not assume the running UI looks like JamKit — verify against the current UI or code.

## Contents

### Getting Started
| File | Description |
|------|-------------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | First 30 minutes walkthrough |
| [HOW_TO.md](./HOW_TO.md) | Recipes for common tasks |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and fixes |
| [REPLACING_SAMPLE_GAME.md](./REPLACING_SAMPLE_GAME.md) | Checklist for deleting/replacing the example game |
| [KENNEY_CATALOG.md](./KENNEY_CATALOG.md) | What Kenney packs exist + how to search for assets by filename |

### Technical Reference
| File | Description |
|------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Mental model: render loop, states, scene ownership, UI lifecycle |
| [LLM_CHEATSHEET.md](./LLM_CHEATSHEET.md) | Quick reference for LLMs (stable file locations, conventions) |
| [babylon-imports.md](./babylon-imports.md) | **Critical** - How to handle Babylon.js tree-shaking and side-effect imports |
| [babylon-gotchas.md](./babylon-gotchas.md) | Babylon.js common issues, best practices, and official doc links |
| [meshes.md](./meshes.md) | Mesh basics, importing, rooting/normalizing, picking gotchas |
| [sprites.md](./sprites.md) | SpriteManager/Sprite overview + jam/mobile tips |
| [particles.md](./particles.md) | ParticleSystem overview + restart/perf tips |
| [physics.md](./physics.md) | Physics overview + jam guidance and gotchas |
| [lighting.md](./lighting.md) | Lighting setup, shadows, performance tips |
| [cameras.md](./cameras.md) | Camera setup, orthographic mode, coordinate system |
| [assets.md](./assets.md) | Asset pipeline, loading models, Kenney assets |
| [input.md](./input.md) | Input system, tap-to-move, keyboard, touch handling |

## Quick Reference

### Project Structure

```
src/
├── main.ts              # Entry point, Babylon imports, game bootstrap
├── assets/              # Asset registry and loaders
├── audio/               # AudioManager with mobile unlock
├── debug/               # Debug overlay, error overlay
├── engine/              # Babylon engine creation
├── game/                # Game class, StateManager, GameModel
├── input/               # InputManager, actions, bindings
├── player/              # PlayerController
├── states/              # Boot, Menu, Play, Results states
├── ui/                  # HTML overlay UI (HUD, screens)
└── world/               # Pickups and world objects

public/assets/           # Runtime assets (models, sounds)
kenney/                  # Vendored Kenney asset bundle (not used directly)
documentation/           # This folder
```

### Key Files to Understand

1. **`src/main.ts`** - All Babylon side-effect imports live here
2. **`src/states/PlayState.ts`** - Main gameplay: camera, player, pickups, input handling
3. **`src/assets/assetRegistry.ts`** - Maps AssetId enum to file paths
4. **`src/game/StateManager.ts`** - State machine for game flow

### Running the Project

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Common Tasks

| Task | Location |
|------|----------|
| Add new asset | `src/assets/assetIds.ts` + `assetRegistry.ts` + copy file to `public/assets/` |
| Change camera | `src/states/PlayState.ts` camera setup section |
| Add input action | `src/input/actions.ts` + `bindings.ts` + `InputManager.ts` |
| New game state | Create in `src/states/`, register in `main.ts` |

---

## For LLMs

When working on this codebase:

1. **Always check `babylon-imports.md`** before adding new Babylon features
2. **Read the relevant state file** before making gameplay changes
3. **Assets go in `public/assets/`**, not `src/` - they're served statically
4. **Don't restart the dev server** - user keeps it running; just tell them to refresh
5. **Use AssetId enum** for all asset references, not raw strings
