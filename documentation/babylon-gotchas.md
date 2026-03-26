# Babylon.js Gotchas & Best Practices

Non-obvious issues, common mistakes, and solutions when working with Babylon.js.

**Official Docs:** https://doc.babylonjs.com/

---

## 1. Tree-Shaking and Side-Effect Imports

### The Problem

When using `@babylonjs/core` (ES modules), features are tree-shaken unless explicitly imported. If Babylon needs a feature at runtime that wasn't imported, it tries to fetch it from the server—and your bundler may return `index.html` instead.

### Symptoms

```
BJS - Unable to compile effect:
Fragment code: ... <!doctype html> ...
Error: FRAGMENT SHADER ERROR: '<' : syntax error
```

Or:
```
Ray needs to be imported before as it contains a side-effect required by your code.
```

### Solution

Add side-effect imports to your entry point (`src/main.ts`):

```typescript
// Materials (required for glTF which uses PBR)
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/standardMaterial";

// Lights
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/pointLight";

// Shadows (required for ShadowGenerator to work in modular builds)
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

// Raycasting (required for scene.pick())
import "@babylonjs/core/Culling/ray";

// Mesh builders (if using MeshBuilder)
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
// etc.

// Loaders (for external files)
import "@babylonjs/loaders/glTF";  // .glb, .gltf
import "@babylonjs/loaders/OBJ";   // .obj (if needed)
```

**Reference:** https://doc.babylonjs.com/setup/frameworkPackages/es6Support

---

## JamKit-specific symptoms (what we saw in this repo)

### Shader code contains HTML (`<!doctype html>`)

If you see Babylon logging a shader whose source code literally contains your `index.html`, that almost always means:

- Babylon tried to load a shader/module at runtime (because it was tree-shaken out)
- Vite served `index.html` as the fallback response
- WebGL compiler hit `'<': syntax error`

The fix is **not** to change shaders; it’s to add the missing side-effect import(s) to `src/main.ts`.

