This codebase is meant as a "Hello World" type template for game jam type usage - start building your own game project by cloning and adapting this codebase to your own needs. This provides a working template of a simple web page game, and means to easily publish it. 

Feel free to completely redo the code if needed - it is there to provide a helpful starter template, but it can and should be completely adapted when needed.

## Template UI Expectations

This repo is a *starting point*. Once a team starts building their own game, the on-screen UI, theme, and branding may diverge completely from the starter template. Do **not** assume the running UI matches "JamKit" or any specific sample layout — verify by inspecting the current UI or code.

Note: This repo is using Babylon.js (3d mode) - if the user clearly wants to do a 2D only game, we have git branch "main2d" with Phaser.IO 2d implementation which we might want to switch to. 

## Key Documentation

Read these before making significant changes:

| Doc | Purpose |
|-----|---------|
| `documentation/prd-writing.md` | **Start here** — How to write game plans/PRDs |
| `documentation/LLM_CHEATSHEET.md` | Quick reference for stable file locations |
| `documentation/babylon-imports.md` | **Critical** — Babylon tree-shaking gotchas |
| `documentation/cameras.md` | Camera setup and coordinate system |
| `documentation/meshes.md` | Meshes: importing, rooting/normalizing, picking |
| `documentation/sprites.md` | Sprites: SpriteManager/Sprite basics |
| `documentation/particles.md` | Particles: ParticleSystem basics |
| `documentation/physics.md` | Physics: overview + jam guidance |
| `documentation/assets.md` | Asset pipeline |
| `kenney/kenneyassets.md` | **Kenney catalog** — Browse available 2D/3D/audio packs |
| `documentation/animated_character.md` | Animated character models + animations |
| `documentation/input.md` | Input system |
| `documentation/TROUBLESHOOTING.md` | Common issues and fixes |
| `documentation/setup-troubleshooting.md` | Setup script issues (macOS + Windows) |

If the setup scripts (`setup.sh` / `setup.ps1`) fail, read `documentation/setup-troubleshooting.md` before suggesting manual install steps. It contains the current recovery steps for Node, npm, Xcode Command Line Tools, Homebrew, permissions, and shell setup.

## Setup Requests

If the user asks "set this up for me" or otherwise wants the project configured on their machine:

1. Run the real platform setup script first instead of recreating setup manually:
   - macOS: `./setup.sh`
   - Windows: `.\setup.ps1`
2. The setup scripts already handle:
   - network precheck flags
   - prerequisite installation
   - Node version installation/activation
   - shell profile setup
   - shared post-setup checks via `scripts/setup-post.mjs`
3. Only switch to manual recovery steps after the script fails.
4. If it fails, read `documentation/setup-troubleshooting.md` and inspect `setup.log`.
5. `scripts/setup-post.mjs` is part of the setup contract. It validates Node, checks `package-lock.json`, runs `npm ci`, and optionally runs `npm run build` when `--verify` is passed through.
6. Do not start or restart `npm run dev` yourself after setup; tell the user to run it, or to refresh if they already have it running.

If you run across an issue, and then are able to fix it, and you think this information will be useful in the future, or you add/edit/remove capabilities, concisely record your findings into one of the existing .md files (or make a new one if necessary) - iteratively improving and maintaining the documentation. 

## Skills

- [threejs-builder](.claude/skills/threejs-builder/SKILL.md) — Guideline and tips for working Three.js web apps with modern scene setup, lighting, and animation patterns.

- [scenario-api](.claude/skills/scenario-api/SKILL.md) — Instructions how to use the Scenario.com API.

- [multiplayer-durable-objects](.claude/skills/multiplayer-durable-objects/SKILL.md) — Add real-time multiplayer using Cloudflare Durable Objects + WebSockets. Covers "screen + phone controllers" (Jackbox-style) and peer multiplayer patterns.


---

## Stable File Locations

| Purpose | File |
|---------|------|
| Bootstrap + Babylon imports | `src/main.ts` |
| **Gameplay tuning values** | `src/config/tuning.ts` |
| Input bindings | `src/input/bindings.ts` |
| Asset IDs | `src/assets/assetIds.ts` |
| Asset paths | `src/assets/assetRegistry.ts` |
| Main gameplay | `src/states/PlayState.ts` |
| Player movement | `src/player/PlayerController.ts` |
| Pickups | `src/world/Pickups.ts` |

---


## Important Rules

1. **Zero fallbacks.** Do not add fallbacks to code. The primary methods for anything must work. Do not try to hide errors and failures with fallback systems. Keep architecture clean and compact — the primary method should work or show an error to the user.

2. **Do not start/stop/restart npm run dev.** The user runs it themselves. If it's not running, ask the user to start it with "npm run dev". Just tell them to refresh the browser after code changes.

3. **Touch-first is primary.** This is a mobile game template. Tap-to-move and drag-to-look are the primary controls. Keyboard is a fallback for desktop.

---

## Adding Assets

**First check [`kenney/kenneyassets.md`](kenney/kenneyassets.md)** for available packs (2D sprites, 3D models, audio).

1. Copy file to `public/assets/models/` or `public/assets/sounds/` (include any required `Textures/` folder for Kenney GLBs)
2. Add enum to `src/assets/assetIds.ts`
3. Add entry to `src/assets/assetRegistry.ts`
4. Use `loadModelContainer()` or `audio.playSfx()`

---

## Tuning Gameplay

All gameplay numbers are currenty in `src/config/tuning.ts`:

```typescript
export const Tuning = {
  playerMoveSpeed: 4.5,
  gameDurationSec: 60,
  pickupCollectionRadius: 0.8,
  // etc.
};
```

---

## Debug Tools

- **Z**: Toggle FPS/debug overlay
- **X**: Toggle Babylon Inspector (dynamically imported)

---

## Commands That Must Stay Working

```bash
npm run dev      # Start dev server
npm run build    # Production build  
npm run preview  # Serve production build
```

---

## State Transitions

```typescript
ctx.stateManager.goTo("menu");
ctx.stateManager.goTo("play");
ctx.stateManager.goTo("results");
```

Current flow: `boot` → `play` → `results` → `play` (loops)

Note: `MenuState` exists, but `BootState` currently transitions directly to `play`. If you want a menu-first flow, change `BootState` to `ctx.stateManager.goTo("menu")`.

------

## Don't Break

- `npm run dev/build/preview` scripts
- Touch-to-move on mobile
- Scene disposal on state transitions
- Asset loading from `public/assets/`
