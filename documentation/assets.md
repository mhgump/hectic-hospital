# Asset Pipeline in JamKit

## Overview

Assets (3D models, sounds, textures) are served from `public/assets/` and loaded at runtime via Babylon.js loaders.

```
public/assets/
├── models/
│   └── kenney/          # Curated Kenney models for the example game
├── sounds/
│   └── kenney/          # Curated Kenney sounds
└── (other assets...)
```

---

## Adding a New Asset

### Step 1: Copy the File

Place the file in `public/assets/`:
```
public/assets/models/my-model.glb
public/assets/sounds/my-sound.mp3
```

### Step 2: Add to AssetId Enum

In `src/assets/assetIds.ts`:
```typescript
export enum AssetId {
  // Existing...
  MyNewModel = "MyNewModel",
  MyNewSound = "MyNewSound",
}
```

### Step 3: Register in Asset Registry

In `src/assets/assetRegistry.ts`:
```typescript
export const assetRegistry: Record<AssetId, AssetEntry> = {
  // Existing...
  [AssetId.MyNewModel]: { kind: "model", path: "assets/models/my-model.glb" },
  [AssetId.MyNewSound]: {
    kind: "audio",
    mp3Path: "assets/sounds/my-sound.mp3",
    // oggPath: "assets/sounds/my-sound.ogg", // optional
  },
};
```

### Step 4: Use in Code

```typescript
import { AssetId } from "../assets/assetIds";
import { loadModelContainer } from "../assets/loaders";

const container = await loadModelContainer(scene, AssetId.MyNewModel);
container.addAllToScene();
```

---

## Loading Models (GLB/GLTF)

### Basic Loading

```typescript
import { loadModelContainer } from "../assets/loaders";

const container = await loadModelContainer(scene, AssetId.MyModel);
container.addAllToScene();
```

### Reliable Scaling/Positioning

Use `createRootMesh()` to get a single root for the entire container:

```typescript
const container = await loadModelContainer(scene, AssetId.MyModel);
container.addAllToScene();

// Create a single root mesh that parents everything
const root = container.createRootMesh();
root.name = "myModelRoot";

// Now you can scale/position the whole model
root.scaling = new Vector3(2, 2, 2);
root.position = new Vector3(5, 0, 0);
```

### Why `createRootMesh()`?

GLB files can have complex internal hierarchies. `container.rootNodes` might contain multiple roots or empty nodes. `createRootMesh()` guarantees a single TransformNode that parents everything.

---

## Kenney Assets

### Vendored Bundle

The full Kenney asset bundle is vendored in `/kenney/` (gitignored in forks). This gives teams a library to browse.

**LLM note:** The Kenney bundle contains tens of thousands of binary files. JamKit includes:
- `documentation/KENNEY_CATALOG.md` to list what packs exist
- `npm run kenney:search -- <query>` to search filenames on disk (does not rely on editor indexing)

### Runtime Subset

Only curated assets are copied to `public/assets/...` for actual use (e.g. `public/assets/models/kenney/...`). This keeps the runtime bundle small.

### Workflow

1. Browse `/kenney/` to find assets you want
2. Copy them to `public/assets/models/kenney/` or `public/assets/sounds/kenney/`
3. Add to `AssetId` and `assetRegistry`
4. Use in code

---

## Asset URL Resolution

The `resolvePublicAssetUrl()` function handles Vite's base URL:

```typescript
// In assetRegistry.ts
export function resolvePublicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}
```

This works for:
- Dev server: `http://localhost:5173/assets/...`
- Production with base path: `.../<base>/assets/...` (including relative `./` base builds)

---

## Audio Files

### Prefer MP3 for iOS

iOS Safari has issues with some audio formats. Always use `.mp3` for sound effects.

### Loading Sounds

JamKit uses **WebAudio** via `AudioManager` (not `new Audio()`), to avoid mobile quirks and to support a single master volume.

To play a sound (call this from a user gesture like click/tap on mobile):

```typescript
void audio.unlock().then(() => audio.playSfx(AssetId.MyNewSound));
```

### Mobile Audio Unlock

Mobile browsers require user interaction before playing audio. The `AudioManager` handles this:

```typescript
// Waits for first user tap
void audio.unlock().then(() => audio.playSfx(AssetId.MySound));
```

---

## Common Issues

### Model Not Visible

1. Check browser console for load errors
2. Verify file exists in `public/assets/`
3. Check the path in `assetRegistry.ts` matches exactly
4. Ensure model scale isn't too small (GLB might be in millimeters)

### Wrong Position/Scale

Use `createRootMesh()` and apply transforms to that root, not individual meshes.

### 404 Errors

- Check `resolvePublicAssetUrl()` output in console
- Verify the file is in `public/assets/`, not `src/assets/`
- Remember: `public/` contents are served at root, so `public/assets/foo.glb` → `/assets/foo.glb`

