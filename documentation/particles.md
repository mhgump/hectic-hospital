# Particles in JamKit (Babylon.js)

This doc summarizes how to use particles in Babylon.js in a jam-friendly way, with JamKit’s constraints (mobile-first, restart-safe, modular imports).

Official docs (full reference): [Babylon.js Particles](https://doc.babylonjs.com/features/featuresDeepDive/particles/)

## When to use particles

Particles are great for “juice” with small code changes:
- pickup bursts
- hits / damage feedback
- dust, smoke, magic trails

They can also become a performance problem fast. Keep them short-lived and sparse.

## Babylon basics

The classic system is `ParticleSystem`:
- you set a texture
- you configure lifetime, size, colors, emission
- you start it, then stop/dispose it

JamKit example:
- `src/world/Pickups.ts` spawns a short burst and disposes it shortly after.

## JamKit rules of thumb

- **Always dispose** particle systems you create (restart-safe).
- Prefer **burst** particles over long-running emitters.
- Keep particle counts low on mobile.

## Modular import gotchas

JamKit uses tree-shaken `@babylonjs/core`. If you add new particle features and see shader/import errors:
- Read `documentation/babylon-imports.md`
- Add required side-effect imports to `src/main.ts`

## Common patterns

### One-shot burst

- Create system
- Configure lifetime + count
- Start
- Schedule disposal (e.g., `setTimeout`)

### Looping ambient (use sparingly)

If you truly need it:
- keep emission rate small
- stop and dispose on state exit


