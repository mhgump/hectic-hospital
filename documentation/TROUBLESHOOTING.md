# Troubleshooting JamKit

Common issues and their solutions.

---

## Black Screen / Nothing Renders

### Check browser console (F12)

Look for:
- **Red errors** — read the message, it usually tells you what's wrong
- **Shader compile errors** with `<!doctype html>` — see "Shader Errors" below

### Verify canvas exists

```javascript
// In console:
document.querySelector("#game-canvas")
```

Should return a `<canvas>` element.

### Check if engine is running

```javascript
// Quick sanity checks in console:
document.querySelector("#game-canvas")?.width
```

If the HUD is updating (score changes) and the FPS overlay (Z) updates, the render loop is running.

---

## Shader Errors ("Unable to compile effect")

### Symptom

Console shows errors like:
```
BJS - Unable to compile effect:
Vertex code: ... <!doctype html> ...
Error: VERTEX SHADER ERROR: 0:100: '<' : syntax error
```

**Key indicator**: The shader code contains `<!doctype html>` — this means Babylon received HTML instead of shader code.

### Cause

Babylon.js tree-shaking excluded a shader module. When Babylon tries to load it at runtime, Vite's dev server returns `index.html` (SPA fallback for 404s). Babylon then tries to compile HTML as shader code.

### How to Identify What's Missing

1. Look for `SHADER_NAME` in the error: e.g., `SHADER_NAME fragment:pbr` means PBR shaders
2. Look for `Defines:` section — it shows which features the shader needs (e.g., `#define PBR`, `#define LIGHT0`)

### Fix

Add the missing shader imports to `src/main.ts`. **Important**: You often need BOTH the material class AND the shader files.

**For glTF/GLB models (PBR)** — this is the most common case:
```typescript
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
// Plus many PBR shader includes — see documentation/babylon-imports.md for full list
```

**For MeshBuilder primitives (StandardMaterial)**:
```typescript
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
```

**For particles**:
```typescript
import "@babylonjs/core/Shaders/particles.vertex";
import "@babylonjs/core/Shaders/particles.fragment";
```

### Finding the Right Import Path

```bash
# List available shaders:
ls node_modules/@babylonjs/core/Shaders/ | grep -i <name>

# List shader includes:
ls node_modules/@babylonjs/core/Shaders/ShadersInclude/ | grep -i <name>
```

### Full Reference

See `documentation/babylon-imports.md` for complete copy-paste import blocks for all common use cases.

---

## Havok Physics Error (WASM “expected magic word … found <!do”)

### Symptom

Console shows something like:

```
WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f
```

### Cause

Havok tried to load its `.wasm` file but got HTML (often `index.html`) instead — typically a bad URL that Vite rewrites on 404.

### Fix (JamKit)

1. Verify the wasm file exists:

```bash
ls public/assets/physics/HavokPhysics.wasm
```

2. Hard refresh the page (to clear any cached bad URL):
   - Cmd+Shift+R / Ctrl+Shift+R

3. Ensure `src/physics/enableHavokPhysics.ts` uses `locateFile()` and `resolvePublicAssetUrl("assets/physics/HavokPhysics.wasm")`.

Reference: `documentation/physics.md` + [Havok physics plugin](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin)

---

## Model Not Visible

### 1. Check console for load errors

If you see 404 or load errors, the path is wrong.

### 2. Verify the file exists

```bash
ls public/assets/models/your-model.glb
```

### 3. Check registry path

In `src/assets/assetRegistry.ts`, the path should NOT include `public/`:

```typescript
// WRONG:
path: "public/assets/models/foo.glb"

// CORRECT:
path: "assets/models/foo.glb"
```

### 4. Model might be too small/large

GLB files can have wildly different scales. Try:

```typescript
const root = container.createRootMesh();
root.scaling = new Vector3(10, 10, 10);  // Scale up
// or
root.scaling = new Vector3(0.01, 0.01, 0.01);  // Scale down
```

### 5. Model might be below ground

Check position:

```typescript
root.position = new Vector3(0, 5, 0);  // Raise it up
```

---

## Audio Not Playing

### Mobile: Audio unlock required

Mobile browsers block audio until user interaction. The first tap unlocks audio automatically via `AudioManager.unlock()`.

**Symptom:** Sound works on desktop but not mobile.
**Solution:** Make sure `AudioManager.unlock()` is called on first tap (it should be automatic).

### iOS: Use .mp3 format

iOS Safari doesn't support `.ogg` reliably. Always ship `.mp3` files.

### Check console for errors

```
NotAllowedError: play() can only be initiated by a user gesture
```

This means audio wasn't unlocked. Ensure unlock flow is working.

---

## Touch Controls Not Working

### 1. Check if tap-to-move is wired

In `PlayState.ts`, verify:
```typescript
const taps = ctx.input.consumeTaps();
if (taps.length > 0) {
  // ...
}
```

### 2. Check for Ray import

If you see "Ray needs to be imported", add:
```typescript
import "@babylonjs/core/Culling/ray";
```

### 3. Verify pick plane exists

The invisible ground plane must be pickable:
```typescript
pickPlane.isPickable = true;
```

### 4. CSS issue: touch-action

The canvas should have:
```css
#game-canvas {
  touch-action: none;
}
```

Otherwise browser might intercept touches for scrolling.

---

## Keyboard Not Working

### 1. Canvas must have focus

Click on the canvas. If keyboard works after clicking, add:
```typescript
canvas.addEventListener("pointerdown", () => {
  canvas.focus({ preventScroll: true });
});
```

### 2. Check bindings

**Important:** Movement keys are currently hardcoded inside `InputManager.getMoveAxis()` as WASD + Arrow keys.

`bindings.ts` currently only controls discrete actions like Pause (Esc), Debug (Z), Inspector (X).

---

## Memory Leak / Game Gets Slower Over Time

### Symptom

After restarting the game multiple times, it gets laggy.

### Cause

Scenes or resources aren't being disposed.

### Fix

Ensure state `exit()` cleans up:
```typescript
exit() {
  this.scene?.dispose();
  this.scene = null;
  this.hud?.teardown();
  this.hud = null;
}
```

The `StateManager` should also dispose the old scene on transition.

---

## Build Fails

### TypeScript errors

```bash
npm run build
```

Read the errors. Common issues:
- Missing imports
- Type mismatches
- Undefined variables

### Module not found

Check that the import path is correct and the file exists.

---

## Dev Server Issues

### Port already in use

```
Error: Port 5173 is already in use
```

Kill the existing process or use a different port:
```bash
npm run dev -- --port 5174
```

### HMR not working

Try a hard refresh (Cmd+Shift+R / Ctrl+Shift+R).

If still broken, restart the dev server (but ask the user to do it, don't do it yourself in an LLM session).

---

## Inspector Not Opening

### X not working

1. Make sure canvas has focus (click on it)
2. Check that `InspectorToggle` action is bound in `bindings.ts`
3. Check that inspector code is in `DebugOverlay.ts`
4. Inspector only works in dev mode
5. If you see a Vite import-analysis error for the inspector, ensure the code uses `import(/* @vite-ignore */ "@babylonjs/inspector")`

### Inspector causes lag

The Babylon Inspector is heavy. It's normal for FPS to drop when it's open. Close it when done debugging.

---

## Mobile-Specific Issues

### Viewport bouncing / zooming

Add to `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
```

### Safe area issues (iPhone notch)

Use CSS env() for safe areas:
```css
padding-top: env(safe-area-inset-top);
```

### Touch target too small

Make buttons at least 44x44px for touch.
