import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { AssetId } from "../assets/assetIds";
import { loadModelContainer } from "../assets/loaders";
import { Tuning } from "../config/tuning";
import type { OrthoCameraRig } from "../engine/createOrthoCameraRig";
import { createSceneBase } from "../engine/createSceneBase";
import { createOrthoArcRotateCameraRig } from "../engine/createOrthoCameraRig";
import { enableHavokPhysics } from "../physics/enableHavokPhysics";
import type { GameState, StateContext } from "../game/StateManager";
import { mountHud } from "../ui/hud";
import { PlayerController } from "../player/PlayerController";
import { CharacterAnimator } from "../player/CharacterAnimator";
import { Pickups } from "../world/Pickups";
import { createRootForContainer, normalizeRootToParent, normalizeRootToWorld } from "../world/modelNormalize";
import { sampleRandomPositions } from "../world/randomPositions";
import { clearUiRoot } from "../ui/uiRoot";
import { WanderAi } from "../npc/WanderAi";
import { CrystalMachine } from "../sample/CrystalMachine";
import { Runtime } from "../config/runtimeConfig";
import { createMulberry32 } from "../utils/rng";

const PLAYER_IDLE_GROUP = "idle";
const PLAYER_RUN_GROUP = "run";

function getAnimationGroup(container: AssetContainer, name: string): AnimationGroup {
  const group = container.animationGroups.find((entry) => entry.name === name);
  if (!group) {
    throw new Error(`Missing animation group: ${name}`);
  }
  return group;
}


export class PlayState implements GameState {
  readonly key = "play";
  private scene: Scene | null = null;
  private hud: ReturnType<typeof mountHud> | null = null;
  private player: PlayerController | null = null;
  private pickups: Pickups | null = null;
  private animator: CharacterAnimator | null = null;
  private dogController: PlayerController | null = null;
  private dogAi: WanderAi | null = null;
  private machine: CrystalMachine | null = null;
  private cameraRig: OrthoCameraRig | null = null;

  constructor(private readonly engine: Engine) {}

