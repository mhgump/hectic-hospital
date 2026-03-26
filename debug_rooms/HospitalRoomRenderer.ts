import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import HavokPhysics from "@babylonjs/havok";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { HospitalRoom, RoomTexturePlacement, RoomModelDef, RoomObjectPlacement } from "./types";

const ROOM_W = 10;
const ROOM_D = 10;
const ROOM_H = 3;
const WALL_T = 0.15;
const DOOR_W = 1.5;
const DOOR_H = 2.2;
const TILE = 2.5; // world units per texture repeat
const HALLWAY_DEPTH = 4; // corridor floor strip depth beyond south wall

// Fixed camera angle — slightly east of due south, looking mostly north.
// Shows: north wall interior (dominant) and west wall interior at an angle.
const CAM_ALPHA = -Math.PI * 5 / 12; // ~-75° — mostly south, slight east offset
const CAM_BETA  = Math.PI / 4;        // 45° from top — classic isometric top-down angle
const CAM_RADIUS = 20;
const CAM_TARGET = new Vector3(0, 1.2, 0.5);

// Pan direction vectors derived from alpha (forward = toward camera's look direction in XZ)
const PAN_FWD   = new Vector3(-Math.cos(CAM_ALPHA), 0, -Math.sin(CAM_ALPHA)).normalize();
const PAN_RIGHT = new Vector3(-Math.sin(CAM_ALPHA), 0,  Math.cos(CAM_ALPHA)).normalize();
const PAN_STEP  = 0.5;

export class HospitalRoomRenderer {
  private scene: Scene;
  private camera!: ArcRotateCamera;
  private nurseMesh: AbstractMesh | null = null;
  private nurseAggregate: PhysicsAggregate | null = null;
  private floorAggregates: PhysicsAggregate[] = [];
  private nurseVelocityInterval: ReturnType<typeof setInterval> | null = null;
  private physicsReady: Promise<void>;
  private roomMeshes: AbstractMesh[] = [];
  private roomMaterials: Material[] = [];
  private roomTextures: BaseTexture[] = [];
  private lastDataKey = "";
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.scene = this.buildScene(engine, canvas);
    this.setupKeyboardPan();
    this.physicsReady = this.initPhysics();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async loadRoom(room: HospitalRoom, hallwayTexture: string | null, hallwayFloorTexture: string | null): Promise<void> {
    this.clearRoom();
    this.buildFloor(room.floorTexture);
    this.buildHallwayFloor(hallwayFloorTexture);
    // North and west walls share the same base tileable texture
    this.buildNorthWall(room.wallTexture);
    this.buildSouthWall(hallwayTexture);
    this.buildWestWall(room.wallTexture);
    this.buildEastWall(room.wallTexture);
    this.buildExtraTextures(room.extraTextures);
    await this.loadModelsAndPlacements(room);
    await this.loadHallwayNurse();
    this.lastDataKey = this.dataKey(room, hallwayTexture, hallwayFloorTexture);
  }

  async refreshIfChanged(room: HospitalRoom, hallwayTexture: string | null, hallwayFloorTexture: string | null): Promise<void> {
    const key = this.dataKey(room, hallwayTexture, hallwayFloorTexture);
    if (key !== this.lastDataKey) {
      await this.loadRoom(room, hallwayTexture, hallwayFloorTexture);
    }
  }

  getScene(): Scene { return this.scene; }

  dispose(): void {
    if (this.keydownHandler) window.removeEventListener("keydown", this.keydownHandler);
    this.clearRoom();
    this.scene.dispose();
  }

  // ── Keyboard pan (WASD / arrows) ───────────────────────────────────────────

