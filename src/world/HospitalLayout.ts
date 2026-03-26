/**
 * Hardcoded hospital layout: reception at top (north), 2×2 grid of rooms below
 * (south), with hallways between rows/columns and a central N-S corridor
 * connecting the grid to reception.
 *
 * External faces: thick walls (EXT_WALL_T), solid — no door openings except
 * the reception entrance on the hospital's north face.  The entrance uses a
 * special hospital-facade texture with a glass-door panel in the opening.
 * Interior walls remain thin (WALL_T) with door openings to the hallways.
 *
 * North/south (X-axis) walls extend by one wall-thickness beyond the east/west
 * (Z-axis) walls on each side to give gapless, square corners.
 *
 * A large grass plane (y=0.005) sits just above the base floor and is visible
 * everywhere outside the building — room floors and hallway strips cover it
 * inside the footprint.
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

// ── Geometry constants ─────────────────────────────────────────────────────────

const ROOM_W = 10;
const ROOM_H = 3;
const WALL_T     = 0.15;   // interior wall thickness
const EXT_WALL_T = 0.45;   // exterior thick wall thickness
const DOOR_W = 1.5;
const DOOR_H = 2.2;
const TILE   = 2.5;

// Reception keeps the full 10×10 footprint.
// Grid rooms use a 10×7 footprint so all five rooms fit within the default floor.
const RECEPTION_D = 10;
const GRID_D      = 7;

// ── Hardcoded hospital layout ─────────────────────────────────────────────────
//
//  Z =-15  ┌──────────────────────┐  ← north / entrance face
//          │   RECEPTION  10×10   │  center (0, 0, -10)
//  Z = -5  └──────────┬───────────┘
//                     │  N-S corridor (4 wide)
//  Z = -3  ┌──────────┼────────────┐
//          │ waiting  │ p_room_1   │  grid top row 10×7, centers (±7, 0, +0.5)
//  Z = +4  └──────────┼────────────┘
//                     │  E-W corridors
//  Z = +7  ┌──────────┼────────────┐
//          │ p_room_2 │ dr_office  │  grid bottom row 10×7, centers (±7, 0, +10.5)
//  Z = +14 └──────────┴────────────┘

/**
 * Which faces of a room border the outside of the building.
 * Code-convention for the wall positions:
 *   negZ = wall at oz − d/2  (entrance / north face of hospital)
 *   posZ = wall at oz + d/2  (south face)
 *   negX = wall at ox − w/2  (west face)
 *   posX = wall at ox + w/2  (east face)
 */
type WallSide = "posZ" | "negZ" | "negX" | "posX";

interface RoomSpec {
  id: RoomId;
  pos: Vector3;
  entryPoint: Vector3;
  roomD: number;
  layoutName: string;
  extWalls: WallSide[];
  /** negZ wall has a door opening (reception public entrance). */
  isEntrance?: boolean;
}

