# Babylon.js ES Module Imports (Critical!)

## The Problem

Babylon.js uses **tree-shaking** with the `@babylonjs/core` package. This means features are NOT included unless explicitly imported. If Babylon tries to use an unimported feature at runtime, it attempts to fetch the code from the server—and Vite returns `index.html` instead, causing cryptic errors.

### Symptom: WebGL Shader Compile Error

```
Error: FRAGMENT SHADER ERROR: 0:5: '<' : syntax error
BJS - Fragment code: ... <!doctype html> ...
```

This means Babylon fetched a shader file but got HTML instead.

---

## Required Side-Effect Imports

These imports register features as side-effects. Add them to `src/main.ts`:

```typescript
// ───────────────────────────────────────────────────────────────────────────
// Babylon.js ES-module side-effects
// ───────────────────────────────────────────────────────────────────────────

// PBR Material (required for glTF models which use PBR)
import "@babylonjs/core/Materials/PBR/pbrMaterial";

// Lights
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";

// Shadows (required for ShadowGenerator to work in modular builds)
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

// Ray (required for scene.pick() raycasting)
import "@babylonjs/core/Culling/ray";

// glTF Loader (for .glb/.gltf files) lives in `src/assets/loaders.ts`:
// import "@babylonjs/loaders/glTF";
```

### Physics v2 note (Havok)

JamKit uses Babylon Physics v2 + Havok. Physics requires registering the physics engine component:

```typescript
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
```

JamKit keeps this import in `src/physics/enableHavokPhysics.ts` (instead of `src/main.ts`) so teams can delete physics as one module.

---

## How to Diagnose Missing Imports

1. **Check console for shader errors** - Look for "Unable to compile effect" with HTML in the shader code
2. **Look at the shader name** - e.g., `SHADER_NAME fragment:pbr` means PBR material shaders are missing
3. **Find the import** - Usually in `node_modules/@babylonjs/core/` matching the feature name

### Common Missing Imports

| Error mentions | Import needed |
|----------------|---------------|
| `pbr` shader | `@babylonjs/core/Materials/PBR/pbrMaterial` |
| `standard` shader | `@babylonjs/core/Materials/standardMaterial` |
| `Ray needs to be imported` | `@babylonjs/core/Culling/ray` |
| Can't load `.glb` | `@babylonjs/loaders/glTF` |
| Can't load `.obj` | `@babylonjs/loaders/OBJ` |

---

## Why This Happens

Babylon's modular package splits everything into small chunks. When you import:

```typescript
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
```

You ONLY get the camera class. You don't get:
- The shaders for materials the camera might render
- The ray class for picking
- Any loaders for external files

This is intentional for bundle size, but means you must explicitly import features you use.

---

## Safe Pattern

When adding new Babylon features:

1. Add the feature code
2. Test in browser
3. If you see shader errors or "X needs to be imported", add the import to `main.ts`
4. Hard refresh (Cmd+Shift+R)

---

## Common Shader Import Recipes (Copy-Paste Blocks)

These are tested, working import blocks for common use cases. **Copy the entire block** to `src/main.ts`.

### Recipe 1: glTF/GLB Models (PBR Materials) — MOST COMMON

glTF models use PBR materials. You need BOTH the material class AND the shader files:

```typescript
// PBR Material class
import "@babylonjs/core/Materials/PBR/pbrMaterial";

// PBR shaders (must be explicitly imported for tree-shaking)
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";

// PBR shader includes (required for complex PBR features)
import "@babylonjs/core/Shaders/ShadersInclude/pbrFragmentDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/pbrUboDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/pbrFragmentSamplersDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/pbrDirectLightingSetupFunctions";
import "@babylonjs/core/Shaders/ShadersInclude/pbrDirectLightingFalloffFunctions";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBRDFFunctions";
import "@babylonjs/core/Shaders/ShadersInclude/pbrDirectLightingFunctions";
import "@babylonjs/core/Shaders/ShadersInclude/pbrIBLFunctions";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockAlbedoOpacity";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockReflectivity";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockAmbientOcclusion";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockAlphaFresnel";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockAnisotropic";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockClearcoat";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockIridescence";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockSheen";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockSubSurface";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockNormalGeometric";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockNormalFinal";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockLightmapInit";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockReflection";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockFinalColorComposition";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockFinalLitComponents";
import "@babylonjs/core/Shaders/ShadersInclude/pbrBlockFinalUnlitComponents";
import "@babylonjs/core/Shaders/ShadersInclude/pbrVertexDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/sceneUboDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/meshUboDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/lightUboDeclaration";
```

### Recipe 2: StandardMaterial (MeshBuilder primitives)

If you use `MeshBuilder.CreateBox()`, `CreateSphere()`, etc. with `StandardMaterial`:

```typescript
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
```

### Recipe 3: Particle Systems

```typescript
import "@babylonjs/core/Shaders/particles.vertex";
import "@babylonjs/core/Shaders/particles.fragment";
```

### Recipe 4: Shadows

```typescript
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";
```

### Recipe 5: GlowLayer / Post-Processing

```typescript
import "@babylonjs/core/Shaders/kernelBlur.fragment";
import "@babylonjs/core/Shaders/kernelBlur.vertex";
import "@babylonjs/core/Shaders/depthBoxBlur.fragment";
import "@babylonjs/core/Shaders/glowMapGeneration.fragment";
import "@babylonjs/core/Shaders/glowMapGeneration.vertex";
import "@babylonjs/core/Shaders/glowMapMerge.fragment";
import "@babylonjs/core/Shaders/glowMapMerge.vertex";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
```

---

## Finding Shader Import Paths

If you encounter a new shader error, here's how to find the right import:

1. **Check error message** for shader name (e.g., `SHADER_NAME fragment:pbr`)
2. **Browse the shader folder**:
   ```bash
   ls node_modules/@babylonjs/core/Shaders/ | grep -i <name>
   ls node_modules/@babylonjs/core/Shaders/ShadersInclude/ | grep -i <name>
   ```
3. **Add the import** to `src/main.ts`:
   ```typescript
   import "@babylonjs/core/Shaders/<name>.vertex";
   import "@babylonjs/core/Shaders/<name>.fragment";
   ```

---

## Full Current Imports (src/main.ts)

See `src/main.ts` for the complete, up-to-date list. The file is organized into sections with comments explaining each import group.

In `src/assets/loaders.ts`:
```typescript
import "@babylonjs/loaders/glTF";
```

---

## See Also

- [babylon-gotchas.md](./babylon-gotchas.md) - More Babylon.js common issues and best practices
- [Official ES6 Docs](https://doc.babylonjs.com/setup/frameworkPackages/es6Support) - Babylon's own documentation on ES6 modules