  private setupKeyboardPan(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Don't pan when typing into inputs
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      let fwd = 0, right = 0;
      switch (e.key) {
        case "w": case "W": case "ArrowUp":    fwd   =  1; break;
        case "s": case "S": case "ArrowDown":  fwd   = -1; break;
        case "a": case "A": case "ArrowLeft":  right = -1; break;
        case "d": case "D": case "ArrowRight": right =  1; break;
        default: return;
      }
      e.preventDefault();

      const delta = PAN_FWD.scale(fwd * PAN_STEP).add(PAN_RIGHT.scale(right * PAN_STEP));
      this.camera.target.addInPlace(delta);
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  // ── Physics (Havok) ────────────────────────────────────────────────────────

  private async initPhysics(): Promise<void> {
    const havok = await HavokPhysics();
    const hk = new HavokPlugin(true, havok);
    this.scene.enablePhysics(new Vector3(0, -9.81, 0), hk);
  }

  // ── Scene setup ────────────────────────────────────────────────────────────

  private buildScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.1, 0.13, 1);

    // Fixed angle perspective: SE outside looking NW; WASD pans the target
    this.camera = new ArcRotateCamera("cam", CAM_ALPHA, CAM_BETA, CAM_RADIUS, CAM_TARGET.clone(), scene);
    const camera = this.camera;
    camera.lowerAlphaLimit = CAM_ALPHA;
    camera.upperAlphaLimit = CAM_ALPHA;
    camera.lowerBetaLimit  = CAM_BETA;
    camera.upperBetaLimit  = CAM_BETA;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 35;
    camera.wheelPrecision = 5;
    camera.attachControl(canvas, true); // scroll-to-zoom still works

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;
    hemi.diffuse = new Color3(1, 1, 1);
    hemi.groundColor = new Color3(0.35, 0.35, 0.4);

    // Directional light from the camera side (mostly south, slight east + above)
    // negative X and positive Z → lights north wall interior and west wall interior
    const dir = new DirectionalLight("dir", new Vector3(-0.2, -1, 0.7), scene);
    dir.intensity = 0.9;
    dir.diffuse = new Color3(1, 0.97, 0.93);

