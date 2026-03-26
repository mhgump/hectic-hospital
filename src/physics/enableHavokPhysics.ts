// ───────────────────────────────────────────────────────────────────────────────
// Havok physics (WASM) integration
// ───────────────────────────────────────────────────────────────────────────────
// JamKit keeps this in one place so teams can delete it if they don't want physics.

// Register Physics v2 engine component for modular builds.
import "@babylonjs/core/Physics/v2/physicsEngineComponent";

import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import HavokPhysics from "@babylonjs/havok";
import { resolvePublicAssetUrl } from "../assets/assetRegistry";

let havokInstancePromise: Promise<any> | null = null;

async function getHavokInstance(): Promise<any> {
  if (!havokInstancePromise) {
    // Vite dev server can otherwise serve index.html for the wasm request (404 → HTML),
    // which causes: "expected magic word 00 61 73 6d, found 3c 21 64 6f".
    havokInstancePromise = HavokPhysics({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          // Serve from public/ so the URL is stable in dev + prod builds.
          // File is committed at: public/assets/physics/HavokPhysics.wasm
          return resolvePublicAssetUrl("assets/physics/HavokPhysics.wasm");
        }
        return file;
      },
    } as any);
  }
  return await havokInstancePromise;
}

export async function enableHavokPhysics(
  scene: Scene,
  opts?: { gravity?: Vector3 }
): Promise<void> {
  const anyScene = scene as any;
  if (anyScene._jamkitHavokEnabled) return;

  const gravity = opts?.gravity ?? new Vector3(0, -9.81, 0);
  const hk = await getHavokInstance();
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(gravity, plugin);

  anyScene._jamkitHavokEnabled = true;
}


