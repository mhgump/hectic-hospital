# Replacing the Sample Game (Checklist)

JamKit includes a small sample game to prove the pipeline (input → scene → UI → assets → restart), and to use as code reference. Feel free to edit / modify / adjust it completely as per the game you are actually building. This checklist helps you **delete/replace it cleanly** while keeping the template’s core scaffolding.

## Keep (core scaffolding)

- **Bootstrap / engine**
  - `src/main.ts`
  - `src/engine/createEngine.ts`
  - `src/engine/createSceneBase.ts`

- **Game loop + state machine**
  - `src/game/Game.ts`
  - `src/game/StateManager.ts`
  - `src/game/GameModel.ts` (or replace with your own model)

- **Input / audio / debug**
  - `src/input/*`
  - `src/audio/AudioManager.ts`
  - `src/debug/*`

- **UI framework (HTML overlay)**
  - `src/ui/uiRoot.ts`
  - `src/ui/styles.css`

- **Asset pipeline**
  - `src/assets/assetIds.ts`
  - `src/assets/assetRegistry.ts`
  - `src/assets/loaders.ts`
  - `public/assets/` (but replace contents)

## Sample-only (safe to delete if you don’t want it)

- **Main sample gameplay**
  - `src/states/PlayState.ts` (you’ll rewrite this anyway)
  - `src/sample/CrystalMachine.ts`
  - `src/world/Pickups.ts` (if your new game doesn’t have pickups)
  - `src/npc/WanderAi.ts` (if you don’t need it)
  - `src/player/CharacterAnimator.ts` (optional demo)

- **Sample UI screens (rewrite text/style)**
  - `src/ui/screens/menu.ts`
  - `src/ui/screens/results.ts`

- **Sample runtime assets**
  - `public/assets/models/kenney/...`
  - `public/assets/sounds/kenney/...`
  - `public/assets/ui/kenney/...`

## Minimal “blank playable state” recipe

Goal: get a running scene you can build on (camera + ground + input wired).

1. **Rewrite `PlayState`**
   - Create a scene (`createSceneBase(engine)`)
   - Create a camera
   - Create a ground/pick plane
   - In `scene.onBeforeRenderObservable`, read taps and do *something* visible (move a marker, move a box, etc.)

2. **Keep the state flow working**
   - In `src/main.ts` keep `BootState → PlayState` to start immediately.
   - Optionally remove `MenuState` / `ResultsState` until you need them.

3. **Ensure teardown is clean**
   - Any DOM listeners or Babylon observables you add in `enter()` must be removed in `exit()`.
   - StateManager will dispose the old scene on transitions, but you must teardown UI and external listeners yourself.

## Updating assets cleanly

1. Delete any sample assets you don’t want from `public/assets/`.
2. Update `src/assets/assetIds.ts` and `src/assets/assetRegistry.ts` to match.
3. Keep `ASSET_CREDITS.md` up to date for anything you ship.
4. Update `KENNEY_ASSETS.md` if you change the curated runtime subset.

## Optional: slim down forks

If your team doesn’t want the full Kenney bundle in their fork:

- Delete `kenney/` after curating what you need into `public/assets/...`
- Add `kenney/` to `.gitignore` in the fork


