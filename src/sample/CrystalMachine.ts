import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { AudioManager } from "../audio/AudioManager";
import { AssetId } from "../assets/assetIds";
import type { Pickups } from "../world/Pickups";
import { sampleRandomPositions } from "../world/randomPositions";
import { mountMachinePanel } from "../ui/machinePanel";

export type CrystalMachineTuning = {
  interactRadius: number;
  colliderRadius: number;
  crystalDropCount: number;
  crystalDropStartY: number;
  crystalSpawnMargin: number;
  arenaFloorSizeXZ: number;
  arenaHalfWidth?: number;
  arenaHalfHeight?: number;
  cameraOrthoHalfSize: number;
  crystalMinDistanceBetween: number;
  crystalMinDistanceFromPlayer: number;
  crystalObstacleClearance: number;
};

export class CrystalMachine {
  private readonly center: Vector3;
  private readonly panel: ReturnType<typeof mountMachinePanel>;
  private readonly outsideTapHandler: (ev: PointerEvent) => void;

  private busy = false;
  private uiVisible = false;
  private dismissed = false;

  constructor(
    private readonly opts: {
      scene: Scene;
      audio: AudioManager;
      pickups: Pickups;
      shadowGenerator?: ShadowGenerator;
      obstacles: { center: Vector3; radius: number }[];
      center: Vector3;
      tuning: CrystalMachineTuning;
    }
  ) {
    this.center = opts.center.clone();

    // Simple visible machine mesh (demo interactable).
    const machineMesh = MeshBuilder.CreateBox(
      "crystalMachine",
      { width: 1.6, height: 1.2, depth: 1.6 },
      opts.scene
    );
    machineMesh.position = new Vector3(this.center.x, 0.6, this.center.z);
    const machineMat = new StandardMaterial("crystalMachineMat", opts.scene);
    machineMat.diffuseColor = new Color3(0.12, 0.12, 0.14);
    machineMat.emissiveColor = new Color3(0.03, 0.05, 0.08);
    machineMat.specularColor = new Color3(0.12, 0.12, 0.12);
    machineMesh.material = machineMat;
    machineMesh.receiveShadows = true;
    opts.shadowGenerator?.addShadowCaster(machineMesh);

    // Add collider obstacle so player can't walk through it.
    opts.obstacles.push({ center: this.center.clone(), radius: opts.tuning.colliderRadius });

    this.panel = mountMachinePanel({ onMoreCrystals: () => void this.spawnMoreCrystals() });

    this.outsideTapHandler = (ev: PointerEvent) => {
      if (!this.uiVisible) return;
      if (this.panel.containsTarget(ev.target)) return;
      // Dismiss until the player walks away.
      this.dismissed = true;
      this.uiVisible = false;
      this.panel.setVisible(false);
    };
    document.addEventListener("pointerdown", this.outsideTapHandler, true);
  }

  update(playerPos: Vector3) {
    const d2m = Vector3.DistanceSquared(playerPos, this.center);
    const shouldShow =
      d2m <= this.opts.tuning.interactRadius * this.opts.tuning.interactRadius;

    if (!shouldShow) {
      // Reset dismissal once you step away, so you can re-open next time.
      this.dismissed = false;
    }

    const wantVisible = shouldShow && !this.dismissed;
    if (wantVisible !== this.uiVisible) {
      this.uiVisible = wantVisible;
      this.panel.setVisible(wantVisible);
    }
  }

  dispose() {
    document.removeEventListener("pointerdown", this.outsideTapHandler, true);
    this.panel.teardown();
  }

  private async spawnMoreCrystals() {
    if (this.busy) return;
    this.busy = true;
    this.panel.setBusy(true);
    void this.opts.audio.unlock().then(() => this.opts.audio.playSfx(AssetId.KenneySfxClick));

    try {
      const existing = this.opts.pickups.getActivePositions();
      const halfX = this.opts.tuning.arenaHalfWidth ?? this.opts.tuning.arenaFloorSizeXZ * 0.5;
      const halfZ = this.opts.tuning.arenaHalfHeight ?? this.opts.tuning.arenaFloorSizeXZ * 0.5;
      const spawnHalfX = halfX - this.opts.tuning.crystalSpawnMargin;
      const spawnHalfZ = halfZ - this.opts.tuning.crystalSpawnMargin;

      const positions = sampleRandomPositions({
        count: this.opts.tuning.crystalDropCount,
        halfSize: Math.max(2, Math.min(spawnHalfX, spawnHalfZ)),
        halfSizeX: Math.max(2, spawnHalfX),
        halfSizeZ: Math.max(2, spawnHalfZ),
        minDistBetween: this.opts.tuning.crystalMinDistanceBetween,
        minDistFromOrigin: this.opts.tuning.crystalMinDistanceFromPlayer,
        obstacles: this.opts.obstacles,
        obstacleClearance: this.opts.tuning.crystalObstacleClearance,
        existing,
      });

      for (const p of positions) {
        // eslint-disable-next-line no-await-in-loop
        await this.opts.pickups.spawnCrystal(p, { startY: this.opts.tuning.crystalDropStartY });
      }
    } finally {
      this.busy = false;
      this.panel.setBusy(false);
    }
  }
}

