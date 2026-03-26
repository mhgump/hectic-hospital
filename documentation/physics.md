# Physics in JamKit (Babylon.js)

This is a JamKit-oriented summary of Babylon physics: what to choose, how to wire it, and the common pitfalls (especially with modular imports + mobile).

Official docs (full reference): [Babylon.js Physics](https://doc.babylonjs.com/features/featuresDeepDive/physics/)

Havok plugin docs: [Havok physics plugin](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin)

## When to use physics in a jam

Prefer **no physics** if you can (hand-authored collisions, simple circle colliders, grid movement). Physics adds:
- CPU cost (especially on mobile)
- determinism issues
- tricky “why is this jittering?” debugging

Use physics when you need:
- stacking / rigid bodies
- believable bounces
- raycasts/shape casts backed by a physics world
- constraints/joints

## High-level Babylon model

- **Meshes / transform nodes**: visual scene graph
- **Physics bodies**: simulated objects (position/velocity/constraints)
- **Colliders / shapes**: how bodies collide
- **A physics plugin**: the actual physics solver implementation Babylon uses under the hood

You typically:
- create the scene
- initialize the physics plugin + enable physics on the scene
- create bodies/shapes and attach them to meshes
- step/update happens as part of the scene loop (plugin-driven)

## Choosing a physics plugin

Babylon supports multiple backends (plugin-based). Your choice affects:
- performance (mobile/desktop)
- features (joints, character controllers, etc.)
- build complexity (WASM, extra packages)

JamKit guidance:
- Start without physics, then add it only if the prototype truly needs it.
- When you add it, keep it **minimal**: static ground, a few dynamic bodies, limited constraints.

## JamKit default: Havok (WASM) enabled

JamKit ships with **Havok physics enabled by default** (MIT licensed, WebAssembly-based) via `@babylonjs/havok`.

- **Enable/disable**: `Tuning.physicsEnabled` in `src/config/tuning.ts`
- **Gravity**: `Tuning.physicsGravityY` in `src/config/tuning.ts`
- **Bootstrap helper**: `src/physics/enableHavokPhysics.ts`
- **WASM file**: `public/assets/physics/HavokPhysics.wasm` (loaded via `locateFile()` to work reliably in Vite dev server)

### What you must do to use Havok physics

1. **Enable physics for the scene**
   - Call `await enableHavokPhysics(scene, { gravity: new Vector3(0, -Tuning.physicsGravityY, 0) })` early in your state `enter()`.
   - JamKit does this in `src/states/PlayState.ts`.

2. **Give the world a static collider**
   - Physics bodies need something to collide with (e.g. a static ground).
   - JamKit creates an invisible ground collider and attaches a static body with `PhysicsAggregate(..., { mass: 0 })`.

3. **Create bodies for dynamic objects**
   - In Babylon Physics v2, JamKit uses `PhysicsAggregate` + `PhysicsShapeType`.
   - Example: `new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE, { mass: 1 }, scene)`

### Common Havok-specific failure mode (Vite dev server)

If you see:

```
WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f
```

It means the Havok WASM fetch returned HTML (often `index.html`) instead of a `.wasm`.
JamKit fixes this by:
- Committing the wasm at `public/assets/physics/HavokPhysics.wasm`
- Using `locateFile()` in `src/physics/enableHavokPhysics.ts` to force the correct URL

If you don’t want physics in your fork:
- delete `src/physics/`
- remove `@babylonjs/havok` from `package.json`
- delete `public/assets/physics/HavokPhysics.wasm`
- set `Tuning.physicsEnabled = false` (or remove the call in `PlayState`)

## JamKit note: “real physics” vs “good-enough” physics

For many jam needs, you can get 80% of the feel with tiny “kinematic physics” updates (gravity + ground clamp).

JamKit keeps a **non-physics fallback path** for pickups when `Tuning.physicsEnabled = false`:
- Crystals still drop from the sky using `Tuning.crystalDropStartY` + `Tuning.crystalGravity`
- No physics backend required

In the default sample, crystals use real Havok physics bodies when enabled.

## JamKit gotchas (modular imports + bundling)

JamKit uses tree-shaken `@babylonjs/core`. If you add physics and hit shader/import errors:
- Read `documentation/babylon-imports.md`
- Add needed side-effect imports to `src/main.ts`

## Performance tips (especially for mobile)

- Prefer **fewer bodies** over “lots of tiny things”
- Use simple shapes (box/sphere/capsule) instead of mesh colliders
- Avoid complex constraints unless you need them
- Don’t run physics for UI-only scenes (menu/results)

## Recommended workflow

1. Prototype with simple collisions (like JamKit’s circle obstacles)
2. If physics is needed, add it in a dedicated “system” (see `documentation/ARCHITECTURE.md`)
3. Keep your `PlayState` as an orchestrator: create physics world, create bodies, update, dispose


