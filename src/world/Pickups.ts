import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
// Register particle system scene component for modular builds.
import "@babylonjs/core/Particles/particleSystemComponent";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { resolvePublicAssetUrl } from "../assets/assetRegistry";
import type { AudioManager } from "../audio/AudioManager";
import { AssetId } from "../assets/assetIds";
import { loadModelContainer } from "../assets/loaders";
import { Tuning } from "../config/tuning";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

export type Pickup = {
  /** Invisible body used for position/physics. */
  body: Mesh;
  /** Visual root parented under the body (safe to scale/pulse). */
  visualRoot: TransformNode;
  collected: boolean;
  grounded: boolean;
  vy: number;
  aggregate: PhysicsAggregate | null;
  pulseSeed: number;
  dispose: () => void;
};

export class Pickups {
  private readonly pickups: Pickup[] = [];
  private particleTexture: Texture | null = null;
  private crystalTemplate: AssetContainer | null = null;
  private crystalTemplatePromise: Promise<AssetContainer> | null = null;
  private readonly usePhysics: boolean;

  constructor(
    private readonly scene: Scene,
    opts?: {
      /** If true, crystals spawn as physics bodies (requires scene physics enabled). */
      usePhysics?: boolean;
    }
  ) {
    this.usePhysics = opts?.usePhysics ?? false;
  }

  getActivePositions(): Vector3[] {
    return this.pickups.filter((p) => !p.collected).map((p) => p.body.position.clone());
  }

  private async getCrystalTemplate(): Promise<AssetContainer> {
    if (this.crystalTemplate) return this.crystalTemplate;
    if (!this.crystalTemplatePromise) {
      this.crystalTemplatePromise = loadModelContainer(this.scene, AssetId.KenneyCrystalPickup);
    }
    this.crystalTemplate = await this.crystalTemplatePromise;
    return this.crystalTemplate;
  }

  async spawnCrystal(pos: Vector3, opts?: { startY?: number }): Promise<void> {
    // Load once, then instantiate to avoid re-parsing the same GLB N times.
    const template = await this.getCrystalTemplate();
    const inst: InstantiatedEntries = template.instantiateModelsToScene();

    // We treat startY as "height above ground plane y=0" (not center position).
    const startY = opts?.startY ?? 0.0;
    const crystalBodyRadius = 0.85 * 0.5;
    const grounded = startY <= 0.001;

    // Physics body (invisible) that owns the transform.
    const body = MeshBuilder.CreateSphere("pickupBody", { diameter: 0.85, segments: 12 }, this.scene);
    body.isVisible = false;
    body.isPickable = false;
    body.position = pos.clone();
    // Position the *center* so the bottom of the body starts at startY.
    body.position.y = startY + crystalBodyRadius;

    // Visual root (safe to scale/pulse) parented under the body.
    const visualRoot = new TransformNode("pickupVisualRoot", this.scene);
    visualRoot.parent = body;
    for (const n of inst.rootNodes) {
      n.parent = visualRoot;
    }

    // Mesh list for glow/shadows.
    const meshes = visualRoot.getChildMeshes(false);

    // Add crystals as shadow casters
    const sg = (this.scene as any)._jamkitShadowGenerator as ShadowGenerator | undefined;
    for (const mesh of meshes) {
      sg?.addShadowCaster(mesh);
    }

    // Add to glow layer (if present) and make materials emissive so glow can pick it up.
    const glow = (this.scene as any)._jamkitGlowLayer as GlowLayer | undefined;
    if (glow) {
      for (const mesh of meshes) {
        if (mesh instanceof Mesh) {
          glow.addIncludedOnlyMesh(mesh);
        }
        const mat: any = mesh.material;
        if (mat && "emissiveColor" in mat) {
          mat.emissiveColor = new Color3(0.75, 0.2, 1.0);
        }
        if (mat && "emissiveIntensity" in mat) {
          mat.emissiveIntensity = 1.0;
        }
      }
    }

    const dispose = () => {
      // Dispose instantiated entries (but never dispose the template container).
      for (const a of inst.animationGroups) a.dispose();
      for (const s of inst.skeletons) s.dispose();
      for (const n of inst.rootNodes) n.dispose();
      try {
        aggregate?.dispose();
      } catch {
        // ignore
      }
      visualRoot.dispose();
      body.dispose();
    };

    let aggregate: PhysicsAggregate | null = null;
    if (this.usePhysics) {
      // Requires scene.enablePhysics(...) to have been called.
      // eslint-disable-next-line no-new
      aggregate = new PhysicsAggregate(
        body,
        PhysicsShapeType.SPHERE,
        { mass: 1, restitution: 0.05, friction: 0.7 },
        this.scene
      );
    }

    this.pickups.push({
      body,
      visualRoot,
      collected: false,
      grounded,
      vy: 0,
      aggregate,
      pulseSeed: Math.random() * 1000,
      dispose,
    });
  }