See also:
- [Babylon ES6 support docs](https://doc.babylonjs.com/setup/frameworkPackages/es6Support)

### Shadows don’t work even though ShadowGenerator is created

In modular builds, you must import the scene component:

```typescript
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
```

Otherwise shadows may silently not render.

---

## JamKit-specific Vite gotcha: dynamic import of inspector

In dev we load the Inspector only when you press X. Vite can still try to analyze dynamic imports and throw:

`[plugin:vite:import-analysis] Failed to resolve import "@babylonjs/inspector"...`

JamKit uses:

```typescript
await import(/* @vite-ignore */ "@babylonjs/inspector");
```

This tells Vite not to pre-analyze that import.

## 2. Memory Leaks and Disposal

### The Problem

Babylon.js creates many GPU resources (textures, buffers, shaders). If you don't dispose them, you get memory leaks.

### What to Dispose

```typescript
// Scenes
scene.dispose();  // Disposes all meshes, materials, textures in scene

// Individual resources
mesh.dispose();
material.dispose();
texture.dispose();

// Asset containers
container.dispose();  // Disposes all assets loaded from a file

// Engine (when completely done)
engine.dispose();
```

### Common Leak Sources

1. **Restarting game without disposing scene**
2. **Creating materials/textures in a loop**
3. **Observables not unregistered**

### Best Practice

```typescript
// Track things you create
private observers: Observer<any>[] = [];

// In cleanup:
exit() {
  this.observers.forEach(o => o.remove());
  this.scene?.dispose();
  this.scene = null;
}
```

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene#dispose

---

## 3. glTF/GLB Loading Quirks

### Model “forward direction” is not guaranteed (90°-rotated characters)

Different asset packs author “forward” along different axes. Our controllers assume **+Z forward** when yaw = 0, but some models (e.g. Kenney dog) face **+X**, making them appear rotated ~90° while moving.

- **Fix**: apply a constant local yaw offset on the model’s visual root (child of the controller root), e.g.:
  - `visual.rotation.y = -Math.PI / 2` for a model that faces +X by default
- **JamKit example (optional)**: `src/states/PlayState.ts` applies a yaw offset for the sample dog visual.

### Scale Issues

GLB files can have wildly different scales (some in meters, some in centimeters, some in millimeters).

```typescript
const container = await SceneLoader.LoadAssetContainerAsync(url, "", scene);
container.addAllToScene();

// Use createRootMesh() for reliable transforms
const root = container.createRootMesh();
root.scaling = new Vector3(0.01, 0.01, 0.01);  // Scale down if too big
```

### Materials Not Showing

glTF uses PBR materials. Ensure you import:
```typescript
import "@babylonjs/core/Materials/PBR/pbrMaterial";
```

### Animations Not Playing

```typescript
// Get animation groups from container
const anims = container.animationGroups;

// Play first animation
if (anims.length > 0) {
  anims[0].start(true);  // true = loop
}
```

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF

---

## 4. Camera Coordinate System

### ArcRotateCamera

- **alpha**: Rotation around Y-axis (horizontal orbit)
  - `0` = +Z side, looking toward -Z
  - `π/2` = +X side, looking toward -X
  - `π` = -Z side, looking toward +Z
  
- **beta**: Angle from Y-axis (vertical tilt)
  - `0` = straight down
  - `π/2` = horizontal
  - `π` = straight up

- **radius**: Distance from target

### Common Mistake

Expecting alpha=0 to be "front" — it's actually on the +Z axis.

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction

---

## 5. Mobile and Touch

### Audio Unlock

Mobile browsers block audio until user interaction:

```typescript
document.addEventListener("pointerdown", () => {
  // Create and play a silent audio to unlock
  const audio = new Audio();
  audio.play().catch(() => {});
}, { once: true });
```

### Touch Events

Use `pointer` events (unified mouse + touch):

```typescript
scene.onPointerDown = (evt) => {
  // Works for both mouse and touch
};
```

### Performance

Mobile GPUs are weaker. Consider:
- Lower resolution: `engine.setHardwareScalingLevel(2)` (renders at half res)
- Fewer lights
- Simpler materials
- Disable shadows

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene

---

## 6. Scene.pick() / Raycasting

### Requires Ray Import

```typescript
import "@babylonjs/core/Culling/ray";
```

Without this, you get: `Ray needs to be imported before...`

### Using scene.pick()

```typescript
// Pick at screen coordinates
const pick = scene.pick(x, y);
if (pick.hit) {
  console.log(pick.pickedPoint);   // World position
  console.log(pick.pickedMesh);    // Mesh that was hit
}

// Filter what can be picked
const pick = scene.pick(x, y, (mesh) => mesh.name === "ground");
```

### Invisible Pickable Mesh

```typescript
const pickPlane = MeshBuilder.CreateGround("pick", { width: 100, height: 100 }, scene);
pickPlane.isVisible = false;
pickPlane.isPickable = true;
```

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/mesh/interactions/picking_collisions

---

## 7. Observables and Event Cleanup

### The Problem

Babylon uses observables for events. If you add observers but don't remove them, they accumulate.

### Pattern

```typescript
// Store the observer
const observer = scene.onBeforeRenderObservable.add(() => {
  // Update logic
});

// Remove on cleanup
scene.onBeforeRenderObservable.remove(observer);

// Or clear all
scene.onBeforeRenderObservable.clear();
```

### Common Observables

- `scene.onBeforeRenderObservable` — every frame, before render
- `scene.onAfterRenderObservable` — every frame, after render
- `scene.onPointerObservable` — pointer events
- `engine.onResizeObservable` — window resize

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/events/observables

---

## 8. Orthographic Camera

### Setting Up

```typescript
import { Camera } from "@babylonjs/core/Cameras/camera";

camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

// Must set bounds!
camera.orthoLeft = -10;
camera.orthoRight = 10;
camera.orthoTop = 10;
camera.orthoBottom = -10;
```

### Aspect Ratio

Adjust bounds based on canvas aspect ratio:

```typescript
const updateOrtho = () => {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  camera.orthoLeft = -size * aspect;
  camera.orthoRight = size * aspect;
  camera.orthoTop = size;
  camera.orthoBottom = -size;
};
engine.onResizeObservable.add(updateOrtho);
```

---

## 9. Inspector (Dev Tool)

### Dynamic Import to Avoid Bundling

```typescript
// Only load when needed, skip in production
if (import.meta.env.DEV) {
  await import(/* @vite-ignore */ "@babylonjs/inspector");
  scene.debugLayer.show({ embedMode: true });
}
```

### Toggle On/Off

```typescript
if (scene.debugLayer.isVisible()) {
  scene.debugLayer.hide();
} else {
  scene.debugLayer.show();
}
```

**Reference:** https://doc.babylonjs.com/toolsAndResources/inspector

---

## 10. Asset Container Pattern

### Why Use AssetContainer

Instead of loading directly into scene, load into a container:
- Can instantiate multiple copies
- Easy disposal
- Better control over what's added to scene

```typescript
const container = await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);

// Add everything to scene
container.addAllToScene();

// Or instantiate (for multiple copies)
const instance = container.instantiateModelsToScene();

// Dispose when done
container.dispose();
```

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/importers/assetContainers

---

## 11. Common Performance Issues

### Too Many Draw Calls

- Use instancing for repeated objects
- Merge static meshes
- Use LOD (Level of Detail)

### Shader Compilation Stutter

- Precompile materials before gameplay
- Use `material.freeze()` when material won't change

### Texture Memory

- Use compressed textures (KTX2)
- Lower resolution for mobile
- Dispose textures when no longer needed

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene

---

## 12. WebGL Context Loss

### What Happens

Browser can kill WebGL context (memory pressure, tab backgrounded on mobile, GPU crash).

### Handling

```typescript
engine.onContextLostObservable.add(() => {
  console.warn("WebGL context lost");
});

engine.onContextRestoredObservable.add(() => {
  console.log("WebGL context restored");
  // May need to reload textures/shaders
});
```

---





## Babylon.js Side-Effects

If you see shader errors or "X needs to be imported", add imports to `src/main.ts`:

```typescript
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Culling/ray";
```

See `documentation/babylon-imports.md` for details.


--


## Quick Reference Links

| Topic | URL |
|-------|-----|
| ES6 Modules / Tree Shaking | https://doc.babylonjs.com/setup/frameworkPackages/es6Support |
| Cameras | https://doc.babylonjs.com/features/featuresDeepDive/cameras |
| glTF Loading | https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF |
| Optimization | https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene |
| Inspector | https://doc.babylonjs.com/toolsAndResources/inspector |
| Picking/Raycasting | https://doc.babylonjs.com/features/featuresDeepDive/mesh/interactions/picking_collisions |
| Observables | https://doc.babylonjs.com/features/featuresDeepDive/events/observables |
| Forum | https://forum.babylonjs.com/ |
| Playground | https://playground.babylonjs.com/ |

