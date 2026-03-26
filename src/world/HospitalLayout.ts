/**
 * Hardcoded hospital layout: reception at top (north), 2×2 grid of rooms below
 * (south), with hallways between rows/columns and a central N-S corridor
 * connecting the grid to reception.
 *
 * Reads /data/hospital-rooms.json to apply interior layout data (floor textures,
 * models, decals) when a matching layout name is found. Rooms always render with
 * full 4-wall geometry using the hallway wall texture on all outside faces; the
 * hallway floor texture covers all corridor strips. When a layout is present for
 * a room its interior content (floor, models, extra textures) is rendered inside.
 *
 * Layout names matched against JSON: "Reception", "Office", "Beds".
 * If a layout name is not found in the JSON the room still renders (walls only).
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Room, RoomId } from "../hospital/types";

// ── Types matching debug_rooms/types.ts ───────────────────────────────────────

export interface HospitalRoomLayoutData {
  id: string;
  name: string;
  floorTexture: string | null;
  wallTexture?: string | null;
  models?: Array<{ id: string; model: string | null; collides: boolean }>;
  placements?: Array<{
    modelId: string;
    position: [number, number, number];
    rotationY: number;
    scale: number;
  }>;
  extraTextures?: Array<{
    id: string;
    texture: string | null;
    surface: "floor" | "north_wall" | "south_wall" | "east_wall" | "west_wall";
    uvOffset: [number, number];
    uvScale: [number, number];
  }>;
}

export interface HospitalRoomsJson {
  hallwayTexture: string | null;
  hallwayFloorTexture: string | null;
  rooms: HospitalRoomLayoutData[];
}

// ── Geometry constants (matching debug_rooms/HospitalRoomRenderer.ts) ─────────

const ROOM_W = 10;
const ROOM_H = 3;
const WALL_T = 0.15;
const DOOR_W = 1.5;
const DOOR_H = 2.2;
const TILE   = 2.5;

// Reception keeps the full 10×10 footprint.
// Grid rooms use a 10×7 footprint so all five rooms fit within the default
// 40×30 hospital floor (Z: -15 to +15).
const RECEPTION_D = 10;
const GRID_D      = 7;

// ── Hardcoded hospital layout ─────────────────────────────────────────────────
//
//  Z =-15  ┌──────────────────────┐  ← north edge of floor
//          │   RECEPTION  10×10   │  center (0, 0, -10)
//  Z = -5  └──────────┬───────────┘
//                     │  (~2-unit N-S connection hallway)
//  Z = -3  ┌──────────┼────────────┐
//          │ waiting  │ p_room_1   │  grid top row 10×7, centers (±7, 0, +0.5)
//  Z = +4  └──────────┼────────────┘
//                     │  (~3-unit E-W hallway)
//  Z = +7  ┌──────────┼────────────┐
//          │ p_room_2 │ dr_office  │  grid bottom row 10×7, centers (±7, 0, +10.5)
//  Z = +14 └──────────┴────────────┘
//  Z = +15  ══════════════════════  ← south edge of floor

interface RoomSpec {
  id: RoomId;
  pos: Vector3;
  entryPoint: Vector3;
  roomD: number;
  /** Matched against HospitalRoomLayoutData.name to find interior layout data. */
  layoutName: string;
}

