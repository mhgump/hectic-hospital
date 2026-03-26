# Sprites in JamKit (Babylon.js)

Sprites are a fast way to do 2D characters/effects inside Babylon (great for jam prototypes), without building full 3D meshes.

Official docs (full reference): [Babylon.js Sprites](https://doc.babylonjs.com/features/featuresDeepDive/sprites/)

## When sprites are a good fit

- 2D games in a 3D scene (top-down shooters, bullet hell, roguelikes)
- VFX layers (sparkles, hit flashes)
- Simple billboarded props (coins, pickups)

If you need:
- complex lighting/shadows
- 3D interactions
…use meshes instead.

## Babylon sprite model

Typically you use:
- `SpriteManager` (owns a sprite sheet texture + manages instances)
- `Sprite` (an instance you position/animate)

For many sprites:
- keep them in one/few managers
- reuse sprite sheets

## JamKit gotchas

- **Asset pipeline**: spritesheet images should live in `public/assets/...` and be referenced via `resolvePublicAssetUrl(...)`.
- **Restart safety**: dispose sprite managers / remove references on state exit.
- **Modular imports**: if you hit “needs to be imported” / shader issues, see `documentation/babylon-imports.md`.

## Tips for mobile performance

- Limit overdraw (big translucent sprites are expensive)
- Avoid huge numbers of animated sprites at once
- Prefer smaller textures


