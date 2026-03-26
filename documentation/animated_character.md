# Animated Characters (Quaternius)

This project can use Quaternius low-poly GLB characters with built-in animations.

## Assets

- Put character GLBs in `public/assets/models/`
- Register them in `src/assets/assetIds.ts` and `src/assets/assetRegistry.ts`
- Load them with `loadModelContainer()` (see `src/assets/loaders.ts`)

## Built-in animations

Quaternius character GLBs already include animation groups, so you can use those directly.
For the wizard, the built-in groups are:

- `CharacterArmature|CharacterArmature|Death`
- `CharacterArmature|CharacterArmature|Defeat`
- `CharacterArmature|CharacterArmature|Idle`
- `CharacterArmature|CharacterArmature|Jump`
- `CharacterArmature|CharacterArmature|PickUp`
- `CharacterArmature|CharacterArmature|Punch`
- `CharacterArmature|CharacterArmature|RecieveHit` (misspelled in file)
- `CharacterArmature|CharacterArmature|Roll`
- `CharacterArmature|CharacterArmature|Run`
- `CharacterArmature|CharacterArmature|Run_Carry`
- `CharacterArmature|CharacterArmature|Shoot_OneHanded`
- `CharacterArmature|CharacterArmature|SitDown`
- `CharacterArmature|CharacterArmature|StandUp`
- `CharacterArmature|CharacterArmature|SwordSlash`
- `CharacterArmature|CharacterArmature|Victory`
- `CharacterArmature|CharacterArmature|Walk`
- `CharacterArmature|CharacterArmature|Walk_Carry`

To inspect available animations at runtime, log `container.animationGroups.map((g) => g.name)`.

## Switching animations

`src/player/CharacterAnimator.ts` takes two `AnimationGroup` instances (idle + walk).
In `src/states/PlayState.ts`, movement is already hooked up:

- standing: `Idle`
- moving: `Walk`

If you add more actions later (e.g., Run/Jump), extend `CharacterAnimator` with
explicit state methods (no fallbacks), and switch states based on input.

## Gotchas

- Invisible mesh: some Quaternius GLBs use `alphaMode: MASK` with base alpha set
  to `0`. This makes the mesh fully transparent while still casting shadows.
  Fix by setting `material.alpha = 1` and `transparencyMode` to
  `PBRMaterial.PBRMATERIAL_OPAQUE`. The wizard load path already does this.
- Facing direction: if a character faces +X while movement expects +Z, apply a
  fixed yaw rotation on the character root after load.
- Root motion: some animations include root tracks on `CharacterArmature`.
  If the character drifts, strip root motion or keep position controlled by
  `PlayerController` only.

## About the Universal Animation Library (UAL)

The separate UAL animation library is optional. If you rely on built-in character
animations, you do not need `quaternius-animation-library-GLB`.

Use UAL only if you want extra actions or a shared animation set across multiple
characters, and be ready to retarget bone names.