const ROOM_SPECS: RoomSpec[] = [
  {
    id: "reception",
    pos: new Vector3(0, 0, -10),
    entryPoint: new Vector3(0, 0, -10),
    roomD: RECEPTION_D,
    layoutName: "Reception",
  },
  {
    id: "waiting",
    pos: new Vector3(-7, 0, 0.5),
    entryPoint: new Vector3(-7, 0, 0.5),
    roomD: GRID_D,
    layoutName: "Office",
  },
  {
    id: "patient_room_1",
    pos: new Vector3(7, 0, 0.5),
    entryPoint: new Vector3(7, 0, 0.5),
    roomD: GRID_D,
    layoutName: "Beds",
  },
  {
    id: "patient_room_2",
    pos: new Vector3(-7, 0, 10.5),
    entryPoint: new Vector3(-7, 0, 10.5),
    roomD: GRID_D,
    layoutName: "Beds",
  },
  {
    id: "doctor_office",
    pos: new Vector3(7, 0, 10.5),
    entryPoint: new Vector3(7, 0, 10.5),
    roomD: GRID_D,
    layoutName: "Office",
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns Room[] for the game model, derived from the hardcoded layout. */
export function getHospitalRooms(): Room[] {
  return ROOM_SPECS.map((s) => ({
    id: s.id,
    position: s.pos.clone(),
    entryPoint: s.entryPoint.clone(),
    occupied: false,
    occupantId: null,
  }));
}

/** Fetches /data/hospital-rooms.json; returns null on any failure. */
export async function fetchRoomsJson(): Promise<HospitalRoomsJson | null> {
  try {
    const res = await fetch("/data/hospital-rooms.json");
    if (!res.ok) return null;
    return (await res.json()) as HospitalRoomsJson;
  } catch {
    return null;
  }
}

/**
 * Builds all hospital room and hallway geometry into `scene`.
 * Returns a dispose function that cleans up all objects this function created.
 * Safe to call with roomsJson=null — rooms render with hallway textures only.
 */
export function buildHospitalGeometry(
  scene: Scene,
  roomsJson: HospitalRoomsJson | null,
): () => void {
  const meshes: AbstractMesh[]   = [];
  const materials: Material[]    = [];
  const textures: BaseTexture[]  = [];
  let disposed = false;

  const hallwayWallTex  = roomsJson?.hallwayTexture ?? null;
  const hallwayFloorTex = roomsJson?.hallwayFloorTexture ?? null;

  // Build layout-name → data index
  const byName = new Map<string, HospitalRoomLayoutData>();
  for (const r of (roomsJson?.rooms ?? [])) byName.set(r.name, r);

  // ── Per-room geometry ───────────────────────────────────────────────────────
  for (const spec of ROOM_SPECS) {
    const layout = byName.get(spec.layoutName) ?? null;
    const ox = spec.pos.x;
    const oz = spec.pos.z;
    const w  = ROOM_W;
    const d  = spec.roomD;
    const pfx = spec.id;

    // Floor — room texture when layout present, otherwise hallway floor texture
    buildFloorAt(scene, meshes, materials, textures,
      pfx, ox, oz, w, d, layout?.floorTexture ?? hallwayFloorTex);

    // All four walls always use hallway wall texture (outside edges)
    buildXWallAt(scene, meshes, materials, textures,
      `${pfx}_n`, ox, oz + d / 2 + WALL_T / 2, w, hallwayWallTex, () => phHallway(scene));
    buildXWallAt(scene, meshes, materials, textures,
      `${pfx}_s`, ox, oz - d / 2 - WALL_T / 2, w, hallwayWallTex, () => phHallway(scene));
    buildZWallAt(scene, meshes, materials, textures,
      `${pfx}_w`, ox - w / 2 - WALL_T / 2, oz, d, hallwayWallTex, () => phHallway(scene));
    buildZWallAt(scene, meshes, materials, textures,
      `${pfx}_e`, ox + w / 2 + WALL_T / 2, oz, d, hallwayWallTex, () => phHallway(scene));

    // Interior content (only when layout is present)
    if (layout) {
      buildExtraTexturesAt(scene, meshes, materials, textures,
        pfx, ox, oz, w, d, layout.extraTextures ?? []);
      void loadModelsAt(scene, ox, oz, layout).then((loaded) => {
        if (disposed) { for (const m of loaded) m.dispose(false, false); }
        else meshes.push(...loaded);
      });
    }
  }

  // ── Hallway floor strips ────────────────────────────────────────────────────
  //
  // N-S central corridor between left and right columns, running from the south
  // face of reception all the way to the south face of the bottom grid row.
  //   X: -2 to +2 (width 4)
  const nsZ0 = -10 + RECEPTION_D / 2 + WALL_T; // reception south outer face ≈ -4.85
  const nsZ1 = 10.5 + GRID_D / 2 + WALL_T;     // bottom row south outer face ≈ 14.15
  buildHallwayStrip(scene, meshes, materials, textures,
    0, (nsZ0 + nsZ1) / 2, 4, nsZ1 - nsZ0, hallwayFloorTex);

  // E-W corridors between the two grid rows (left and right of the N-S strip).
  //   Z: between top-row south face and bottom-row north face
  const ewZ0 = 0.5 + GRID_D / 2 + WALL_T;   // top row south outer face ≈ 4.15
  const ewZ1 = 10.5 - GRID_D / 2 - WALL_T;  // bottom row north outer face ≈ 6.85
  buildHallwayStrip(scene, meshes, materials, textures,
    -7, (ewZ0 + ewZ1) / 2, 10, ewZ1 - ewZ0, hallwayFloorTex); // left strip
  buildHallwayStrip(scene, meshes, materials, textures,
    7, (ewZ0 + ewZ1) / 2, 10, ewZ1 - ewZ0, hallwayFloorTex);  // right strip

  return () => {
    disposed = true;
    for (const t of textures) t.dispose();
    const seenMat = new Set<Material>();
    for (const m of materials) {
      if (!seenMat.has(m)) { seenMat.add(m); m.dispose(false, false); }
    }
    for (const m of meshes) m.dispose(false, false);
  };
}

// ── Floor ─────────────────────────────────────────────────────────────────────

function buildFloorAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  ox: number,
  oz: number,
  w: number,
  d: number,
  texPath: string | null,
): void {
  const mesh = MeshBuilder.CreateBox(
    `floor_${prefix}`,
    { width: w, height: 0.04, depth: d },
    scene,
  );
  mesh.position.set(ox, 0.03, oz); // slightly above hallway strips and base floor
  mesh.material = makeMat(scene, materials, textures,
    `floor_${prefix}`, texPath, d / TILE, w / TILE, () => phFloor(scene));
  mesh.isPickable = false;
  meshes.push(mesh);
}

// ── Hallway floor strip ───────────────────────────────────────────────────────

function buildHallwayStrip(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  cx: number,
  cz: number,
  width: number,
  depth: number,
  texPath: string | null,
): void {
  const mesh = MeshBuilder.CreateBox(
    `hallway_${cx}_${cz}`,
    { width, height: 0.04, depth },
    scene,
  );
  mesh.position.set(cx, 0.01, cz); // above base floor, below room floors
  mesh.material = makeMat(scene, materials, textures,
    `hallway_${cx}_${cz}`, texPath, depth / TILE, width / TILE, () => phHallwayFloor(scene));
  mesh.isPickable = false;
  meshes.push(mesh);
}

// ── X-axis wall (runs along X, positioned at a fixed Z) ───────────────────────

function buildXWallAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  centerX: number,
  wallZ: number,
  roomW: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const half    = roomW / 2;
  const halfD   = DOOR_W / 2;
  const sideW   = half - halfD;
  const sideCX  = halfD + sideW / 2;
  const headerH = ROOM_H - DOOR_H;

  const mk = (n: string, w: number, h: number) =>
    makeMat(scene, materials, textures, n, texPath, w / TILE, h / TILE, phFn);

  const left = MeshBuilder.CreateBox(`${prefix}_l`,
    { width: sideW, height: ROOM_H, depth: WALL_T }, scene);
  left.position.set(centerX - sideCX, ROOM_H / 2, wallZ);
  left.material = mk(`${prefix}_l`, sideW, ROOM_H);
  left.isPickable = false;
  meshes.push(left);

  const right = MeshBuilder.CreateBox(`${prefix}_r`,
    { width: sideW, height: ROOM_H, depth: WALL_T }, scene);
  right.position.set(centerX + sideCX, ROOM_H / 2, wallZ);
  right.material = mk(`${prefix}_r`, sideW, ROOM_H);
  right.isPickable = false;
  meshes.push(right);

  const header = MeshBuilder.CreateBox(`${prefix}_h`,
    { width: DOOR_W, height: headerH, depth: WALL_T }, scene);
  header.position.set(centerX, DOOR_H + headerH / 2, wallZ);
  header.material = mk(`${prefix}_h`, DOOR_W, headerH);
  header.isPickable = false;
  meshes.push(header);
}

