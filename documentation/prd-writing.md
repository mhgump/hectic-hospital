# Writing Game Plans / PRDs

When a user describes a game idea, you'll typically write a plan or PRD (Product Requirements Document) before implementing. This guide covers best practices learned from building games with this template.

---

## Before Writing the Plan

### Ask Clarifying Questions

Don't assume — ask about ambiguous aspects upfront:

- **Input method**: Tap target? Drag to aim? Auto-fire when in range?
- **Core loop**: Time-limited? Wave-based? Endless?
- **Win/lose conditions**: Can the player die? What ends the game?
- **Scope check**: Which existing systems to keep, modify, or remove?

Getting these answers before planning prevents major rework later.

### Verify Starting State

Before planning changes, confirm:
- `npm run dev` runs without errors
- The base game loads and renders in browser
- You understand what currently exists vs. what needs to be created

---

## Key Learnings for Plan Structure

### 1. Visual Verification Checkpoints

**This is the most important lesson.** After any stage that changes what renders, include a checkpoint:

```markdown
### User Checkpoint
> Refresh browser. Verify:
> - Player character visible on screen
> - Ground/floor renders  
> - No red errors in console
```

Catching rendering issues early (Stage 1) is much easier than debugging after building complex gameplay on top.

### 2. Explicit File Operations

Don't assume files exist. Clearly state what needs to happen:

```markdown
### File Changes
- **CREATE**: `src/combat/ProjectileManager.ts` — new file
- **MODIFY**: `src/states/PlayState.ts` — add combat system
- **MODIFY**: `src/game/GameModel.ts` — add health, killCounts fields
- **DELETE**: `src/sample/CrystalMachine.ts` — no longer needed
```

### 3. Extend GameModel Early

If your game needs to track new state (health, ammo, kills, etc.), define the `GameModel` extensions in the plan:

```markdown
### GameModel Extensions
Add to `src/game/GameModel.ts`:
- `health: number` — current player health
- `maxHealth: number` — starting health
- `isDead: boolean` — death state
- `killCounts: Record<string, number>` — kills per enemy type
```

### 4. Don't Batch Visual Changes

When theming or scaling, make one change at a time:

**Bad**: "Change all colors to ice theme, swap tree models, scale everything 25%, add snow particles"

**Good**: 
1. Change ground color → verify
2. Swap tree models → verify  
3. Scale entities → verify
4. Add particles → verify

### 5. Asset Verification

After adding new assets, verify they load before using them in gameplay:

```markdown
### After Adding Assets
> Refresh browser. Check console for:
> - No 404 errors for new model/sound files
> - No "Unable to load" errors
```

---

## Known Risks (JamKit-Specific)

Include relevant warnings in your plan:

### Shader Import Issues

**Risk**: Adding new material types or visual features may cause shader errors (`<!doctype html>` in shader code).

**Mitigation**: After adding visual features, check browser console. If you see shader errors, add imports to `src/main.ts`. See `documentation/babylon-imports.md`.

### Physics WASM Loading

**Risk**: Havok physics WASM file must be in correct location or you get "expected magic word" errors.

**Mitigation**: Verify `public/assets/physics/HavokPhysics.wasm` exists. See `documentation/physics.md`.

### Audio Unlock on Mobile

**Risk**: Mobile browsers block audio until user interaction.

**Mitigation**: First user tap must trigger `AudioManager.unlock()`. This is handled automatically but don't remove the unlock flow.

### Asset Path Gotchas

**Risk**: Asset paths in registry should NOT include `public/` prefix.

**Mitigation**: Use `assets/models/foo.glb`, not `public/assets/models/foo.glb`.

---

## Suggested Plan Template

```markdown
# [Game Name] Implementation Plan

## Overview
Brief description of the game and core mechanics.

## Pre-flight
- [ ] `npm run dev` works
- [ ] Base template loads in browser

## Stage 1: [Core Visible Element]
Get something rendering first — even a placeholder.

### File Changes
- CREATE: ...
- MODIFY: ...

### Implementation
1. ...

### User Checkpoint
> Refresh browser. Verify: [what should be visible]

## Stage 2: [Core Mechanic]
...

## Stage 3: [Additional Features]
...

## Known Risks
- [ ] Shader imports if using new materials
- [ ] Asset paths registered correctly
```

---

## What NOT to Do

1. **Don't assume rendering works** — verify visually after first stage
2. **Don't batch unrelated changes** — one feature at a time
3. **Don't skip the clarifying questions** — ambiguity causes rework
4. **Don't create files without noting it in the plan** — explicit > implicit
5. **Don't ignore console errors** — fix them before moving on

---

## See Also

- `documentation/TROUBLESHOOTING.md` — Common issues and fixes
- `documentation/babylon-imports.md` — Shader import recipes
- `documentation/assets.md` — Asset pipeline details