const ROOM_SPECS: RoomSpec[] = [
  {
    id: "reception",
    pos: new Vector3(0, 0, -8),
    entryPoint: new Vector3(0, 0, -8),
    roomD: RECEPTION_D,
    layoutName: "Reception",
    extWalls: ["negZ", "negX", "posX"],
    isEntrance: true,
  },
  {
    id: "waiting",
    pos: new Vector3(-7, 0, 0.5),
    entryPoint: new Vector3(-7, 0, 0.5),
    roomD: GRID_D,
    layoutName: "Office",
    extWalls: ["negZ", "negX"],
  },
  {
    id: "patient_room_1",
    pos: new Vector3(7, 0, 0.5),
    entryPoint: new Vector3(7, 0, 0.5),
    roomD: GRID_D,
    layoutName: "Beds",
    extWalls: ["negZ", "posX"],
  },
  {
    id: "patient_room_2",
    pos: new Vector3(-7, 0, 10.5),
    entryPoint: new Vector3(-7, 0, 10.5),
    roomD: GRID_D,
    layoutName: "Beds",
    extWalls: ["posZ", "negX"],
  },
  {
    id: "doctor_office",
    pos: new Vector3(7, 0, 10.5),
    entryPoint: new Vector3(7, 0, 10.5),
    roomD: GRID_D,
    layoutName: "Office",
    extWalls: ["posZ", "posX"],
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
 * Safe to call with roomsJson=null — rooms render with placeholder textures only.
 */
export function buildHospitalGeometry(
  scene: Scene,
  roomsJson: HospitalRoomsJson | null,
): () => void {
  const meshes: AbstractMesh[]  = [];
  const materials: Material[]   = [];
  const textures: BaseTexture[] = [];
  let disposed = false;

  const hallwayWallTex  = roomsJson?.hallwayTexture ?? null;
  const hallwayFloorTex = roomsJson?.hallwayFloorTexture ?? null;

  const byName = new Map<string, HospitalRoomLayoutData>();
  for (const r of (roomsJson?.rooms ?? [])) byName.set(r.name, r);

  // ── Exterior grass plane ────────────────────────────────────────────────────
  // Sits just above the base floor (y=0.005); visible wherever room/hallway
  // floors (y=0.01 or 0.03) do not cover it.
  {
    const S = 80;
    const grass = MeshBuilder.CreateGround("grass_exterior", { width: S, height: S }, scene);
    grass.position.y = 0.005;
    grass.material = makeMat(scene, materials, textures,
      "grass_ext", null, S / TILE, S / TILE, () => phGrass(scene));
    grass.isPickable = false;
    meshes.push(grass);
  }

  // ── Per-room geometry ───────────────────────────────────────────────────────
  for (const spec of ROOM_SPECS) {
    const layout = byName.get(spec.layoutName) ?? null;
    const ox  = spec.pos.x;
    const oz  = spec.pos.z;
    const w   = ROOM_W;
    const d   = spec.roomD;
    const pfx = spec.id;
    const ext = new Set(spec.extWalls);
    const interiorWallTex = layout?.wallTexture ?? null;

    // Floor
    buildFloorAt(scene, meshes, materials, textures,
      pfx, ox, oz, w, d, layout?.floorTexture ?? hallwayFloorTex);

    // ── negZ wall  (oz − d/2 face) ────────────────────────────────────────────
    {
      const isExt  = ext.has("negZ");
      const wt     = isExt ? EXT_WALL_T : WALL_T;
      const wallZ  = oz - d / 2 - wt / 2;
      // N/S walls extend by wt on each side → gapless corners
      const extW   = w + 2 * wt;

      if (isExt) {
        if (spec.isEntrance) {
          buildEntranceXWall(scene, meshes, materials, textures,
            `${pfx}_s`, ox, wallZ, w, wt);
        } else {
          buildSolidXWall(scene, meshes, materials, textures,
            `${pfx}_s`, ox, wallZ, extW, wt, null, () => phExteriorWall(scene));
        }
      } else {
        buildXWallAt(scene, meshes, materials, textures,
          `${pfx}_s`, ox, wallZ, w, wt, wt,
          hallwayWallTex, () => phHallway(scene));
      }
    }

    // ── posZ wall  (oz + d/2 face) ────────────────────────────────────────────
    {
      const isExt  = ext.has("posZ");
      const wt     = isExt ? EXT_WALL_T : WALL_T;
      const wallZ  = oz + d / 2 + wt / 2;
      const extW   = w + 2 * wt;

      if (isExt) {
        buildSolidXWall(scene, meshes, materials, textures,
          `${pfx}_n`, ox, wallZ, extW, wt, null, () => phExteriorWall(scene));
      } else {
        buildXWallAt(scene, meshes, materials, textures,
          `${pfx}_n`, ox, wallZ, w, wt, wt,
          interiorWallTex ?? hallwayWallTex, () => phNorthWall(scene));
      }
    }

    // ── negX wall  (ox − w/2 face) ────────────────────────────────────────────
    {
      const isExt = ext.has("negX");
      const wt    = isExt ? EXT_WALL_T : WALL_T;
      const wallX = ox - w / 2 - wt / 2;

      if (isExt) {
        buildSolidZWall(scene, meshes, materials, textures,
          `${pfx}_w`, wallX, oz, d, wt, null, () => phExteriorWall(scene));
      } else {
        buildZWallAt(scene, meshes, materials, textures,
          `${pfx}_w`, wallX, oz, d, wt,
          interiorWallTex ?? hallwayWallTex, () => phWestWall(scene));
      }
    }

    // ── posX wall  (ox + w/2 face) ────────────────────────────────────────────
    {
      const isExt = ext.has("posX");
      const wt    = isExt ? EXT_WALL_T : WALL_T;
      const wallX = ox + w / 2 + wt / 2;

      if (isExt) {
        buildSolidZWall(scene, meshes, materials, textures,
          `${pfx}_e`, wallX, oz, d, wt, null, () => phExteriorWall(scene));
      } else {
        buildZWallAt(scene, meshes, materials, textures,
          `${pfx}_e`, wallX, oz, d, wt,
          hallwayWallTex, () => phHallway(scene));
      }
    }

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
  // Use room inner boundaries (oz ± d/2) so strips butt up against room floors
  // with zero gap — no grass can peek through.

  // N-S central corridor: from reception south inner face to grid bottom south inner face
  const nsZ0 = -8  + RECEPTION_D / 2;   // = -3  (reception south inner face)
  const nsZ1 = 10.5 + GRID_D      / 2;  // = +14 (bottom row south inner face)
  buildHallwayStrip(scene, meshes, materials, textures,
    0, (nsZ0 + nsZ1) / 2, 4, nsZ1 - nsZ0, hallwayFloorTex);

  // E-W corridors between the two grid rows
  const ewZ0 = 0.5  + GRID_D / 2;  // = +4 (top row south inner face)
  const ewZ1 = 10.5 - GRID_D / 2;  // = +7 (bottom row north inner face)
  buildHallwayStrip(scene, meshes, materials, textures,
    -7, (ewZ0 + ewZ1) / 2, 10, ewZ1 - ewZ0, hallwayFloorTex);
  buildHallwayStrip(scene, meshes, materials, textures,
    7, (ewZ0 + ewZ1) / 2, 10, ewZ1 - ewZ0, hallwayFloorTex);

  // ── Exterior bridge walls: close corridor gaps in the building perimeter ─────
  // Wherever an interior hallway strip meets an exterior face of the building
  // there is a gap in that face equal to the corridor width.  These solid
  // segments overlap the adjacent walls by one EXT_WALL_T to seal every gap.
  {
    // N-S corridor (X = -2…+2) meets the grid north and south exterior faces.
    const nsW = 4 + 2 * EXT_WALL_T;
    const bridgeNorthZ = 0.5  - GRID_D / 2 - EXT_WALL_T / 2; // grid top   north face
    const bridgeSouthZ = 10.5 + GRID_D / 2 + EXT_WALL_T / 2; // grid bottom south face
    buildSolidXWall(scene, meshes, materials, textures,
      "ext_bridge_n", 0, bridgeNorthZ, nsW, EXT_WALL_T, null, () => phExteriorWall(scene));
    buildSolidXWall(scene, meshes, materials, textures,
      "ext_bridge_s", 0, bridgeSouthZ, nsW, EXT_WALL_T, null, () => phExteriorWall(scene));

    // E-W corridor (Z = +4…+7) meets the grid east and west exterior faces.
    // patient_room_1/waiting east/west walls end at Z=+4;
    // doctor_office/patient_room_2 east/west walls start at Z=+7.
    const ewD = ewZ1 - ewZ0 + 2 * EXT_WALL_T; // = 3 + 2×0.45 = 3.9
    const ewCZ = (ewZ0 + ewZ1) / 2;            // = 5.5
    const bridgeEastX  =  7 + ROOM_W / 2 + EXT_WALL_T / 2; //  +12.225
    const bridgeWestX  = -7 - ROOM_W / 2 - EXT_WALL_T / 2; //  -12.225
    buildSolidZWall(scene, meshes, materials, textures,
      "ext_bridge_e", bridgeEastX, ewCZ, ewD, EXT_WALL_T, null, () => phExteriorWall(scene));
    buildSolidZWall(scene, meshes, materials, textures,
      "ext_bridge_w", bridgeWestX, ewCZ, ewD, EXT_WALL_T, null, () => phExteriorWall(scene));
  }

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
  ox: number, oz: number, w: number, d: number,
  texPath: string | null,
): void {
  const mesh = MeshBuilder.CreateBox(
    `floor_${prefix}`, { width: w, height: 0.04, depth: d }, scene);
  mesh.position.set(ox, 0.03, oz);
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
  cx: number, cz: number, width: number, depth: number,
  texPath: string | null,
): void {
  const mesh = MeshBuilder.CreateBox(
    `hallway_${cx}_${cz}`, { width, height: 0.04, depth }, scene);
  mesh.position.set(cx, 0.01, cz);
  mesh.material = makeMat(scene, materials, textures,
    `hallway_${cx}_${cz}`, texPath, depth / TILE, width / TILE, () => phHallwayFloor(scene));
  mesh.isPickable = false;
  meshes.push(mesh);
}

// ── X-axis wall with door opening ─────────────────────────────────────────────
// Runs along X at a fixed Z.  The wall total half-span = roomW/2 + extraEachSide.

function buildXWallAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  centerX: number, wallZ: number,
  roomW: number, wallT: number, extraEachSide: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const half    = roomW / 2 + extraEachSide;
  const halfD   = DOOR_W / 2;
  const sideW   = half - halfD;
  const sideCX  = halfD + sideW / 2;
  const headerH = ROOM_H - DOOR_H;

  const mk = (n: string, uw: number, uh: number) =>
    makeMat(scene, materials, textures, n, texPath, uw / TILE, uh / TILE, phFn);

  const left = MeshBuilder.CreateBox(`${prefix}_l`,
    { width: sideW, height: ROOM_H, depth: wallT }, scene);
  left.position.set(centerX - sideCX, ROOM_H / 2, wallZ);
  left.material = mk(`${prefix}_l`, sideW, ROOM_H);
  left.isPickable = false;
  meshes.push(left);

  const right = MeshBuilder.CreateBox(`${prefix}_r`,
    { width: sideW, height: ROOM_H, depth: wallT }, scene);
  right.position.set(centerX + sideCX, ROOM_H / 2, wallZ);
  right.material = mk(`${prefix}_r`, sideW, ROOM_H);
  right.isPickable = false;
  meshes.push(right);

  const header = MeshBuilder.CreateBox(`${prefix}_h`,
    { width: DOOR_W, height: headerH, depth: wallT }, scene);
  header.position.set(centerX, DOOR_H + headerH / 2, wallZ);
  header.material = mk(`${prefix}_h`, DOOR_W, headerH);
  header.isPickable = false;
  meshes.push(header);
}

// ── Z-axis wall with door opening ─────────────────────────────────────────────
// Runs along Z at a fixed X.

function buildZWallAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  wallX: number, centerZ: number,
  roomD: number, wallT: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const half    = roomD / 2;
  const halfD   = DOOR_W / 2;
  const sideD   = half - halfD;
  const sideCZ  = halfD + sideD / 2;
  const headerH = ROOM_H - DOOR_H;

  const mk = (n: string, ud: number, uh: number) =>
    makeMat(scene, materials, textures, n, texPath, ud / TILE, uh / TILE, phFn);

  const left = MeshBuilder.CreateBox(`${prefix}_l`,
    { width: wallT, height: ROOM_H, depth: sideD }, scene);
  left.position.set(wallX, ROOM_H / 2, centerZ - sideCZ);
  left.material = mk(`${prefix}_l`, sideD, ROOM_H);
  left.isPickable = false;
  meshes.push(left);

  const right = MeshBuilder.CreateBox(`${prefix}_r`,
    { width: wallT, height: ROOM_H, depth: sideD }, scene);
  right.position.set(wallX, ROOM_H / 2, centerZ + sideCZ);
  right.material = mk(`${prefix}_r`, sideD, ROOM_H);
  right.isPickable = false;
  meshes.push(right);

  const header = MeshBuilder.CreateBox(`${prefix}_h`,
    { width: wallT, height: headerH, depth: DOOR_W }, scene);
  header.position.set(wallX, DOOR_H + headerH / 2, centerZ);
  header.material = mk(`${prefix}_h`, DOOR_W, headerH);
  header.isPickable = false;
  meshes.push(header);
}

// ── Solid exterior wall (X-axis, no door) ─────────────────────────────────────

function buildSolidXWall(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  centerX: number, wallZ: number,
  width: number, wallT: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const mesh = MeshBuilder.CreateBox(prefix,
    { width, height: ROOM_H, depth: wallT }, scene);
  mesh.position.set(centerX, ROOM_H / 2, wallZ);
  mesh.material = makeMat(scene, materials, textures,
    prefix, texPath, width / TILE, ROOM_H / TILE, phFn);
  mesh.isPickable = false;
  meshes.push(mesh);
}

// ── Solid exterior wall (Z-axis, no door) ─────────────────────────────────────

function buildSolidZWall(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  wallX: number, centerZ: number,
  depth: number, wallT: number,
  texPath: string | null,
  phFn: () => DynamicTexture,
): void {
  const mesh = MeshBuilder.CreateBox(prefix,
    { width: wallT, height: ROOM_H, depth }, scene);
  mesh.position.set(wallX, ROOM_H / 2, centerZ);
  mesh.material = makeMat(scene, materials, textures,
    prefix, texPath, depth / TILE, ROOM_H / TILE, phFn);
  mesh.isPickable = false;
  meshes.push(mesh);
}

// ── Reception entrance wall (exterior X-axis, with door opening + door panel) ──

function buildEntranceXWall(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  textures: BaseTexture[],
  prefix: string,
  centerX: number, wallZ: number,
  roomW: number, wallT: number,
): void {
  // Side panels + header using hospital facade texture
  buildXWallAt(scene, meshes, materials, textures,
    prefix, centerX, wallZ, roomW, wallT, wallT,
    null, () => phFrontWall(scene));

  // Glass-door plane in the opening — faces outward (−Z direction)
  const doorFill = MeshBuilder.CreatePlane(`${prefix}_door`,
    { width: DOOR_W, height: DOOR_H }, scene);
  doorFill.position.set(centerX, DOOR_H / 2, wallZ - wallT / 2 - 0.01);
  doorFill.rotation.y = Math.PI;
  const doorMat = new StandardMaterial(`${prefix}_door_mat`, scene);
  const doorTex = new DynamicTexture(`${prefix}_door_tex`,
    { width: 256, height: 256 }, scene, true);
  phDoorInto(doorTex);
  doorMat.diffuseTexture = doorTex;
  doorMat.backFaceCulling = false;
  doorFill.material = doorMat;
  doorFill.isPickable = false;
  materials.push(doorMat);
  textures.push(doorTex);
  meshes.push(doorFill);
}

// ── Extra texture placements (decals) ─────────────────────────────────────────

function buildExtraTexturesAt(
  scene: Scene,
  meshes: AbstractMesh[],
  materials: Material[],
  _textures: BaseTexture[],
  prefix: string,
  ox: number, oz: number,
  roomW: number, roomD: number,
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
  ox: number, oz: number,
  layout: HospitalRoomLayoutData,
): Promise<AbstractMesh[]> {
  const result: AbstractMesh[] = [];
  const models     = layout.models   ?? [];
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
    if (!modelDef.model) continue; // not yet generated — skip silently

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
        console.error(`[HospitalLayout] Model load failed: /${modelDef.model}`, err);
      }
    }
  }

  return result;
}

