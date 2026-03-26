# Meshes in JamKit (Babylon.js)

This doc is a jam-focused overview of meshes: creating, transforming, picking, and importing. It also points at the Babylon reference and JamKit helper utilities.

Official docs (full reference): [Babylon.js Mesh](https://doc.babylonjs.com/features/featuresDeepDive/mesh/)

## Mental model

- A **mesh** is renderable geometry in the scene.
- A mesh has transforms: `position`, `rotation`, `scaling` (and optionally a `rotationQuaternion`).
- Many imported GLBs come with multiple meshes; you often want a single “root” transform to move/scale everything together.

## Creating meshes (procedural)

Use `MeshBuilder` for fast prototypes (boxes, spheres, ground, etc.). JamKit uses this for:
- invisible pick plane (tap-to-move raycast target)
- simple debug shapes / markers

## Importing meshes (GLB / glTF)

JamKit’s asset pipeline:
- put runtime files in `public/assets/...`
- register in `src/assets/assetIds.ts` + `src/assets/assetRegistry.ts`
- load via `loadModelContainer(scene, AssetId.X)` (`src/assets/loaders.ts`)

### Rooting and normalization (JamKit helpers)

Imported models vary wildly in scale/orientation. JamKit includes helpers:
- `src/world/modelNormalize.ts`
  - `createRootForContainer(...)`
  - `normalizeRootToWorld(...)`
  - `normalizeRootToParent(...)`

These let you:
- scale a model to a target size (world XZ or parent-space height)
- lift it so it sits on the ground (minY)
- center it (XZ)

## Picking / raycasts

Babylon picking (`scene.pick(...)`) relies on rays.

JamKit gotcha: with tree-shaken `@babylonjs/core`, you must import the ray module:
- `import "@babylonjs/core/Culling/ray";` (kept in `src/main.ts`)

## Modular import gotchas

If you see shader compile errors like HTML in shader source, it’s usually missing a side-effect import.
See `documentation/babylon-imports.md`.