// ── Z-axis wall (runs along Z, positioned at a fixed X) ───────────────────────

function buildZWallAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  wallX: number,
  centerZ: number,
  roomD: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const half    = roomD / 2;
  const halfD   = DOOR_W / 2;
  const sideD   = half - halfD;
  const sideCZ  = halfD + sideD / 2;
  const headerH = ROOM_H - DOOR_H;

  const mk = (n: string, d: number, h: number) =>
    makeMat(scene, materials, textures, n, texPath, d / TILE, h / TILE, phFn);

  const left = MeshBuilder.CreateBox(`${prefix}_l`,
    { width: WALL_T, height: ROOM_H, depth: sideD }, scene);
  left.position.set(wallX, ROOM_H / 2, centerZ - sideCZ);
  left.material = mk(`${prefix}_l`, sideD, ROOM_H);
  left.isPickable = false;
  meshes.push(left);

  const right = MeshBuilder.CreateBox(`${prefix}_r`,
    { width: WALL_T, height: ROOM_H, depth: sideD }, scene);
  right.position.set(wallX, ROOM_H / 2, centerZ + sideCZ);
  right.material = mk(`${prefix}_r`, sideD, ROOM_H);
  right.isPickable = false;
  meshes.push(right);

  const header = MeshBuilder.CreateBox(`${prefix}_h`,
    { width: WALL_T, height: headerH, depth: DOOR_W }, scene);
  header.position.set(wallX, DOOR_H + headerH / 2, centerZ);
  header.material = mk(`${prefix}_h`, DOOR_W, headerH);
  header.isPickable = false;
  meshes.push(header);
}