// ── Material factory ──────────────────────────────────────────────────────────

function makeMat(
  scene: Scene,
  materials: Material[],
  textures: BaseTexture[],
  name: string,
  texPath: string | null,
  uScale: number, vScale: number,
  ph: () => DynamicTexture,
): StandardMaterial {
  const mat = new StandardMaterial(`${name}_mat`, scene);
  if (texPath) {
    const tex = new Texture(
      "/" + texPath, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE,
      null,
      (msg, ex) => console.warn(`[HospitalLayout] Texture failed: ${texPath}`, msg, ex),
    );
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

function phNorthWall(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_north_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#edebe6";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#c8c4bc"; ctx.lineWidth = 3;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo((i * size) / 4, 0); ctx.lineTo((i * size) / 4, size); ctx.stroke();
  }
  for (let j = 1; j < 5; j++) {
    ctx.beginPath(); ctx.moveTo(0, (j * size) / 5); ctx.lineTo(size, (j * size) / 5); ctx.stroke();
  }
  t.update();
  return t;
}

function phWestWall(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_west_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#c4d0be"; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#b8c4b2"; ctx.lineWidth = 1;
  for (let x = 8; x < size; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 4, size); ctx.stroke();
  }
  ctx.fillStyle = "#aabaa4"; ctx.fillRect(0, size - 20, size, 20);
  t.update();
  return t;
}

