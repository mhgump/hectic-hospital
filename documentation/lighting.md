# Lighting and Shadows in JamKit

How to set up good-looking lighting with shadows in Babylon.js.

**Reference:** https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows

---

## Current Setup

JamKit uses a two-light setup for balanced lighting:

### 1. Hemispheric Light (Ambient Fill)

```typescript
const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
hemiLight.intensity = 0.4;
hemiLight.groundColor = new Color3(0.3, 0.25, 0.2); // Warm ground bounce
```

- Provides soft ambient light from all directions
- `groundColor` simulates light bouncing off the ground
- **Does NOT cast shadows**

### 2. Directional Light (Sun, Casts Shadows)

```typescript
const sunLight = new DirectionalLight(
  "sunLight",
  new Vector3(-0.5, -1, -0.3).normalize(), // Direction toward ground
  scene
);
sunLight.intensity = 0.9;
sunLight.position = new Vector3(10, 20, 10); // For shadow calculations
```

- Simulates sun/moon with parallel rays
- Direction vector points where light is going (toward ground)
- Position affects shadow projection

---

## Shadow Generator

```typescript
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

const shadowGenerator = new ShadowGenerator(1024, sunLight);
shadowGenerator.useBlurExponentialShadowMap = true; // Soft shadows
shadowGenerator.blurKernel = 32;                     // Blur amount
shadowGenerator.darkness = 0.3;                      // 0 = black, 1 = invisible
```

### Shadow Map Size

- `512` — Fast, blocky shadows
- `1024` — Good balance (current)
- `2048` — High quality, slower
- `4096` — Very high quality, can be slow on mobile

### Shadow Types

```typescript
// Sharp shadows (fastest)
shadowGenerator.usePoissonSampling = true;

// Soft shadows (current, good quality)
shadowGenerator.useBlurExponentialShadowMap = true;
shadowGenerator.blurKernel = 32;

// Very soft shadows (slower)
shadowGenerator.useContactHardeningShadow = true;
shadowGenerator.contactHardeningLightSizeUVRatio = 0.05;
```

---

## Making Objects Cast Shadows

```typescript
// Add a mesh as shadow caster
shadowGenerator.addShadowCaster(mesh);

// Or add all meshes from a container
for (const mesh of container.meshes) {
  shadowGenerator.addShadowCaster(mesh);
}
```

---

## Making Objects Receive Shadows

```typescript
mesh.receiveShadows = true;

// Or for all meshes in a container
for (const mesh of container.meshes) {
  mesh.receiveShadows = true;
}
```

---

## Required Side-Effect Imports

Add to `src/main.ts`:

```typescript
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
```

Without the shadow component import, shadows won't render.

---

## Light Types Comparison

| Light Type | Shadows? | Use Case |
|------------|----------|----------|
| **HemisphericLight** | ❌ No | Ambient fill, sky light |
| **DirectionalLight** | ✅ Yes | Sun, moon (parallel rays) |
| **PointLight** | ✅ Yes | Lamps, explosions (radial) |
| **SpotLight** | ✅ Yes | Flashlights, spotlights (cone) |

---

## Performance Tips

### Mobile Optimization

```typescript
// Lower shadow map resolution
const shadowGenerator = new ShadowGenerator(512, sunLight);

// Use simpler shadow type
shadowGenerator.usePoissonSampling = true;

// Reduce blur (or disable)
shadowGenerator.blurKernel = 16;
```

### Limit Shadow Casters

Only add important objects as shadow casters:

```typescript
// Good: Only player and major objects
shadowGenerator.addShadowCaster(playerMesh);
shadowGenerator.addShadowCaster(bossMesh);

// Bad: Every small pickup
// This can be expensive with many objects
```

### Freeze Shadow Map

If light and casters don't move:

```typescript
shadowGenerator.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
```

---

## Adjusting Light Direction

The direction vector points where the light is going:

```typescript
// Sun high in sky, slightly from right
new Vector3(-0.5, -1, -0.3).normalize()

// Dramatic low sun from left
new Vector3(1, -0.3, 0).normalize()

// Straight down (noon)
new Vector3(0, -1, 0)
```

---

## Changing Scene Background

```typescript
import { Color4 } from "@babylonjs/core/Maths/math.color";

// Sky blue
scene.clearColor = new Color4(0.529, 0.808, 0.922, 1);

// Dark/night
scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

// Gradient sky (more complex, needs skybox or shader)
```

---

## Debugging Shadows

### Shadows Not Showing?

1. Check that `shadowGeneratorSceneComponent` is imported
2. Verify light is a DirectionalLight, PointLight, or SpotLight (not Hemispheric)
3. Check `mesh.receiveShadows = true` on receivers
4. Check `shadowGenerator.addShadowCaster(mesh)` on casters
5. Verify light direction points toward objects

### Shadows Look Wrong?

- **Too dark:** Increase `shadowGenerator.darkness` (toward 1)
- **Too blocky:** Increase shadow map size or enable blur
- **Missing parts:** Increase `light.shadowMinZ` and `light.shadowMaxZ`

---

## Example: Complete Lighting Setup

```typescript
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Sky color
scene.clearColor = new Color4(0.529, 0.808, 0.922, 1);

// Ambient
const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
ambient.intensity = 0.4;
ambient.groundColor = new Color3(0.3, 0.25, 0.2);

// Sun with shadows
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3).normalize(), scene);
sun.intensity = 0.9;
sun.position = new Vector3(10, 20, 10);

const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 32;
shadows.darkness = 0.3;

// Later, when loading models:
shadows.addShadowCaster(playerMesh);
groundMesh.receiveShadows = true;
```