// ── Extra texture placements (decals) ─────────────────────────────────────────

function buildExtraTexturesAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  _textures: BaseTexture[],
  prefix: string,
  ox: number,
  oz: number,
  roomW: number,
  roomD: number,
  placements: NonNullable<HospitalRoomLayoutData["extraTextures"]>,
): void {
  for (const p of placements) {
    if (!p.texture) continue;
    const [uo, vo] = p.uvOffset;
    const us = p.uvScale[0];
    let mesh: AbstractMesh;

    switch (p.surface) {
      case "floor": {
        const sz = us * Math.min(roomW, roomD);
        mesh = MeshBuilder.CreatePlane(`ex_${prefix}_${p.id}`, { width: sz, height: sz }, scene);
        mesh.position.set(ox - roomW / 2 + uo * roomW, 0.05, oz - roomD / 2 + vo * roomD);
        mesh.rotation.x = Math.PI / 2;
        break;
      }
      case "north_wall": {
        const sz = us * Math.min(roomW, ROOM_H);
        mesh = MeshBuilder.CreatePlane(`ex_${prefix}_${p.id}`, { width: sz, height: sz }, scene);
        mesh.position.set(ox - roomW / 2 + uo * roomW, vo * ROOM_H, oz + roomD / 2 - 0.02);
        mesh.rotation.y = Math.PI;
        break;
      }
      case "south_wall": {
        const sz = us * Math.min(roomW, ROOM_H);
        mesh = MeshBuilder.CreatePlane(`ex_${prefix}_${p.id}`, { width: sz, height: sz }, scene);
        mesh.position.set(ox - roomW / 2 + uo * roomW, vo * ROOM_H, oz - roomD / 2 + 0.02);
        break;
      }
      case "east_wall": {
        const sz = us * Math.min(roomD, ROOM_H);
        mesh = MeshBuilder.CreatePlane(`ex_${prefix}_${p.id}`, { width: sz, height: sz }, scene);
        mesh.position.set(ox + roomW / 2 - 0.02, vo * ROOM_H, oz - roomD / 2 + uo * roomD);
        mesh.rotation.y = -Math.PI / 2;
        break;
      }
      case "west_wall": {
        const sz = us * Math.min(roomD, ROOM_H);
        mesh = MeshBuilder.CreatePlane(`ex_${prefix}_${p.id}`, { width: sz, height: sz }, scene);
        mesh.position.set(ox - roomW / 2 + 0.02, vo * ROOM_H, oz - roomD / 2 + uo * roomD);
        mesh.rotation.y = Math.PI / 2;
        break;
      }
      default:
        continue;
    }

    const mat = new StandardMaterial(`ex_${prefix}_${p.id}_mat`, scene);
    mat.diffuseTexture = new Texture("/" + p.texture, scene);
    mat.transparencyMode = 2;
    mat.useAlphaFromDiffuseTexture = true;
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.isPickable = false;
    materials.push(mat);
    meshes.push(mesh);
  }
}

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadModelsAt(
  scene: Scene,
  ox: number,
  oz: number,
  layout: HospitalRoomLayoutData,
): Promise<AbstractMesh[]> {
  const result: AbstractMesh[] = [];
  const models   = layout.models   ?? [];
  const placements = layout.placements ?? [];

  const byModel = new Map<string, typeof placements>();
  for (const p of placements) {
    const arr = byModel.get(p.modelId) ?? [];
    arr.push(p);
    byModel.set(p.modelId, arr);
  }

  for (const modelDef of models) {
    const placed = byModel.get(modelDef.id) ?? [];
    if (placed.length === 0) continue;

    if (!modelDef.model) {
      for (const p of placed) {
        result.push(...placeholderAt(scene, modelDef.id,
          ox + p.position[0], p.position[1], oz + p.position[2]));
      }
      continue;
    }

    const url  = "/" + modelDef.model;
    const last = url.lastIndexOf("/");
    const root = url.substring(0, last + 1);
    const file = url.substring(last + 1);

    for (const p of placed) {
      try {
        const loaded = await SceneLoader.ImportMeshAsync("", root, file, scene);
        const node = loaded.meshes[0];
        if (!node) continue;
        node.position.set(ox + p.position[0], p.position[1], oz + p.position[2]);
        node.rotation.y = (p.rotationY * Math.PI) / 180;
        node.scaling.setAll(p.scale);
        result.push(...loaded.meshes);
      } catch (err) {
        console.warn(`[HospitalLayout] Model load failed (${modelDef.model}):`, err);
        result.push(...placeholderAt(scene, modelDef.id,
          ox + p.position[0], p.position[1], oz + p.position[2]));
      }
    }
  }

  return result;
}