  updateAndCollectNear(
    playerPos: Vector3,
    radius: number,
    deps: { audio: AudioManager; onCollect: () => void }
  ) {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    const t = performance.now() * 0.001;
    const r2 = radius * radius;
    const crystalBodyRadius = 0.85 * 0.5;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      if (p.collected) {
        this.pickups.splice(i, 1);
        continue;
      }

      if (p.aggregate) {
        // With real physics enabled, consider the pickup “landed” once it reaches the ground plane.
        // (Good enough for jam gameplay; avoids requiring velocity/sleep state APIs.)
        const bottomY = p.body.position.y - crystalBodyRadius;
        if (!p.grounded && bottomY <= 0.02) {
          p.grounded = true;
        }
      } else {
        // Non-physics fallback: simple gravity sim until y=0.
        if (!p.grounded) {
          p.vy -= Tuning.crystalGravity * dt;
          p.body.position.y += p.vy * dt;
          const bottomY = p.body.position.y - crystalBodyRadius;
          if (bottomY <= 0) {
            p.body.position.y = crystalBodyRadius;
            p.vy = 0;
            p.grounded = true;
          }
        }
      }

      // Gentle pulse (scale) so crystals feel alive.
      const pulse = 1 + 0.06 * Math.sin(t * 1.6 + p.pulseSeed);
      p.visualRoot.scaling.set(pulse, pulse, pulse);

      // Only collect after the crystal has landed.
      if (!p.grounded) continue;

      const dx = p.body.position.x - playerPos.x;
      const dz = p.body.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) {
        p.collected = true;
        const burstPos = p.body.getAbsolutePosition().clone();
        p.dispose();
        this.pickups.splice(i, 1);
        deps.onCollect();
        this.spawnPickupBurst(burstPos);
        void deps.audio.unlock().then(() => deps.audio.playSfx(AssetId.KenneySfxPickup));
      }
    }
  }

  private getOrCreateParticleTexture(): Texture {
    if (this.particleTexture) return this.particleTexture;
    const url = resolvePublicAssetUrl("assets/ui/kenney/mobile-controls/button_circle.png");
    this.particleTexture = new Texture(url, this.scene, true, false);
    return this.particleTexture;
  }

  private spawnPickupBurst(pos: Vector3) {
    const ps = new ParticleSystem("jk_pickupBurst", 120, this.scene);
    ps.particleTexture = this.getOrCreateParticleTexture();
    ps.emitter = pos.clone();

    ps.minSize = 0.08;
    ps.maxSize = 0.18;
    ps.minLifeTime = 0.15;
    ps.maxLifeTime = 0.45;

    ps.color1 = new Color4(0.85, 0.25, 1.0, 1.0);
    ps.color2 = new Color4(0.45, 0.9, 1.0, 1.0);
    ps.colorDead = new Color4(0.2, 0.0, 0.3, 0.0);

    ps.minEmitPower = 1.2;
    ps.maxEmitPower = 3.2;
    ps.gravity = new Vector3(0, -3, 0);
    ps.direction1 = new Vector3(-1, 1, -1);
    ps.direction2 = new Vector3(1, 1, 1);

    // Burst once
    ps.emitRate = 0;
    ps.manualEmitCount = 90;

    ps.start();

    // Stop soon and dispose to avoid leaks.
    window.setTimeout(() => {
      ps.stop();
      // IMPORTANT: don't dispose the shared particleTexture (disposeTexture=true by default).
      // Otherwise only the first burst would render and subsequent ones would have a disposed texture.
      ps.dispose(false);
    }, 450);
  }

  dispose() {
    for (const p of this.pickups) {
      try {
        p.dispose();
      } catch {
        // ignore
      }
    }
    this.pickups.length = 0;
    this.particleTexture?.dispose();
    this.particleTexture = null;
    // Template container is owned by the scene; no need to dispose here.
    this.crystalTemplate = null;
    this.crystalTemplatePromise = null;
  }
}



