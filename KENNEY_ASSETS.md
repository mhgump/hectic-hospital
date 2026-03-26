# Kenney Assets (CC0) — Vendored Bundle + Runtime Subset

JamKit vendors the full Kenney bundle under `kenney/`, but the **game should only load from the curated runtime subset** under `public/assets/...`.

## Why this exists
- Keeps the template small and predictable (fast clone, fast build)
- Ensures “known-good” assets that the example game already uses
- Gives LLMs exact, stable paths to reference
Note: the repo can still be large because `kenney/` is intentionally included for versatility. Production builds stay small because we don’t load from `kenney/`.

## What packs are available in the vendored bundle?

See `documentation/KENNEY_CATALOG.md` (and use `npm run kenney:search -- <query>` to find filenames).

## Runtime subset (used by the example game)

### 3D models
- **Player character**
  - `public/assets/models/kenney/blocky-characters/character-a.glb`
  - `public/assets/models/kenney/blocky-characters/Textures/texture-a.png`

- **Arena**
  - `public/assets/models/kenney/mini-arena/floor.glb`
  - `public/assets/models/kenney/mini-arena/wall.glb`
  - `public/assets/models/kenney/mini-arena/wall-corner.glb`
  - `public/assets/models/kenney/mini-arena/tree.glb`
  - `public/assets/models/kenney/mini-arena/Textures/colormap.png`

- **Pickup**
  - `public/assets/models/kenney/tower-defense/detail-crystal.glb`
  - `public/assets/models/kenney/tower-defense/Textures/colormap.png`

### UI art (optional)
- `public/assets/ui/kenney/mobile-controls/button_circle.png`

### Audio (ship mp3 for iOS Safari)
- UI click: `public/assets/sounds/kenney/interface/click_001.{mp3,ogg}`
- Pickup: `public/assets/sounds/kenney/interface/confirmation_001.{mp3,ogg}`

## If you add more Kenney assets
- Copy only what you use into `public/assets/...` (do not load from `kenney/` at runtime)
- If a Kenney `.glb` references external textures, copy the `Textures/` folder alongside the model and keep the exact casing (e.g. `Textures/colormap.png`)
- Add entries to `ASSET_CREDITS.md`
- Prefer `.glb` for 3D and `.mp3` (or AAC) for any audio that must work on iOS Safari

## If a team wants to slim down their fork
Because Kenney is CC0, it’s legally fine to keep distributing it — but teams may prefer a smaller repo.
- Delete the `kenney/` folder in their fork once they’ve curated what they need into `public/assets/...`
- Add `kenney/` to `.gitignore` in their fork to avoid accidentally re-adding it