function placeholderAt(
  scene: Scene,
  id: string,
  x: number,
  y: number,
  z: number,
): AbstractMesh[] {
  const box = MeshBuilder.CreateBox(`ph_${id}`, { size: 0.85 }, scene);
  box.position.set(x, y + 0.425, z);
  const mat = new StandardMaterial(`ph_${id}_mat`, scene);
  mat.diffuseColor.set(0.18, 0.25, 0.44);
  box.material = mat;
  box.isPickable = false;
  return [box];
}

// ── Material factory ──────────────────────────────────────────────────────────

function makeMat(
  scene: Scene,
  materials: Material[],
  textures: BaseTexture[],
  name: string,
  texPath: string | null,
  uScale: number,
  vScale: number,
  ph: () => DynamicTexture,
): StandardMaterial {
  const mat = new StandardMaterial(`${name}_mat`, scene);
  if (texPath) {
    const tex = new Texture("/" + texPath, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    tex.uScale = uScale;
    tex.vScale = vScale;
    mat.diffuseTexture = tex;
    textures.push(tex);
  } else {
    const t = ph();
    t.uScale = uScale;
    t.vScale = vScale;
    mat.diffuseTexture = t;
    textures.push(t);
  }
  materials.push(mat);
  return mat;
}

// ── Procedural placeholder textures ──────────────────────────────────────────

function phFloor(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_floor", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const cols = ["#a6a6a2", "#b6b6b2"];
  const n = 8; const c = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = cols[(i + j) % 2]!;
    ctx.fillRect(i * c, j * c, c, c);
  }
  t.update();
  return t;
}

function phHallway(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_hallway_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#cec3a8";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#c4b99e";
  for (let y = 0; y < size; y += 40) ctx.fillRect(0, y, size, 18);
  t.update();
  return t;
}

function phHallwayFloor(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_hallway_floor", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#b8b4ae";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#a8a49e";
  ctx.lineWidth = 2;
  const step = size / 4;
  for (let x = step; x < size; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  for (let y = step; y < size; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  t.update();
  return t;
}