  async enter(ctx: StateContext) {
    // Ensure we don't keep any previous screen mounted (menu/boot text).
    clearUiRoot();

    if (Runtime.e2e) {
      document.documentElement.dataset.jkReady = "0";
    }

    const scene = createSceneBase(this.engine);
    this.scene = scene;

    // ───────────────────────────────────────────────────────────────────────────
    // Fixed orthographic camera (Clash Royale style: ~60° from vertical / 30° from side)
    // ───────────────────────────────────────────────────────────────────────────
    // beta = angle from vertical axis: π/3 ≈ 60°
    // alpha = rotation around Y: π/2 means camera is on +X side looking toward -X
    this.cameraRig?.teardown();
    this.cameraRig = createOrthoArcRotateCameraRig({
      engine: this.engine,
      scene,
      target: new Vector3(0, 0, 0),
      alpha: Tuning.cameraAlpha,
      beta: Tuning.cameraBeta,
      radius: Tuning.cameraRadius,
      orthoHalfSize: Tuning.cameraOrthoHalfSize,
      betaLimits: { min: 0.35, max: 1.35 },
    });
    const camera = this.cameraRig.camera;
    const visibleDims = this.getVisibleArenaDimensions(scene, camera);
    const groundDims = this.getGroundDimensions(visibleDims);
    const arenaHalfWidth = visibleDims.width * 0.5;
    const arenaHalfHeight = visibleDims.height * 0.5;

    // Enable physics AFTER we have a valid scene+camera so the render loop won't throw
    // "No camera defined" while Havok is initializing.
    if (Tuning.physicsEnabled) {
      await enableHavokPhysics(scene, { gravity: new Vector3(0, -Tuning.physicsGravityY, 0) });
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Lighting with shadows
    // ───────────────────────────────────────────────────────────────────────────
    // Sky color for nicer background
    scene.clearColor = new Color4(0.529, 0.808, 0.922, 1); // Light sky blue

    // Ambient fill light (no shadows)
    const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.4;
    hemiLight.groundColor = new Color3(0.3, 0.25, 0.2); // Warm ground bounce

    // Main directional light (casts shadows)
    // Direction: coming from upper-right-front, matching camera perspective
    const sunLight = new DirectionalLight(
      "sunLight",
      new Vector3(-0.5, -1, -0.3).normalize(),
      scene
    );
    sunLight.intensity = 0.9;
    sunLight.position = new Vector3(10, 20, 10); // For shadow calculations

    // Shadow generator
    const shadowGenerator = new ShadowGenerator(1024, sunLight);
    shadowGenerator.useBlurExponentialShadowMap = true; // Soft shadows
    shadowGenerator.blurKernel = 32;
    shadowGenerator.darkness = 0.3; // 0 = black shadows, 1 = no shadows

    // Store shadow generator for use when loading models
    (scene as any)._jamkitShadowGenerator = shadowGenerator;

    // Glow layer (used for crystals). Only meshes explicitly included will glow.
    const glowLayer = new GlowLayer("jk_glow", scene);
    // Keep this subtle: too much glow washes out the scene.
    glowLayer.intensity = 0.25;
    // Smaller kernel = tighter, less “foggy” glow.
    // (Property exists on GlowLayer; if Babylon changes it, we can drop this line.)
    (glowLayer as any).blurKernelSize = 16;
    (scene as any)._jamkitGlowLayer = glowLayer;

    // Invisible pick plane at y=0 for deterministic tap-to-move.
    const pickPlane = MeshBuilder.CreateGround(
      "pickPlane",
      { width: visibleDims.width, height: visibleDims.height },
      scene
    );
    pickPlane.isVisible = false;
    pickPlane.isPickable = true;

    // Physics ground collider (thin box), so physics bodies land reliably at y=0.
    // Keep separate from pickPlane so picking stays simple.
    if (Tuning.physicsEnabled) {
      const groundCollider = MeshBuilder.CreateBox(
        "physicsGround",
        { width: visibleDims.width, height: 0.2, depth: visibleDims.height },
        scene
      );
      groundCollider.isVisible = false;
      groundCollider.isPickable = false;
      groundCollider.position.y = -0.1; // top surface at y=0
      // eslint-disable-next-line no-new
      new PhysicsAggregate(groundCollider, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, scene);
    }

    const moveMarker = MeshBuilder.CreateDisc(
      "moveMarker",
      { radius: 0.4, tessellation: 24 },
      scene
    );
    moveMarker.rotation.x = Math.PI / 2;
    moveMarker.position = new Vector3(0, 0.01, 0);
    const markerMat = new StandardMaterial("markerMat", scene);
    markerMat.emissiveColor = new Color3(0.2, 0.9, 1.0);
    markerMat.alpha = 0.75;
    moveMarker.material = markerMat;

    this.hud = mountHud();

    // Reset run model for this play session.
    ctx.model.resetRun();

    // Player root
    const playerRoot = new TransformNode("playerRoot", scene);
    playerRoot.position = new Vector3(0, 0, 0);
    this.player = new PlayerController({
      root: playerRoot,
      moveSpeed: Tuning.playerMoveSpeed,
      arrivalThreshold: Tuning.playerArrivalThreshold,
    });
    // Camera target stays at arena center (0,0,0); player is not followed.

    // Simple world colliders (filled once we spawn props)
    const obstacles: { center: Vector3; radius: number }[] = [];
    this.player.setColliders({ obstacles, playerRadius: Tuning.playerColliderRadius });

    this.pickups = new Pickups(scene, { usePhysics: Tuning.physicsEnabled });

    // ───────────────────────────────────────────────────────────────────────────
    // Crystal machine (UI + interactable demo)
    // ───────────────────────────────────────────────────────────────────────────
    // Put it clearly visible and not behind the tree cluster.
    const machineCenter = new Vector3(-arenaHalfWidth * 0.45, 0, arenaHalfHeight * 0.35);
    const sgNow = (scene as any)._jamkitShadowGenerator as ShadowGenerator | undefined;
    this.machine?.dispose();
    this.machine = new CrystalMachine({
      scene,
      audio: ctx.audio,
      pickups: this.pickups,
      shadowGenerator: sgNow,
      obstacles,
      center: machineCenter,
      tuning: {
        interactRadius: Tuning.machineInteractRadius,
        colliderRadius: Tuning.machineColliderRadius,
        crystalDropCount: Tuning.machineCrystalDropCount,
        crystalDropStartY: Tuning.crystalDropStartY,
        crystalSpawnMargin: Tuning.crystalSpawnMargin,
        arenaFloorSizeXZ: Tuning.arenaFloorSizeXZ,
        arenaHalfWidth,
        arenaHalfHeight,
        cameraOrthoHalfSize: Tuning.cameraOrthoHalfSize,
        crystalMinDistanceBetween: Tuning.crystalMinDistanceBetween,
        crystalMinDistanceFromPlayer: Tuning.crystalMinDistanceFromPlayer,
        crystalObstacleClearance: Tuning.crystalObstacleClearance,
      },
    });

    // Touch/pointer controls + player update loop.
    scene.onBeforeRenderObservable.add(() => {
      // Keyboard fallback movement (camera-relative).
      const axis = ctx.input.getMoveAxis();
      if (this.player) {
        if (axis.x !== 0 || axis.y !== 0) {
          // Camera-relative on the ground plane.
          const forward = camera
            .getTarget()
            .subtract(camera.position)
            .normalize();
          forward.y = 0;
          if (forward.lengthSquared() > 1e-6) forward.normalize();
          const right = Vector3.Cross(Vector3.Up(), forward);
          if (right.lengthSquared() > 1e-6) right.normalize();
          const dir = right.scale(axis.x).add(forward.scale(axis.y));
          this.player.setMoveDirection(dir);
        } else {
          this.player.setMoveDirection(null);
        }
      }

      // Drag-to-look: rotate the camera (separate from tap-to-move).
      const look = ctx.input.consumeLookDragDelta();
      if (look.dx !== 0 || look.dy !== 0) {
        camera.alpha -= look.dx * Tuning.cameraDragSensitivity;
        camera.beta -= look.dy * Tuning.cameraDragSensitivity;
      }

      const taps = ctx.input.consumeTaps();
      if (taps.length > 0) {
        const tap = taps.at(-1);
        if (!tap) return;
        const pointerPos = this.getPointerScenePosition(tap.clientX, tap.clientY);
        if (!pointerPos) return;
        const { x, y } = pointerPos;
        const pick = scene.pick(x, y, (m) => m === pickPlane);
        if (pick?.hit && pick.pickedPoint) {
          this.player?.setMoveTarget(pick.pickedPoint);
          moveMarker.position.x = pick.pickedPoint.x;
          moveMarker.position.z = pick.pickedPoint.z;
        }
      }

      this.player?.update(scene);
      // Camera is fixed at arena center; no follow.

      // Keep glow intensity stable (we pulse the crystal scale/material instead in Pickups).

      // Update character animation demo based on actual movement.
      if (this.player) {
        this.animator?.setMoving(this.player.isMoving());
      }

      // Dog AI
      if (this.dogController) {
        this.dogController.update(scene);
      }
      this.dogAi?.update(scene);

      this.pickups?.updateAndCollectNear(playerRoot.position, Tuning.pickupCollectionRadius, {
        audio: ctx.audio,
        onCollect: () => {
          ctx.model.score += 1;
        },
      });

      this.machine?.update(playerRoot.position);

      this.hud?.setScore(ctx.model.score);
    });

    // Load minimal Kenney models now: arena floor + character (+ optional walls).
    const rng = Runtime.e2e ? createMulberry32(Runtime.seed ?? 1) : null;

    void (async () => {
      try {
        // Get shadow generator we stored earlier
        const sg = (scene as any)._jamkitShadowGenerator as ShadowGenerator | undefined;

        // Floor (receives shadows)
        const floorContainer = await loadModelContainer(scene, AssetId.KenneyMiniArenaFloor);
        const floorRoot = createRootForContainer(floorContainer, "arenaFloor");
        const floorWidth = groundDims.width;
        const floorHeight = groundDims.height;
        const baseSize = Math.min(floorWidth, floorHeight);
        normalizeRootToWorld({
          root: floorRoot,
          meshes: floorContainer.meshes,
          desiredMaxSizeXZ: baseSize,
          desiredMinY: 0,
          centerXZ: true,
        });
        if (baseSize > 0) {
          const scaleX = floorWidth / baseSize;
          const scaleZ = floorHeight / baseSize;
          if (Number.isFinite(scaleX) && scaleX > 0) {
            floorRoot.scaling.x *= scaleX;
          }
          if (Number.isFinite(scaleZ) && scaleZ > 0) {
            floorRoot.scaling.z *= scaleZ;
          }
        }
        // Floor receives shadows
        for (const mesh of floorContainer.meshes) {
          mesh.receiveShadows = true;
        }

        // Environment props: a few trees + a couple of simple boulders.
        // (We keep it lightweight: no physics engine; just simple circle colliders.)
        const treePositions = [
          new Vector3(-arenaHalfWidth * 0.35, 0, -arenaHalfHeight * 0.25),
          new Vector3(arenaHalfWidth * 0.32, 0, 0),
          new Vector3(arenaHalfWidth * 0.2, 0, arenaHalfHeight * 0.4),
        ];
        for (const p of treePositions) {
          const treeContainer = await loadModelContainer(scene, AssetId.KenneyMiniArenaTree);
          const treeRoot = createRootForContainer(treeContainer, "arenaTree");
          normalizeRootToWorld({
            root: treeRoot,
            meshes: treeContainer.meshes,
            desiredMaxSizeXZ: 4,
            desiredMinY: 0,
            centerXZ: true,
          });
          treeRoot.position.copyFrom(p);
          for (const mesh of treeContainer.meshes) {
            mesh.receiveShadows = true;
            sg?.addShadowCaster(mesh);
          }
          obstacles.push({ center: p.clone(), radius: 1.1 });
        }

        const rockMat = new StandardMaterial("rockMat", scene);
        rockMat.diffuseColor = new Color3(0.35, 0.35, 0.38);
        rockMat.specularColor = new Color3(0.05, 0.05, 0.05);

        const addBoulder = (pos: Vector3, radius: number) => {
          const rock = MeshBuilder.CreateSphere(
            "boulder",
            { diameter: radius * 2, segments: 16 },
            scene
          );
          rock.material = rockMat;
          rock.position.copyFrom(pos);
          rock.position.y = radius; // sit on ground
          rock.receiveShadows = true;
          sg?.addShadowCaster(rock);
          obstacles.push({ center: new Vector3(pos.x, 0, pos.z), radius });
          return rock;
        };

        addBoulder(new Vector3(arenaHalfWidth * 0.25, 0, -arenaHalfHeight * 0.35), 1.2);
        addBoulder(new Vector3(-arenaHalfWidth * 0.2, 0, arenaHalfHeight * 0.15), 0.9);

        // Spawn crystals after environment props so we can avoid colliders.
        if (this.pickups) {
          const spawnHalfX = arenaHalfWidth - Tuning.crystalSpawnMargin;
          const spawnHalfZ = arenaHalfHeight - Tuning.crystalSpawnMargin;
          const positions = sampleRandomPositions({
            count: Tuning.crystalCount,
            halfSize: Math.max(2, Math.min(spawnHalfX, spawnHalfZ)),
            halfSizeX: Math.max(2, spawnHalfX),
            halfSizeZ: Math.max(2, spawnHalfZ),
            minDistBetween: Tuning.crystalMinDistanceBetween,
            minDistFromOrigin: Tuning.crystalMinDistanceFromPlayer,
            obstacles,
            obstacleClearance: Tuning.crystalObstacleClearance,
            existing: this.pickups.getActivePositions(),
            rng: rng ?? undefined,
          });

          for (const p of positions) {
            // Await sequentially to avoid 15 parallel GLB loads on slower machines.
            // (For jam projects, we can optimize this later with instantiateModelsToScene.)
            // eslint-disable-next-line no-await-in-loop
            await this.pickups.spawnCrystal(p, { startY: Tuning.crystalDropStartY });
          }
        }

        // Character (casts shadows)
        const charContainer = await loadModelContainer(scene, AssetId.KenneyCharacterA);
        const charRoot = createRootForContainer(charContainer, "playerCharacter");
        charRoot.parent = playerRoot;
        charRoot.position.copyFrom(Vector3.Zero());
        normalizeRootToParent({
          root: charRoot,
          meshes: charContainer.meshes,
          desiredHeightY: 4.25,
          desiredMinY: 0,
        });
        for (const mesh of charContainer.meshes) {
          const material = mesh.material;
          if (material instanceof PBRMaterial) {
            material.alpha = 1;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
            material.forceDepthWrite = true;
          } else if (material) {
            material.alpha = 1;
          }
        }
        // Character casts shadows
        for (const mesh of charContainer.meshes) {
          sg?.addShadowCaster(mesh);
        }

        const idle = getAnimationGroup(charContainer, PLAYER_IDLE_GROUP);
        const walk = getAnimationGroup(charContainer, PLAYER_RUN_GROUP);

        // Character animation (idle/walk).
        this.animator?.dispose();
        this.animator = new CharacterAnimator({ idle, walk });

        // Dog NPC: calm wanderer
        const dogRoot = new TransformNode("dogRoot", scene);
        // Spawn near the player so it's obvious (and still inside arena bounds).
        dogRoot.position = new Vector3(0, 0, -arenaHalfHeight * 0.25);
        const dogController = new PlayerController({
          root: dogRoot,
          moveSpeed: Tuning.playerMoveSpeed * 0.65,
          arrivalThreshold: Tuning.playerArrivalThreshold,
        });
        dogController.setColliders({ obstacles, playerRadius: Tuning.playerColliderRadius * 0.9 });
        this.dogController = dogController;
        const wanderHalfSize = Math.min(
          arenaHalfWidth * 0.8,
          arenaHalfHeight * 0.8
        );
        this.dogAi = new WanderAi({
          controller: dogController,
          root: dogRoot,
          halfSize: wanderHalfSize,
          idleMinSec: 0.8,
          idleMaxSec: 2.2,
          arriveDist: 0.5,
        });

        const dogContainer = await loadModelContainer(scene, AssetId.KenneyAnimalDog);
        const dogVisual = createRootForContainer(dogContainer, "dogVisual");
        dogVisual.parent = dogRoot;
        dogVisual.position.copyFrom(Vector3.Zero());
        // Kenney dog model faces +X by default; our controllers assume +Z forward.
        // Apply a fixed local yaw offset so the dog faces the direction it walks.
        dogVisual.rotation.y = -Math.PI / 2;
        normalizeRootToParent({
          root: dogVisual,
          meshes: dogContainer.meshes,
          desiredHeightY: 1.1,
          desiredMinY: 0,
        });
        for (const mesh of dogContainer.meshes) {
          sg?.addShadowCaster(mesh);
        }

        if (Runtime.e2e) {
          document.documentElement.dataset.jkReady = "1";
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Kenney model load failed", err);
        if (Runtime.e2e) {
          document.documentElement.dataset.jkReady = "error";
        }
        throw err;
      }
    })();
  }

  exit() {
    // Scene disposal handled by StateManager.
    this.cameraRig?.teardown();
    this.cameraRig = null;
    this.hud?.teardown();
    this.hud = null;
    this.player = null;
    this.machine?.dispose();
    this.machine = null;
    this.pickups?.dispose();
    this.pickups = null;
    this.animator?.dispose();
    this.animator = null;
    this.dogController = null;
    this.dogAi = null;
    this.scene = null;
  }

  getScene(): Scene | null {
    return this.scene;
  }

  private getPointerScenePosition(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return null;

    // Undo CSS scaling so Babylon's hardware scaling math stays correct.
    const scaleX = rect.width / canvas.clientWidth;
    const scaleY = rect.height / canvas.clientHeight;
    if (scaleX <= 0 || scaleY <= 0) return null;

    const x = (clientX - rect.left) / scaleX;
    const y = (clientY - rect.top) / scaleY;
    return { x, y };
  }

  private getVisibleArenaDimensions(
    scene: Scene,
    camera: Camera
  ): { width: number; height: number } {
    const half = Tuning.cameraOrthoHalfSize;
    const canvas = this.engine.getRenderingCanvas();
    const viewportWidth = canvas?.clientWidth ?? this.engine.getRenderWidth();
    const viewportHeight = canvas?.clientHeight ?? this.engine.getRenderHeight();
    const aspect =
      viewportWidth > 0 && viewportHeight > 0 ? viewportWidth / viewportHeight : 1;

    let minWidth = half * 2;
    let minHeight = half * 2;
    if (Number.isFinite(aspect) && aspect > 0) {
      if (aspect >= 1) {
        minWidth = half * 2 * aspect;
        minHeight = half * 2;
      } else {
        minWidth = half * 2;
        minHeight = (half * 2) / aspect;
      }
    }

    if (viewportWidth > 0 && viewportHeight > 0) {
      const corners = [
        { x: 0, y: 0 },
        { x: viewportWidth, y: 0 },
        { x: 0, y: viewportHeight },
        { x: viewportWidth, y: viewportHeight },
      ];
      const hits: Vector3[] = [];
      for (const corner of corners) {
        const ray = scene.createPickingRay(corner.x, corner.y, Matrix.Identity(), camera);
        const dy = ray.direction.y;
        if (Math.abs(dy) < 1e-6) continue;
        const t = -ray.origin.y / dy;
        if (t <= 0) continue;
        hits.push(ray.origin.add(ray.direction.scale(t)));
      }

      if (hits.length >= 2) {
        const first = hits[0]!;
        let minX = first.x;
        let maxX = first.x;
        let minZ = first.z;
        let maxZ = first.z;
        for (const p of hits) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        }
        const pad = 1.2;
        const width = Math.max(minWidth, maxX - minX + pad * 2);
        const height = Math.max(minHeight, maxZ - minZ + pad * 2);
        return { width, height };
      }
    }

    if (!Number.isFinite(aspect) || aspect <= 0) {
      const size = half * 2;
      return { width: size, height: size };
    }
    return { width: minWidth, height: minHeight };
  }

  private getGroundDimensions(visible: { width: number; height: number }): {
    width: number;
    height: number;
  } {
    const groundScale = Math.max(1, Tuning.arenaGroundScale);
    const canvas = this.engine.getRenderingCanvas();
    const viewportWidth = canvas?.clientWidth ?? this.engine.getRenderWidth();
    const viewportHeight = canvas?.clientHeight ?? this.engine.getRenderHeight();
    const aspect =
      viewportWidth > 0 && viewportHeight > 0 ? viewportWidth / viewportHeight : 1;

    if (!Number.isFinite(aspect) || aspect <= 0) {
      return {
        width: visible.width * groundScale,
        height: visible.height * groundScale,
      };
    }

    // In portrait, extend depth to fill the view without widening the arena.
    if (aspect < 1) {
      return { width: visible.width, height: visible.height * groundScale };
    }

    // In landscape, extend width to keep edges offscreen.
    return { width: visible.width * groundScale, height: visible.height };
  }

  /** E2E/debug helper: get current player position snapshot. */
  getPlayerPosition() {
    return this.player?.getPosition() ?? null;
  }
}