function phHallway(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_hallway_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#cec3a8"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#c4b99e";
  for (let y = 0; y < size; y += 40) ctx.fillRect(0, y, size, 18);
  t.update();
  return t;
}

function phHallwayFloor(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_hallway_floor", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#b8b4ae"; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#a8a49e"; ctx.lineWidth = 2;
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

/** Brick/concrete exterior wall. */
function phExteriorWall(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_ext_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#b8895a";        // warm brick base
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#caa882";        // mortar / lighter brick edges
  const bH = 22; const bW = 54;
  for (let row = 0; row * bH < size + bH; row++) {
    const offX = (row % 2 === 0) ? 0 : bW / 2;
    ctx.fillRect(0, row * bH, size, 3);              // horizontal mortar line
    for (let col = offX - bW; col < size + bW; col += bW) {
      ctx.fillRect(col, row * bH, 3, bH);            // vertical mortar line
    }
  }
  t.update();
  return t;
}

/** Clean hospital facade for the reception front wall. */
function phFrontWall(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_front_wall", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  // Off-white facade
  ctx.fillStyle = "#f0efeb"; ctx.fillRect(0, 0, size, size);
  // Blue header band
  ctx.fillStyle = "#2a6faa"; ctx.fillRect(0, 0, size, 28);
  // Light panels / window lines
  ctx.strokeStyle = "#d8d6d0"; ctx.lineWidth = 2;
  for (let x = 48; x < size; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, size); ctx.stroke();
  }
  // Red cross emblem
  ctx.fillStyle = "#cc2222";
  ctx.fillRect(size / 2 - 20, size / 2 - 6, 40, 12);
  ctx.fillRect(size / 2 - 6, size / 2 - 20, 12, 40);
  t.update();
  return t;
}

