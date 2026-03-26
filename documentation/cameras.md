# Cameras in JamKit (Babylon.js)

This doc explains **Babylon camera choices** and the **non-obvious gotchas** (coordinate system, ArcRotate alpha/beta, orthographic bounds).

For Babylon’s full reference, see the official deep dive: [Babylon.js Cameras](https://doc.babylonjs.com/features/featuresDeepDive/cameras/).

## JamKit defaults (minimal, for orientation)

- The starter gameplay uses an **ArcRotateCamera**.
- Camera feel is tuned in `src/config/tuning.ts`.
- JamKit includes a small helper `src/engine/createOrthoCameraRig.ts` to:
  - set orthographic bounds
  - update them on resize
  - cleanly remove the resize observer on state exit (restart-safe)

## Fixed design resolution (portrait scaling + camera fidelity)

If you want **the same amount of world visible on every screen** (only sharper on larger
displays), use a **fixed design resolution** and scale the whole game uniformly.

Key idea:
- The canvas and UI are laid out at a fixed size (e.g. **480×800**).
- The whole game shell is **scaled uniformly** to fit the browser.
- The **camera does not zoom**; instead you raise render resolution on bigger screens.

Implementation checklist (high level):
1) **Pick a design size** (e.g. 480×800) and keep it in one config.
2) **Wrap the game shell** in a scaling container:
   - `#game-shell-scale` wraps `#game-shell`.
3) **CSS**:
   - `#game-shell` uses fixed width/height (design size).
   - `#game-shell-scale` uses `transform: scale(...)` and is centered on screen.
4) **Resize handler**:
   - `scale = min(viewportWidth / designWidth, viewportHeight / designHeight)`.
   - Apply scale to the wrapper (CSS variable or inline style).
5) **Fidelity (not layout)**:
   - Increase Babylon render resolution on large screens using
     `engine.setHardwareScalingLevel(1 / renderScale)`.

Camera benefit:
- **Visible world area stays consistent** across devices, because the logical canvas size
  never changes.

Input/picking note:
- With CSS transforms, map pointer positions from **client space** to **render space**
  before calling `scene.pick(...)`. Otherwise taps will be offset.

## Coordinate system (what most gameplay code assumes)

- **Y is up**
- Ground plane is typically **y = 0**
- JamKit gameplay code assumes **+Z is forward** for “facing/moving forward” math.

Babylon is **left-handed by default** (unless you explicitly enable right-handed mode on the scene). If you switch handedness, be mindful that “forward” conventions and rotations may feel flipped.

## Camera types (which one to pick)

### ArcRotateCamera (top-down / isometric-ish / “orbit” camera)

Best for:
- top-down and “Clash Royale” style views
- strategy/isometric-ish prototypes

Key concept: **alpha/beta**
- **alpha**: rotation around Y (yaw / orbit)
- **beta**: angle from the vertical axis (tilt)

Rule of thumb:
- smaller beta = more top-down
- larger beta = more side-on

### UniversalCamera / FreeCamera (first-person / third-person)

Best for:
- FPS-style
- “move camera freely” prototypes

You typically:
- position the camera
- `camera.attachControl(canvas, true)`
- move the camera each frame or rely on built-in inputs

### FollowCamera (chase camera)

Best for:
- third-person follow setups
- racing-style chase cameras

You set the follow target and tweak follow offsets/lag.

## Orthographic vs perspective

### Perspective

- Feels natural and “3D”
- No ortho bounds needed

### Orthographic

- Great for readable top-down / tactics views
- **Requires setting `orthoLeft/Right/Top/Bottom`**
- Usually needs **resize handling** so it looks right in landscape vs portrait

Pattern:

```typescript
camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

const updateOrtho = () => {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  // Set orthoLeft/Right/Top/Bottom based on aspect
};

updateOrtho();
const obs = engine.onResizeObservable.add(updateOrtho);

// On exit/state change:
engine.onResizeObservable.remove(obs);
```

## Common patterns (switching camera styles)

### “Follow the player” (simple version)

In your per-frame update:

```typescript
camera.target = playerRoot.position;
```

If you use an **ArcRotateCamera**, be careful when calling `setTarget(...)` while the player moves.
By default, `setTarget` **rebuilds alpha/beta/radius**, which keeps the camera position fixed and
instead **rotates/pivots around the target**. This can feel like the camera is “stuck” and only
snaps into place when movement stops.

Use the `cloneAlphaBetaRadius` flag to preserve the current orientation:

```typescript
camera.setTarget(playerRoot.position, false, false, true);
```

This keeps the camera’s orientation stable and lets the view translate with the player.

### Allow user control (orbit / debug style)

```typescript
camera.attachControl(canvas, true);
// Remove alpha/beta/radius limits if you want free orbit/zoom.
```

JamKit note: the canvas has `touch-action: none` in CSS, which helps pointer/touch camera controls work smoothly.

### Lock zoom but allow rotation (nice touch-first default)

```typescript
camera.lowerRadiusLimit = camera.radius;
camera.upperRadiusLimit = camera.radius;

// Optional: clamp tilt so the scene stays readable
camera.lowerBetaLimit = 0.35;
camera.upperBetaLimit = 1.35;
```

## Gotchas in JamKit (Babylon modular imports)

JamKit uses tree-shaken `@babylonjs/core`. If you add new Babylon features and see shader/import errors,
check `documentation/babylon-imports.md` and add the needed side-effect imports to `src/main.ts`.