    return scene;
  }

  // ── Floor ──────────────────────────────────────────────────────────────────

  private buildFloor(texturePath: string | null): void {
    const mesh = MeshBuilder.CreateBox("floor", { width: ROOM_W, height: 0.04, depth: ROOM_D }, this.scene);
    mesh.position.y = -0.02;
    // Swap u/v order: for Babylon Box top face U maps to depth (Z), V maps to width (X)
    mesh.material = this.makeMat("floor", texturePath, ROOM_D / TILE, ROOM_W / TILE, () => this.phFloor());
    this.roomMeshes.push(mesh);
  }

  /** Corridor floor strip visible outside the south wall door opening. */
  private buildHallwayFloor(texturePath: string | null): void {
    const zStart = -(ROOM_D / 2 + WALL_T);
    const zCenter = zStart - HALLWAY_DEPTH / 2;
    const mesh = MeshBuilder.CreateBox("hallway_floor", { width: ROOM_W, height: 0.04, depth: HALLWAY_DEPTH }, this.scene);
    mesh.position.set(0, -0.02, zCenter);
    // Swap u/v order: for Babylon Box top face U maps to depth (Z), V maps to width (X)
    mesh.material = this.makeMat("hallway_floor", texturePath, HALLWAY_DEPTH / TILE, ROOM_W / TILE, () => this.phHallway());
    this.roomMeshes.push(mesh);
  }

  // ── Walls ──────────────────────────────────────────────────────────────────

  private buildNorthWall(texturePath: string | null): void {
    this.buildXWall("north", ROOM_D / 2 + WALL_T / 2, texturePath, () => this.phNorthWall());
  }

  private buildSouthWall(texturePath: string | null): void {
    this.buildXWall("south", -(ROOM_D / 2 + WALL_T / 2), texturePath, () => this.phHallway());
  }

  private buildWestWall(texturePath: string | null): void {
    this.buildZWall("west", -(ROOM_W / 2 + WALL_T / 2), texturePath, () => this.phWestWall());
  }

  private buildEastWall(texturePath: string | null): void {
    this.buildZWall("east", ROOM_W / 2 + WALL_T / 2, texturePath, () => this.phWestWall());
  }

  /** X-axis wall (north or south) with door cutout centred at X=0. */
  private buildXWall(name: string, zPos: number, texturePath: string | null, ph: () => DynamicTexture): void {
    const half  = ROOM_W / 2;
    const halfD = DOOR_W / 2;
    const sideW = half - halfD;
    const sideCX = halfD + sideW / 2;
    const headerH = ROOM_H - DOOR_H;

    const mk = (n: string, w: number, h: number) =>
      this.makeMat(n, texturePath, w / TILE, h / TILE, ph);

    const left = MeshBuilder.CreateBox(`${name}_l`, { width: sideW, height: ROOM_H, depth: WALL_T }, this.scene);
    left.position.set(-sideCX, ROOM_H / 2, zPos);
    left.material = mk(`${name}_l`, sideW, ROOM_H);
    this.roomMeshes.push(left);

    const right = MeshBuilder.CreateBox(`${name}_r`, { width: sideW, height: ROOM_H, depth: WALL_T }, this.scene);
    right.position.set(sideCX, ROOM_H / 2, zPos);
    right.material = mk(`${name}_r`, sideW, ROOM_H);
    this.roomMeshes.push(right);

    const header = MeshBuilder.CreateBox(`${name}_h`, { width: DOOR_W, height: headerH, depth: WALL_T }, this.scene);
    header.position.set(0, DOOR_H + headerH / 2, zPos);
    header.material = mk(`${name}_h`, DOOR_W, headerH);
    this.roomMeshes.push(header);
  }

  /** Z-axis wall (west or east) with door cutout centred at Z=0. */
  private buildZWall(name: string, xPos: number, texturePath: string | null, ph: () => DynamicTexture): void {
    const half  = ROOM_D / 2;
    const halfD = DOOR_W / 2;
    const sideD = half - halfD;
    const sideCZ = halfD + sideD / 2;
    const headerH = ROOM_H - DOOR_H;

    const mk = (n: string, d: number, h: number) =>
      this.makeMat(n, texturePath, d / TILE, h / TILE, ph);

    const left = MeshBuilder.CreateBox(`${name}_l`, { width: WALL_T, height: ROOM_H, depth: sideD }, this.scene);
    left.position.set(xPos, ROOM_H / 2, -sideCZ);
    left.material = mk(`${name}_l`, sideD, ROOM_H);
    this.roomMeshes.push(left);

    const right = MeshBuilder.CreateBox(`${name}_r`, { width: WALL_T, height: ROOM_H, depth: sideD }, this.scene);
    right.position.set(xPos, ROOM_H / 2, sideCZ);
    right.material = mk(`${name}_r`, sideD, ROOM_H);
    this.roomMeshes.push(right);

    const header = MeshBuilder.CreateBox(`${name}_h`, { width: WALL_T, height: headerH, depth: DOOR_W }, this.scene);
    header.position.set(xPos, DOOR_H + headerH / 2, 0);
    header.material = mk(`${name}_h`, DOOR_W, headerH);
    this.roomMeshes.push(header);
  }

  // ── Extra texture placements ───────────────────────────────────────────────

  private buildExtraTextures(placements: RoomTexturePlacement[]): void {
    for (const p of placements) {
      if (!p.texture) continue;
      const [uo, vo] = p.uvOffset;
      // Use uniform scale: uvScale[0] as fraction of the shorter surface dimension → square placement
      const us = p.uvScale[0];
      let mesh: AbstractMesh;

      switch (p.surface) {
        case "floor": {
          const sz = us * Math.min(ROOM_W, ROOM_D);
          mesh = MeshBuilder.CreatePlane(`ex_${p.id}`, { width: sz, height: sz }, this.scene);
          // uvOffset = center position (0-1 on each axis)
          mesh.position.set(-ROOM_W / 2 + uo * ROOM_W, 0.02, -ROOM_D / 2 + vo * ROOM_D);
          mesh.rotation.x = Math.PI / 2;
          break;
        }
        case "north_wall": {
          const sz = us * Math.min(ROOM_W, ROOM_H);
          mesh = MeshBuilder.CreatePlane(`ex_${p.id}`, { width: sz, height: sz }, this.scene);
          mesh.position.set(-ROOM_W / 2 + uo * ROOM_W, vo * ROOM_H, ROOM_D / 2 - 0.02);
          mesh.rotation.y = Math.PI;
          break;
        }
        case "south_wall": {
          const sz = us * Math.min(ROOM_W, ROOM_H);
          mesh = MeshBuilder.CreatePlane(`ex_${p.id}`, { width: sz, height: sz }, this.scene);
          mesh.position.set(-ROOM_W / 2 + uo * ROOM_W, vo * ROOM_H, -(ROOM_D / 2 - 0.02));
          break;
        }
        case "east_wall": {
          const sz = us * Math.min(ROOM_D, ROOM_H);
          mesh = MeshBuilder.CreatePlane(`ex_${p.id}`, { width: sz, height: sz }, this.scene);
          mesh.position.set(ROOM_W / 2 - 0.02, vo * ROOM_H, -ROOM_D / 2 + uo * ROOM_D);
          mesh.rotation.y = -Math.PI / 2;
          break;
        }
        case "west_wall": {
          const sz = us * Math.min(ROOM_D, ROOM_H);
          mesh = MeshBuilder.CreatePlane(`ex_${p.id}`, { width: sz, height: sz }, this.scene);
          mesh.position.set(-(ROOM_W / 2 - 0.02), vo * ROOM_H, -ROOM_D / 2 + uo * ROOM_D);
          mesh.rotation.y = Math.PI / 2;
          break;
        }
        default:
          continue;
      }

      const mat = new StandardMaterial(`ex_${p.id}_mat`, this.scene);
      mat.diffuseTexture = new Texture("/" + p.texture, this.scene);
      mat.transparencyMode = 2;
      mat.useAlphaFromDiffuseTexture = true;
      mat.backFaceCulling = false;
      mesh.material = mat;
      this.roomMaterials.push(mat);
      this.roomMeshes.push(mesh);
    }
  }

  // ── Model + placement loading ───────────────────────────────────────────────

  private async loadModelsAndPlacements(room: HospitalRoom): Promise<void> {
    // Index placements by modelId
    const byModel = new Map<string, RoomObjectPlacement[]>();
    for (const p of (room.placements ?? [])) {
      const arr = byModel.get(p.modelId) ?? [];
      arr.push(p);
      byModel.set(p.modelId, arr);
    }

    for (const modelDef of (room.models ?? [])) {
      const placements = byModel.get(modelDef.id) ?? [];
      if (placements.length === 0) continue;

      if (!modelDef.model) {
        for (const p of placements) {
          this.placeholderObject(modelDef.id, p.position[0], p.position[1], p.position[2]);
        }
        continue;
      }

      const url = "/" + modelDef.model;
      const last = url.lastIndexOf("/");
      const rootUrl = url.substring(0, last + 1);
      const filename = url.substring(last + 1);

      for (const p of placements) {
        try {
          const result = await SceneLoader.ImportMeshAsync("", rootUrl, filename, this.scene);
          const root = result.meshes[0];
          if (!root) continue;
          root.position.set(p.position[0], p.position[1], p.position[2]);
          root.rotation.y = (p.rotationY * Math.PI) / 180;
          root.scaling.setAll(p.scale);
          for (const m of result.meshes) this.roomMeshes.push(m);
        } catch (err) {
          console.warn(`[renderer] Model load failed (${modelDef.model}):`, err);
          this.placeholderObject(modelDef.id, p.position[0], p.position[1], p.position[2]);
        }
      }
    }
  }

  /** Loads the rigged nurse GLB, places her in the hallway, and makes her a ragdoll. */
  private async loadHallwayNurse(): Promise<void> {
    if (this.nurseVelocityInterval !== null) {
      clearInterval(this.nurseVelocityInterval);
      this.nurseVelocityInterval = null;
    }
    this.nurseMesh = null;
    if (this.nurseAggregate) {
      this.nurseAggregate.dispose();
      this.nurseAggregate = null;
    }

    try {
      const [, result] = await Promise.all([
        this.physicsReady,
        SceneLoader.ImportMeshAsync("", "/assets/models/", "nurse_rigged.glb", this.scene),
      ]);
      if (!result.meshes.length) return;

      const root = result.meshes[0]!;

      // Force world matrices so bounding boxes are in world space
      for (const m of result.meshes) m.computeWorldMatrix(true);

      // Compute the combined bounding box across all meshes with geometry
      let minY = Infinity, maxY = -Infinity;
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (const m of result.meshes) {
        if (m.getTotalVertices() === 0) continue;
        const { minimumWorld, maximumWorld } = m.getBoundingInfo().boundingBox;
        minY = Math.min(minY, minimumWorld.y); maxY = Math.max(maxY, maximumWorld.y);
        minX = Math.min(minX, minimumWorld.x); maxX = Math.max(maxX, maximumWorld.x);
        minZ = Math.min(minZ, minimumWorld.z); maxZ = Math.max(maxZ, maximumWorld.z);
      }

      // Scale to ~4.25 units tall (2.5× the baseline 1.7)
      const height = maxY - minY;
      const scale = height > 0.01 ? 4.25 / height : 1;
      root.scaling.setAll(scale);

      // Lift feet to y=0; XZ: place at hallway centre (no offX/offZ — model origin should be centred)
      const liftY = -minY * scale;
      // Hallway floor runs from z=-(ROOM_D/2+WALL_T) outward by HALLWAY_DEPTH; place at its centre
      const hallwayZ = -(ROOM_D / 2 + WALL_T + HALLWAY_DEPTH / 2);
      root.position.set(0, liftY, hallwayZ);
      root.rotation.y = Math.PI; // facing into the room (north)

      // Recompute after transform changes so the physics body initialises at the right position
      for (const m of result.meshes) m.computeWorldMatrix(true);

      for (const m of result.meshes) this.roomMeshes.push(m);
      this.nurseMesh = root;

      // Static physics floor so the nurse stands on it instead of falling through
      const hallwayFloorMesh = this.scene.getMeshByName("hallway_floor");
      if (hallwayFloorMesh) {
        this.floorAggregates.push(
          new PhysicsAggregate(hallwayFloorMesh, PhysicsShapeType.BOX, { mass: 0 }, this.scene),
        );
      }

      // Ragdoll: physics aggregate on the root mesh (box shape, human mass)
      this.nurseAggregate = new PhysicsAggregate(
        root,
        PhysicsShapeType.BOX,
        { mass: 60, restitution: 0.05, friction: 0.5 },
        this.scene,
      );

      // Slide east/west continuously; preserve Y so gravity still applies
      const SPEED = 2;
      let dir = 1;
      this.nurseAggregate.body.setLinearVelocity(new Vector3(SPEED * dir, 0, 0));
      const agg = this.nurseAggregate;
      this.nurseVelocityInterval = setInterval(() => {
        if (!agg.body) return;
        dir *= -1;
        const cur = agg.body.getLinearVelocity();
        agg.body.setLinearVelocity(new Vector3(SPEED * dir, cur.y, 0));
      }, 1500);
    } catch {
      // Nurse GLB not yet generated — silently skip
    }
  }

  private placeholderObject(id: string, x: number, y: number, z: number): void {
    const box = MeshBuilder.CreateBox(`obj_${id}`, { size: 0.85 }, this.scene);
    box.position.set(x, y + 0.425, z);
    const mat = new StandardMaterial(`obj_${id}_mat`, this.scene);
    mat.diffuseTexture = this.objLabel(id);
    this.roomMaterials.push(mat);
    box.material = mat;
    this.roomMeshes.push(box);
  }

  // ── Material factory ───────────────────────────────────────────────────────

  private makeMat(
    name: string,
    texPath: string | null,
    uScale: number,
    vScale: number,
    ph: () => DynamicTexture
  ): StandardMaterial {
    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    if (texPath) {
      const tex = new Texture("/" + texPath, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      tex.uScale = uScale;
      tex.vScale = vScale;
      mat.diffuseTexture = tex;
      this.roomTextures.push(tex);
    } else {
      const t = ph();
      t.uScale = uScale;
      t.vScale = vScale;
      mat.diffuseTexture = t;
      this.roomTextures.push(t);
    }
    this.roomMaterials.push(mat);
    return mat;
  }

  // ── Procedural placeholder textures ───────────────────────────────────────

  /** Gray hospital floor — linoleum-style checkerboard. */
  private phFloor(): DynamicTexture {
    const size = 256;
    const t = new DynamicTexture("ph_floor", { width: size, height: size }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    const cols = ["#a6a6a2", "#b6b6b2"];
    const n = 8; const c = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = cols[(i + j) % 2]!;
      ctx.fillRect(i * c, j * c, c, c);
    }
    t.update(); return t;
  }

  /** North wall — white ceramic tiles with grey grout. */
  private phNorthWall(): DynamicTexture {
    const size = 256;
    const t = new DynamicTexture("ph_north", { width: size, height: size }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#edebe6";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#c8c4bc";
    ctx.lineWidth = 3;
    const cols = 4, rows = 5;
    for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo((i * size) / cols, 0); ctx.lineTo((i * size) / cols, size); ctx.stroke(); }
    for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(0, (j * size) / rows); ctx.lineTo(size, (j * size) / rows); ctx.stroke(); }
    t.update(); return t;
  }

  /** West wall — light sage-green painted plaster (distinct from north). */
  private phWestWall(): DynamicTexture {
    const size = 256;
    const t = new DynamicTexture("ph_west", { width: size, height: size }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    // Base: sage green
    ctx.fillStyle = "#c4d0be";
    ctx.fillRect(0, 0, size, size);
    // Subtle vertical stucco texture lines
    ctx.strokeStyle = "#b8c4b2";
    ctx.lineWidth = 1;
    for (let x = 8; x < size; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 4, size); ctx.stroke();
    }
    // Baseboard hint at bottom
    ctx.fillStyle = "#aabaa4";
    ctx.fillRect(0, size - 20, size, 20);
    t.update(); return t;
  }

  /** South wall (hallway) — beige painted corridor. */
  private phHallway(): DynamicTexture {
    const size = 256;
    const t = new DynamicTexture("ph_hallway", { width: size, height: size }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#cec3a8";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#c4b99e";
    for (let y = 0; y < size; y += 40) ctx.fillRect(0, y, size, 18);
    t.update(); return t;
  }

  /** Object placeholder — blue box with ID label. */
  private objLabel(id: string): DynamicTexture {
    const size = 256;
    const t = new DynamicTexture(`obj_lbl_${id}`, { width: size, height: size }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#2e4070";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#5577cc";
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, size - 12, size - 12);
    ctx.fillStyle = "#8aabff";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(id.replace(/_/g, " "), size / 2, size / 2 - 12);
    ctx.font = "12px monospace";
    ctx.fillStyle = "#4466aa";
    ctx.fillText("pending model", size / 2, size / 2 + 18);
    t.update(); return t;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  private clearRoom(): void {
    if (this.nurseVelocityInterval !== null) {
      clearInterval(this.nurseVelocityInterval);
      this.nurseVelocityInterval = null;
    }
    if (this.nurseAggregate) {
      this.nurseAggregate.dispose();
      this.nurseAggregate = null;
    }
    for (const fa of this.floorAggregates) fa.dispose();
    this.floorAggregates = [];
    for (const tex of this.roomTextures) tex.dispose();
    const seen = new Set<Material>();
    for (const mat of this.roomMaterials) {
      if (!seen.has(mat)) { seen.add(mat); mat.dispose(false, false); }
    }
    for (const mesh of this.roomMeshes) mesh.dispose(false, false);
    this.roomMeshes = [];
    this.roomMaterials = [];
    this.roomTextures = [];
  }

  private dataKey(room: HospitalRoom, hallwayTexture: string | null, hallwayFloorTexture: string | null): string {
    return JSON.stringify({
      hallwayTexture,
      hallwayFloorTexture,
      floorTexture: room.floorTexture,
      wallTexture: room.wallTexture,
      models: (room.models ?? []).map((m) => m.model),
      extraTextures: (room.extraTextures ?? []).map((t) => t.texture),
    });
  }
}