/** Glass-panel automatic door. Used inline by buildEntranceXWall. */
function phDoorInto(t: DynamicTexture): void {
  const size = 256;
  const ctx = t.getContext() as CanvasRenderingContext2D;
  // Dark frame
  ctx.fillStyle = "#1a3a5c"; ctx.fillRect(0, 0, size, size);
  // Two glass panels
  ctx.fillStyle = "#a8d4f0";
  ctx.fillRect(8,  8, size / 2 - 14, size - 16);
  ctx.fillRect(size / 2 + 6, 8, size / 2 - 14, size - 16);
  // Gold push-handles
  ctx.fillStyle = "#e8c840"; ctx.lineWidth = 4; ctx.strokeStyle = "#e8c840";
  ctx.beginPath(); ctx.moveTo(size / 2 - 10, size * 0.55); ctx.lineTo(size / 2 - 10, size * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(size / 2 + 10, size * 0.55); ctx.lineTo(size / 2 + 10, size * 0.7); ctx.stroke();
  t.update();
}

/** Grass / lawn ground. */
function phGrass(scene: Scene): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("ph_grass", { width: size, height: size }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#5a8a3a"; ctx.fillRect(0, 0, size, size);
  // Darker patches
  ctx.fillStyle = "#4e7a30";
  for (let i = 0; i < 40; i++) {
    ctx.fillRect((i * 73) % size, (i * 97) % size, 12 + (i * 17) % 20, 8 + (i * 11) % 12);
  }
  // Lighter blades
  ctx.fillStyle = "#68a044";
  for (let i = 0; i < 30; i++) {
    ctx.fillRect((i * 113) % size, (i * 83) % size, 4 + (i * 7) % 10, 14 + (i * 13) % 18);
  }
  t.update();
  return t;
}
