PRD: Supercell Internal Game Jam “Hello World” Browser Game Template (Babylon.js)
1) Overview
Product name: JamKit (working title)
Type: Git-cloneable browser game template (Babylon.js + Vite)
Audience: Supercell internal game jam participants (mixed skill levels; heavy “vibe coding” with LLMs expected)
Primary outcome: Teams can clone/fork and start building a playable game immediately without spending jam time on setup/boilerplate.

1.1) v1 Defaults (to reduce decision churn)
These are “strong defaults” for v1 so teams can start without debating architecture.
- UI approach: HTML overlay (fast iteration, easy LLM edits)
- Assets served from: public/assets/… (works in dev + build with no config)
- Language: TypeScript (simple style; avoid advanced patterns)
- Package manager: npm
- Node version: pin via .nvmrc and package.json engines (Node.js 22 LTS)
- Babylon packages: use modular @babylonjs/* packages (smaller bundles)
- Inspector: available in dev only behind a key chord; disabled in production builds
- Input: touch-first (“actions, not keys”); all bindings defined in one config file
- Controls: tap-to-move + drag-to-look on mobile (desktop pointer maps to the same); keyboard is fallback
- Restartability: Play state can be started/stopped repeatedly without page reload or leaks

2) Goals
Primary goals
Time-to-first-fun under 5 minutes
npm install → npm run dev → playable loop immediately.
Jam-friendly scaffolding
Clean project structure, “obvious” extension points, minimal conceptual overhead.
Batteries included
Character controller, input mapping, basic UI, audio, asset loading, debugging/perf overlay, and state flow.
LLM-friendly documentation
Docs clearly describe folder conventions and “how to add X” so an LLM can follow instructions reliably.
Non-goals
Building a full engine/framework abstraction on top of Babylon.
Multiplayer, backend services, save systems, analytics, monetization.
Highly opinionated architecture (ECS, DI containers, heavy patterns) unless it’s extremely lightweight.

3) Success Metrics
Setup success: ≥95% of users can run the template within 10 minutes on a clean machine.
First edit loop: Changing one file produces a visible change in-game within 30 seconds (including learning time).
Jam adoption: Majority of jam teams start from JamKit (target depends on internal baseline).
Low support load: Fewer than N recurring setup issues (tracked via internal channel).

4) Target Platforms & Constraints
Primary: Mobile Safari/Chrome (touch-first, WebGL2)
Secondary: Desktop Chrome/Edge (WebGL2)
Offline after install: No runtime CDN dependencies.
Package manager: npm
Language: TypeScript recommended (for autocomplete + refactors); keep it simple.

5) User Stories
As a jam participant…
I can clone and run the game with one command after install.
I can play the example game on my phone using touch (no keyboard required).
I can move a character by tapping on the ground to walk there (tap-to-move).
I can rotate the camera by dragging (touch) / dragging mouse (desktop).
I can still control the character with keyboard on desktop as a fallback.
I can add a new 3D model by dropping it in a folder and loading it with a helper.
I can play sound effects with a single function call.
I can edit UI text and add a button quickly.
I can switch scenes/states (Menu → Play → Results) without spaghetti.
I can toggle debug/perf overlays and inspect objects in dev builds.
As the template maintainer…
I can update dependencies without breaking the template.
I can add or swap example assets safely (license-compliant).
I can keep the template small, understandable, and stable.

6) Core Experience: Example Game (Vertical Slice)
Working title: “Crystal Courier”
Gameplay loop (simple, uses all systems):
Player spawns in a small arena.
Player moves a character around, collects glowing “crystals” (pickups).
Each pickup:
Plays an SFX
Increments score displayed in HUD
Triggers a short character animation (or emote) if available
Timer counts down (e.g., 60s).
On timer end: show Results screen with score + “Play Again”.
Systems used:
Character controller (movement, camera follow)
Input mapping (touch-first tap-to-move + drag-to-look; keyboard fallback)
UI (HUD + menu + results)
Audio (SFX + optional music)
Assets (Kenney CC0 model + pickup + UI + sounds; see 7.8.2)
Debug tools (FPS, inspector toggle, debug menu)
7) Feature Requirements
7.1 Project scaffolding & dev workflow
Vite-based dev server with HMR
Scripts:
npm run dev
npm run build
npm run preview
npm run lint (optional)
npm run format (optional)
Node version pinned: Node.js 22 LTS (via `.nvmrc` and `package.json` `engines`)
Acceptance criteria
On fresh clone: npm install then npm run dev runs without manual steps.
npm run build outputs a static build and npm run preview runs it locally.
7.2 Rendering & scene setup (Babylon.js)
One canonical engine initialization: canvas, engine, resize handling, render loop.
Scene factory pattern (not a heavy framework): create & dispose scenes cleanly.
Optional: environment lighting preset.
Acceptance criteria
No memory leaks when restarting game from Results to Play multiple times.
Scene changes do not require page reload.
7.3 Game state flow
Minimum states:
Boot (preload minimal assets, init systems)
Menu
Play
Results
Pause overlay (optional state or overlay behavior)
Acceptance criteria
Play can be restarted without refreshing the page.
Menu and Results are reachable and functional.
7.4 Character controller (core requirement)
Baseline: A controllable character that can move around with camera follow.
Implementation options (choose one for v1, keep others as future):
Option A (v1 recommended): Capsule controller with Babylon collision checks / simple gravity; optional jump.
Option B (future): Physics-based controller (Havok/Ammo/Cannon) behind a feature flag.
Animated character (stretch but strongly desired):
Provide a default rigged character .glb with idle/walk/run animations if licensing allows.
Use Babylon AnimationGroups to switch animations based on movement speed.
Fallback: if no animated asset is included, ship a capsule character but document “how to add animated character”.
Acceptance criteria
Player can move on mobile via tap-to-move (tap a point on the ground and the character walks there).
Player can rotate camera on mobile via drag-to-look (one-finger drag).
Desktop fallback: player can also move with WASD/arrows; pointer (mouse) can emulate tap-to-move and drag-to-look.
Character follows ground plane; cannot fall through.
If animated asset included: transitions Idle ↔ Walk/Run.
7.5 Input system (actions not keys)
Input mapping layer:
Define actions: Move, Look, Jump, Interact, Pause, DebugToggle
Support touch + pointer as first-class inputs; keyboard is a fallback; optional gamepad mapping later.
One file to edit bindings.
Acceptance criteria
Input actions are referenced in gameplay code, not raw keycodes.
Changing bindings in config takes effect without hunting references.

7.5.0 Touch-first interaction model (v1)
Primary (mobile)
- Tap on navigable ground: set a move target (raycast) and walk there
- Drag: rotate camera (yaw/pitch with clamps); no pointer-lock required
Desktop parity
- Mouse click: behaves like tap-to-move
- Mouse drag: behaves like drag-to-look
Notes
- Tap-to-move should ignore UI elements (no “tap through” on buttons)
- Consider a small on-screen hint (“Tap to move, drag to look”)

7.5.1 Default controls (v1)
Default bindings (must be configurable; these are the “starter” defaults):
- Move (primary): Tap-to-move (touch) / click-to-move (mouse)
- Look (primary): Drag-to-look (touch/mouse)
- Move (fallback): WASD + Arrow keys
- Jump (fallback / optional): Space
- Interact (fallback / optional): E
- Pause: UI button on mobile; Esc on desktop fallback
- Debug overlay toggle: UI toggle in dev; Z on desktop fallback
- Inspector toggle (dev only): hidden behind a dev-only UI action; X on desktop fallback
7.6 UI system (fast iteration)
HUD:
Score
Timer
Small hint text (“Tap to move, drag to look”)
Menu screen: Start button
Results screen: score + restart
Implement as:
HTML overlay (recommended for speed), or
Babylon GUI (if you want single-canvas purity)
Acceptance criteria
UI updates (score/timer) are reactive or easy to update.
Buttons work on desktop and mobile.
Buttons are touch-friendly (reasonable target size/spacing).
7.7 Audio system
Simple audio manager:
playSfx(name)
playMusic(name)
setMasterVolume(value)
toggleMute()
Handles “audio unlock” on mobile (tap to enable).
Mobile/browser compatibility requirement
- iOS Safari does not reliably support `.ogg`; ship `.mp3` (or AAC) for any required SFX/music.
- The audio loader should prefer a supported format per platform (e.g., `.mp3` on iOS; `.ogg` allowed elsewhere).
Acceptance criteria
Pickup plays SFX.
Music (optional) loops and can be muted.
No console spam on browsers that block autoplay.
7.8 Asset pipeline & folders (LLM-friendly)
Provide an assets convention and helper utilities.
Planned folders (note: assets may be added/changed later; v1 can include placeholders):
public/assets/
  models/
    character/
    props/
    environment/
  sounds/
    sfx/
    music/
  textures/
  shaders/ (optional)
  ui/ (optional)

7.8.2 Kenney Game Assets (CC0) integration (v1)
Goal
- Vendor the full Kenney CC0 bundle in-repo so teams can build many types of games quickly.
- Ensure the example game uses a curated subset so those assets are known-good and easy for LLMs to reference.

Source-of-truth (vendored)
- Full bundle (as provided): `kenney/`

Runtime subset (used by the example game)
- Models: `public/assets/models/kenney/...`
  - Player: `blocky-characters/character-a.glb` (+ `Textures/texture-a.png`)
  - Arena: `mini-arena/{floor,wall,wall-corner,tree}.glb` (+ `Textures/colormap.png`)
  - Pickup: `tower-defense/detail-crystal.glb` (+ `Textures/colormap.png`)
- UI art: `public/assets/ui/kenney/mobile-controls/button_circle.png`
- SFX (ship mp3 for iOS; ogg optional for others):
  - `public/assets/sounds/kenney/interface/click_001.{mp3,ogg}` (UI click)
  - `public/assets/sounds/kenney/interface/confirmation_001.{mp3,ogg}` (pickup)

LLM guidance
- **Do not load runtime assets from `kenney/`**. Always copy/curate assets you actually use into `public/assets/...` (and update credits).
- This keeps production builds small and makes it easy for teams to remove `kenney/` from their fork later if they want.

Team workflow (recommended)
- During jam: browse `kenney/` freely, but copy only what you use into `public/assets/...`.
- When shipping/sharing source: teams may keep `kenney/` (license is CC0), or remove it to slim the repo:
  - delete `kenney/`
  - add `kenney/` to `.gitignore` (in their fork) to prevent re-adding

7.8.3 Asset registry & loader helpers
Provide AssetIds enum or manifest-like registry:
MODEL_CHARACTER
SFX_PICKUP
etc.
Provide helper:
loadModel(assetId)
loadSound(assetId)
Documentation includes:
where to put files
naming conventions
how to reference via asset IDs
how to add new assets
Acceptance criteria
Adding a new .glb in `public/assets/models/...` (optionally copied/curated from `kenney/`) and registering it results in easy loading in code.
Template builds and serves assets correctly in dev and prod.
7.9 Debugging & performance
Toggleable overlays:
FPS counter
Basic debug panel (checkboxes/sliders) for tuning:
player speed
jump height
camera sensitivity
Babylon Inspector available in dev mode behind a key chord.
Acceptance criteria
Debug overlay can be toggled at runtime.
Inspector does not ship (or is disabled) in production build by default.

7.10 Build output, hosting & deploy (jam-friendly sharing)
Requirements
- npm run build outputs a fully static site (no server) suitable for any static host.
- npm run preview serves the built output locally.
- Template must work under a non-root base path (e.g., /my-game/) for internal pages hosting.
Optional (recommended)
- Provide a one-page DEPLOY.md with the “happy path” for your internal static hosting and one external option (if allowed).
Acceptance criteria
- The example game is playable from the build output with assets loading correctly.
- No runtime CDN dependencies; offline after install.

7.11 Reliability gates (to keep the template working over time)
CI recommendations (can be GitHub Actions or internal equivalent)
- npm ci
- npm run build
- npm run lint (if included)
- Optional: a minimal “smoke” check that launches the built site and asserts the canvas renders (kept lightweight)
Acceptance criteria
- Main branch always builds and previews successfully.


8) Documentation Requirements (LLM-first)
Docs should be written so both humans and an LLM can follow them deterministically.
Required docs
README.md
What is this, how to run, core commands, folder map.
GETTING_STARTED.md
First 30 minutes walkthrough:
change a value
add a pickup
change character speed
add a sound
HOW_TO.md (or /docs/)
Recipes:
Add a new state/screen
Add a new model
Add a new sound
Add a new input action
Add a new UI element
Add a new gameplay entity
LLM_CHEATSHEET.md
A short “tooling contract” for LLMs:
file locations
naming conventions
“don’t break these scripts”
how to register assets
where to put new gameplay logic
TROUBLESHOOTING.md
Audio unlock issues
Asset path issues
WebGL context loss basics
Mobile pointer/camera issues
Acceptance criteria
A new dev can follow docs and add a pickup type in <30 minutes.

8.1) LLM “Tooling Contract” (explicit, stable targets)
The docs should explicitly point LLMs to a small set of stable files so generated changes are predictable.
Examples (names illustrative; final file paths should be enforced):
- “Edit input bindings here”: src/input/bindings.ts
- “Register assets here”: src/assets/assetRegistry.ts
- “Add a new screen/state here”: src/states/
- “Adjust gameplay tuning here”: src/config/tuning.ts
- “Add UI here”: src/ui/
- “Core game loop/state switching here”: src/game/Game.ts

9) Technical Architecture (Lightweight)
Key modules
Game (bootstrap, loop, state manager)
StateManager (switch/dispose states)
Input (action mapping)
Audio (simple manager)
Assets (registry + loaders)
UI (HUD/menu/results)
PlayerController (movement + animation)
World (arena, pickups)
Principles
Prefer composition over inheritance.
Keep helpers thin; don’t abstract Babylon heavily.
One “obvious place” for each concern.

9.1) Suggested repo skeleton (v1)
This is a “map” for both humans and LLMs; keep it stable across template updates.
- public/
  - assets/
    - models/
      - character/
      - props/
      - environment/
    - sounds/
      - sfx/
      - music/
    - textures/
    - ui/ (optional)
- src/
  - main.ts (bootstrap: canvas, engine, game start)
  - game/
    - Game.ts
    - StateManager.ts
  - states/
    - BootState.ts
    - MenuState.ts
    - PlayState.ts
    - ResultsState.ts
  - world/
    - Arena.ts
    - Pickups.ts
  - player/
    - PlayerController.ts
    - CharacterAnimator.ts (optional; only if animated character is included)
  - input/
    - actions.ts
    - bindings.ts
    - InputManager.ts
  - audio/
    - AudioManager.ts
  - assets/
    - assetIds.ts
    - assetRegistry.ts
    - loaders.ts
  - ui/
    - hud.ts
    - screens/
      - menu.ts
      - results.ts
  - debug/
    - DebugOverlay.ts
  - config/
    - tuning.ts
    - buildFlags.ts
10) Dependencies
Required
- @babylonjs/core
- @babylonjs/loaders
- Vite + TypeScript
Optional (behind flags)
- @babylonjs/inspector (dev only)
Physics engine integration (future)
Lightweight UI library (if HTML overlay needs it, otherwise vanilla)

Tooling (recommended)
- ESLint + Prettier (keep rules jam-friendly; avoid “fighting the linter”)
11) Licensing & Asset Policy
All shipped assets must have clear internal redistribution rights.
Maintain an ASSET_CREDITS.md with:
source
license
author attribution (if required)
Kenney assets
- Kenney Game Assets are CC0 and the full bundle is vendored under `kenney/`.
- The example game must only use curated runtime assets under `public/assets/...` (not directly from `kenney/`).
If licensing is a concern, ship placeholder primitives and document where to add assets later.
Acceptance criteria
Repo is compliant with internal policy and includes credits where needed.


12) Milestones & Scope
v1 (must-have)
Vite + Babylon + TS running
State flow (Menu/Play/Results)
Character controller (capsule ok)
Input actions
Touch-first controls (tap-to-move + drag-to-look) with desktop parity
UI HUD + buttons
Audio manager + at least one SFX
Asset folder structure + loaders + registry
Debug overlay + FPS
v1.1 (strong nice-to-have)
Animated character .glb included and wired
Gamepad support
Pinch-to-zoom / camera distance gesture (optional)
vNext (optional)
Physics integration toggle


2D mode example (orthographic camera + sprites plane)
Procedural level helpers
Minimal ECS example (only if desired)

13) Acceptance Test Plan
Cold start
Clone → npm install → npm run dev → playable.
Build validation
npm run build + npm run preview works.
Gameplay
Mobile: tap-to-move and drag-to-look work; collect pickups; score increments; SFX plays; timer ends; results screen shows.
Desktop: pointer parity works; keyboard fallback works.
Assets
- The example game visibly uses Kenney models (player, arena, pickup) and Kenney SFX plays on both iOS Safari (mp3) and desktop (mp3/ogg).
Restart
Restart from results 5x without refresh; no increasing lag.
Docs recipe
Follow “Add a new sound” recipe and verify.
Asset add
Drop a .glb, register it, load and place it.
Debug
Toggle FPS, open inspector in dev only.

Mobile acceptance (primary)
- Touch does not break the game loop (UI buttons clickable, character can always be moved via tap-to-move)
- Drag-to-look does not “fight” page scrolling (prevent default where appropriate)
- Audio unlock flow is clear (one tap enables audio; no repeated console spam)

14) Open Questions / Decisions (captured for alignment)
Animated character source: choose an internally approved asset or a permissively licensed one.
UI approach: HTML overlay vs Babylon GUI (recommend HTML for speed + familiarity).
Minimum supported mobile browsers/OS versions (to avoid “it broke on my device” during jam).
Confirm Node.js 22 LTS is acceptable as the jam standard inside Supercell dev env.
Repo hosting & deploy path: internal Git + internal pages, or GitHub Enterprise, etc.

15) Notes for Implementation (practical choices)
Default camera: third-person follow with mouse look; clamp pitch.
Character: capsule collider, simple gravity raycast; if animated GLB exists, drive AnimationGroups via velocity magnitude.
Pickups: instanced meshes for performance, glow layer optional.
Asset registry: `src/assets/assetRegistry.ts` exports object map → strongly typed IDs.
If you want, I can also produce:
the exact repo file tree (with suggested filenames)
a LLM_CHEATSHEET.md draft that’s very “commandable”
and a minimal “definition of done” checklist you can paste into the jam kickoff page.

16) Risks & mitigations (jam-proofing)
- Asset licensing delays animated character: ship a capsule + documented upgrade path; keep animation wiring optional.
- Mobile friction (touch gesture conflicts / audio unlock): include explicit UI prompts and TROUBLESHOOTING entries.
- Template drift over time: keep CI gates on build; avoid adding “optional” deps by default.
- Over-architecture pressure: enforce “thin helpers” rule and keep the repo skeleton stable and obvious.

17) Multi-session handoff (LLM-friendly)
This PRD is meant to be implemented across multiple sessions. Each session should preserve these invariants and leave a clear “handoff note” (what changed + what’s next).

17.1 Hard invariants (do not break)
- Commands: `npm run dev`, `npm run build`, `npm run preview` must stay working.
- Runtime assets load from `public/assets/...` only (never from `kenney/`).
- Touch-first controls are the primary path; desktop keyboard is fallback.
- Dev-only tooling (Inspector) must not ship enabled in production builds.
- State transitions must dispose/clean up (restart Play repeatedly without leaks).

17.2 “One obvious place” targets (stable file paths)
- Input bindings: `src/input/bindings.ts`
- Input logic (touch/pointer/keyboard): `src/input/InputManager.ts`
- Asset registry + loaders: `src/assets/assetRegistry.ts`, `src/assets/loaders.ts`
- Game flow/state switching: `src/game/Game.ts`, `src/game/StateManager.ts`
- Touch-to-move implementation: `src/player/PlayerController.ts` (or a dedicated `src/player/ClickToMove.ts`)
- Example pickups/score: `src/world/Pickups.ts`
- UI overlay: `src/ui/` (HTML/CSS/TS)

17.3 Recommended implementation order (high-level)
- Bootstrap (canvas/engine/render loop) + StateManager
- Boot/Menu/Play/Results flow with clean dispose/restart
- Touch-first input (tap-to-move + drag-to-look) + desktop parity + keyboard fallback
- Player controller + camera follow
- World arena + pickups + score + timer + results
- Audio manager with iOS-safe formats (mp3 preferred) + mobile unlock
- Debug overlay + dev-only inspector toggle