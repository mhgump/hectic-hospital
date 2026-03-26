#!/usr/bin/env node
/**
 * Hospital Room Debug Server
 * Run: npm run hospital-server
 *
 * - Calls Claude to generate room layouts from prompts
 * - Runs generateTexture / generateModel in parallel (unlimited concurrent)
 * - Applies background removal (rembg) to all decal textures via @imgly/background-removal-node
 * - Persists state to public/data/hospital-rooms.json
 * - HTTP API polled by the browser client every 5s
 */

import http from "http";
import { spawn } from "child_process";
import { readFile, writeFile, mkdir, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROOMS_FILE = path.join(ROOT, "public", "data", "hospital-rooms.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const MODELS_DIR = path.join(PUBLIC_DIR, "assets", "models");
const PORT = 3737;
const MAX_CONCURRENT = Infinity;

// ── In-memory state ────────────────────────────────────────────────────────

/** @type {{ hallwayTexture: string|null, hallwayFloorTexture: string|null, rooms: any[] }} */
let roomsData = { hallwayTexture: null, hallwayFloorTexture: null, rooms: [] };

/** @type {Map<string, 'pending'|'running'|'done'|'error'>} */
const assetStatus = new Map();

/** @type {string[]} */
const activeTasks = [];

// ── Rooms JSON I/O ─────────────────────────────────────────────────────────

async function loadRooms() {
  try {
    const raw = await readFile(ROOMS_FILE, "utf8");
    const json = JSON.parse(raw);
    roomsData = {
      hallwayTexture: json.hallwayTexture ?? null,
      hallwayFloorTexture: json.hallwayFloorTexture ?? null,
      rooms: Array.isArray(json.rooms) ? json.rooms : [],
    };
    // Schema migration
    let migrated = false;
    for (const room of roomsData.rooms) {
      // v1: wallTexture → northWallTexture (then later unified)
      if (room.wallTexture !== undefined && room.northWallTexture === undefined) {
        room.northWallTexture = room.wallTexture ?? null;
        room.northWallTexturePrompt = room.wallTexturePrompt ?? "";
        delete room.wallTexture; delete room.wallTexturePrompt;
        migrated = true;
      }
      // v2: northWallTexture + westWallTexture → unified wallTexture
      if (room.northWallTexture !== undefined && room.wallTexture === undefined) {
        room.wallTexture = room.northWallTexture ?? null;
        room.wallTexturePrompt = room.northWallTexturePrompt ?? "";
        delete room.northWallTexture; delete room.northWallTexturePrompt;
        delete room.westWallTexture;  delete room.westWallTexturePrompt;
        migrated = true;
      }
      // v3: objects[] → models[] + placements[]
      if (Array.isArray(room.objects) && !Array.isArray(room.models)) {
        room.models = room.objects.map((o) => ({
          id: o.id, prompt: o.prompt, model: o.model, collides: true,
        }));
        room.placements = room.objects.map((o) => ({
          modelId: o.id, position: o.position, rotationY: o.rotationY, scale: o.scale,
        }));
        delete room.objects;
        migrated = true;
      }
      // Ensure interactionTiles exists
      if (!Array.isArray(room.interactionTiles)) {
        room.interactionTiles = [];
        migrated = true;
      }
    }
    if (migrated) {
      console.log("[server] Applied schema migration(s)");
      await saveRooms();
    }
  } catch {
    roomsData = { hallwayTexture: null, hallwayFloorTexture: null, rooms: [] };
  }
}

async function saveRooms() {
  await mkdir(path.dirname(ROOMS_FILE), { recursive: true });
  await writeFile(ROOMS_FILE, JSON.stringify(roomsData, null, 2), "utf8");
}

// ── Scan existing models ────────────────────────────────────────────────────

/**
 * Returns a list of existing GLB models that Claude may reuse.
 * Skips rigs, characters, and Kenney/Quaternius stock assets.
 * @returns {Promise<Array<{path: string, label: string}>>}
 */
async function scanExistingModels() {
  try {
    const files = await readdir(MODELS_DIR);
    const glbs = files.filter(
      (f) =>
        f.endsWith(".glb") &&
        !f.includes("nurse") &&
        !f.includes("character") &&
        !f.includes("animal") &&
        !f.includes("kenney") &&
        !f.includes("quaternius")
    );

    return glbs.map((f) => {
      const noExt = f.replace(".glb", "");
      // Try to find a matching model def in roomsData for a descriptive label
      let label = noExt.replace(/_/g, " ");
      for (const room of roomsData.rooms) {
        for (const model of room.models ?? []) {
          if (`${room.id}_${model.id}` === noExt && model.prompt) {
            label = model.prompt
              .replace(/, static prop isolated on (plain )?white background\.?/i, "")
              .replace(/static prop isolated on (plain )?white background\.?/i, "")
              .trim();
            break;
          }
        }
      }
      return { path: `assets/models/${f}`, label };
    });
  } catch {
    return [];
  }
}

// ── Claude layout generation ───────────────────────────────────────────────

const CLAUDE_SYSTEM = `You are a game world designer for "Hectic Hospital", a top-down hospital management game.
Generate a hospital room layout as a JSON object. Return ONLY the JSON — no markdown, no explanation.

ROOM GRID: 7×7 tiles. One tile = 1 world unit ≈ one human character width.
Room bounds: X ∈ [-3.5, 3.5], Z ∈ [-3.5, 3.5], height 3 units. Origin is room center floor.
The CENTER tile of each wall (X=0 for N/S walls, Z=0 for E/W walls) has a door opening (1 tile wide × 2.2 tall).
Camera: south-east exterior corner looking north-west.

MODEL SCALE GUIDE (set scale so the model occupies roughly N tiles in the world):
- Human / NPC: 1 tile → scale ~1.0
- Chair / stool: 1 tile → scale ~0.9
- Desk / small table: 1–2 tiles long → scale ~1.2
- Hospital bed: 2 tiles long × 1 tile wide → scale ~1.8
- Examination / operating table: 2×2 tiles → scale ~2.0
- Cabinet / shelf unit: 1 wide × 1.5 long → scale ~1.3
- X-ray / large machine: 2×2 tiles → scale ~2.0
Set rotationY so the interactive face of the model points toward a clear aisle tile.

NPC INTERACTION TILES — REQUIRED:
Any desk, bed, counter, examination table, x-ray machine, reception counter, or similar interactive object
MUST have exactly one adjacent empty tile listed in interactionTiles. This is where an NPC stands to use the object.
Place the interaction tile directly adjacent to the object's interactive face (not diagonal, not behind).
Do NOT place any other object within 0.5 units of an interaction tile.

Schema (return ONLY this JSON — all fields required):
{
  "floorTexturePrompt": "string — MUST end with: seamless tileable texture",
  "wallTexturePrompt": "string — single interior wall texture for ALL walls, MUST end with: seamless tileable texture",
  "models": [
    {
      "id": "snake_case_id",
      "prompt": "single static object description, MUST end with: static prop isolated on plain white background",
      "collides": true
    }
  ],
  "placements": [
    {
      "modelId": "snake_case_id",
      "position": [x, 0, z],  // Y is ALWAYS 0 — floor only
      "rotationY": 0,
      "scale": 1.0
    }
  ],
  "interactionTiles": [
    {
      "forModelId": "snake_case_id",
      "position": [x, 0, z]
    }
  ],
  "extraTextures": [
    {
      "id": "snake_case_id",
      "prompt": "flat 2D artwork on plain white background",
      "surface": "north_wall",  // ONLY north_wall, west_wall, or floor — never south_wall or east_wall
      "uvOffset": [0.5, 0.7],
      "uvScale": [0.2, 0.2]
    }
  ]
}

Hard rules — MODELS:
- 1–3 distinct models. Absolute maximum: 5. Fewer definitions are better — reuse via placements.
- Each model generates one GLB static prop. No skeleton, no rig, no animation.
- Model prompts MUST end with: static prop isolated on plain white background
- collides: true for solid blockers (furniture, equipment). false for thin/flat items.
- When an existing model from the list below fits the use case, set "existingModel": "path" instead of "prompt".
  Use existing models whenever they make sense — this ensures visual continuity across rooms.
  Specialty rooms (X-ray, MRI, operating theatre) almost always need new assets.

Hard rules — PLACEMENTS:
- Every modelId MUST match an id in models[].
- Reuse model definitions across many placements to fill the room.
- Vary rotationY (0, 90, 180, 270) and scale (±10%) across instances.
- Positions: X ∈ [-3, 3], Z ∈ [-3, 3]. Y MUST always be exactly 0 — all models sit on the floor.
  Never place a model at Y > 0. There are no elevated surfaces, shelves, or wall-mounted objects in placements.
  Wall-mounted items (clocks, signs, posters) belong in extraTextures as decals, NOT in placements.
- NO OVERLAPPING. Every object occupies a footprint of tiles based on its scale. Two objects MUST NOT
  share or intersect any tile. Use the model scale guide to estimate each object's tile footprint:
    scale ~1.0 → 1×1 tiles, scale ~1.8 → 2×1 tiles, scale ~2.0 → 2×2 tiles.
  Treat each object as a rectangle of occupied tiles and ensure ZERO overlap between any two rectangles.
- Minimum separation between placement CENTERS: scale_A/2 + scale_B/2 + 0.5 units (half each footprint
  plus a 0.5-unit aisle gap). For two 1-tile chairs this means centers at least 1.5 units apart.
  For a 2-tile bed next to a 1-tile chair, centers at least 2.0 units apart.
- When in doubt, leave MORE space, not less. A sparse room is better than clipping objects.
- Keep door tiles clear: avoid X∈[-0.5, 0.5] at Z near ±3.5; avoid Z∈[-0.5, 0.5] at X near ±3.5.
- DOORWAY PATHS MUST BE CLEAR: There are 4 doorways (center of each wall). NPCs must be able to walk
  between any two doorways in a straight line through the room. This means the entire cross-shaped
  corridor formed by X∈[-0.5, 0.5] (north–south path) and Z∈[-0.5, 0.5] (east–west path) must be
  kept completely free of all objects. No furniture, equipment, or any placement may intersect this
  cross corridor. Place all objects to the sides, leaving the center cross permanently open.

Hard rules — INTERACTION TILES:
- Every interactive model instance needs ONE adjacent interactionTile.
- The tile must be empty — no placement within 0.5 units of it.
- Position it at the interactive face of the object (front of desk, side of bed, etc.).
- Include one interactionTile entry per placement of an interactive model.

CAMERA NOTE — VISIBILITY:
The camera is fixed at the south-east corner looking north-west. This means:
- The NORTH wall (back wall) and WEST wall (left wall) are fully visible and should be richly decorated.
- The SOUTH wall (front) and EAST wall (right) face AWAY from the camera and are barely visible.
- DO NOT place any models, furniture, or equipment against or near the south or east walls —
  they will be hidden behind other objects or out of frame. Keep the south and east sides clear.
- Concentrate all furniture and equipment toward the north and west sides of the room.

Hard rules — TILEABLE SURFACE TEXTURES (floor + wall):
- These are top-down orthographic material/surface scans — NOT photos of rooms, hallways, or interiors.
- The generator sees only the raw surface material, as if photographed perfectly flat from above (floor)
  or straight-on (wall). No perspective, no depth, no room context, no objects, no furniture, no lighting rigs.
- floorTexturePrompt MUST describe the surface material only. Good examples:
    "seamless tileable PBR floor texture, hospital linoleum flooring, square vinyl tiles, clinical white
     and light grey, subtle surface wear, top-down orthographic material scan, flat even lighting,
     no perspective, no room, no objects, only surface texture, seamless tileable texture"
    "seamless tileable PBR floor texture, polished concrete hospital floor, faint grey veining,
     top-down flat material view, no perspective, no scene, seamless tileable texture"
- wallTexturePrompt MUST describe the surface material only. Good examples:
    "seamless tileable PBR wall texture, hospital interior wall, white gloss ceramic tiles, grey grout lines,
     clean clinical surface, flat front-facing orthographic view, no perspective, no room, seamless tileable texture"
    "seamless tileable PBR wall texture, painted plaster hospital wall, off-white matte finish,
     subtle texture variation, flat orthographic material scan, no depth, seamless tileable texture"
- MUST end with: seamless tileable texture
- NEVER include: hallway, room, corridor, interior, photo, background, perspective, 3D render

Hard rules — TEXTURES (DECALS):
- Decal prompts: flat 2D artwork, sign, or stain on plain white background.
  Background removal is applied automatically, so a clean white background is essential.
- No "scene", "room", "photo", "3D", "background" in decal prompts.
- extraTextures surfaces: north_wall, west_wall, and floor ONLY.
  NEVER use south_wall or east_wall — those surfaces face away from the camera and won't be seen.
- 2–6 extraTexture entries per visible surface. Use them to make the room feel lived-in:
  posters, stains, scuff marks, signs, vents, floor markings, rugs, warning notices.
- uvOffset [u,v]: u=0 left, u=1 right; v=0 bottom, v=1 top (for walls).
- uvScale: same value for both elements (uniform square fraction of surface).`;


/**
 * @param {string} name
 * @param {string} prompt
 * @param {Array<{path:string,label:string}>} existingModels
 */
async function callClaude(name, prompt, existingModels = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[claude] ANTHROPIC_API_KEY not set — using keyword fallback layout");
    return null;
  }

  console.log(`[claude] Generating layout for: "${name}" / "${prompt}"`);

  let existingModelBlock = "";
  if (existingModels.length > 0) {
    existingModelBlock =
      "\n\nExisting 3D models you MAY reuse (prefer these for visual continuity):\n" +
      existingModels
        .map((m) => `- "${m.label}"  →  existingModel: "${m.path}"`)
        .join("\n") +
      '\n\nTo reuse one: omit "prompt", add "existingModel": "<path>" to the model entry instead.';
  }

  const userMessage = `Room name: "${name}"\nRoom description: "${prompt}"${existingModelBlock}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: CLAUDE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text ?? "";

  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = codeBlock ? codeBlock[1] : text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonStr) throw new Error("No JSON found in Claude response");

  return JSON.parse(jsonStr);
}

function fallbackLayout(name, _prompt) {
  return {
    floorTexturePrompt: `hospital ${name.toLowerCase()} floor linoleum, seamless tileable texture`,
    wallTexturePrompt: `hospital interior wall white clinical paint, seamless tileable texture`,
    models: [
      { id: "furniture", prompt: "generic hospital furniture piece, static prop isolated on plain white background", collides: true },
    ],
    placements: [
      { modelId: "furniture", position: [0, 0, 2], rotationY: 0, scale: 1 },
    ],
    interactionTiles: [
      { forModelId: "furniture", position: [0, 0, 1] },
    ],
    extraTextures: [],
  };
}

/**
 * @param {string} name
 * @param {string} prompt
 * @param {Array<{path:string,label:string}>} existingModels
 */
async function buildNewRoom(name, prompt, existingModels = []) {
  let layout;
  try {
    layout = await callClaude(name, prompt, existingModels);
  } catch (err) {
    console.error(`[claude] Error: ${err.message}`);
    return null;
  }
  if (!layout) return null;

  const id = `room_${Date.now().toString(36)}`;
  return {
    id,
    name,
    prompt,
    createdAt: new Date().toISOString(),
    floorTexturePrompt: layout.floorTexturePrompt,
    floorTexture: null,
    wallTexturePrompt: layout.wallTexturePrompt,
    wallTexture: null,
    models: (layout.models ?? []).map((m) => ({
      id: m.id,
      prompt: m.prompt ?? "",
      model: m.existingModel ?? null, // pre-fill if Claude chose to reuse an existing model
      collides: m.collides ?? true,
    })),
    placements: (layout.placements ?? []).map((p) => ({
      ...p,
      position: [p.position[0], 0, p.position[2]], // enforce Y=0 (floor only)
    })),
    interactionTiles: layout.interactionTiles ?? [],
    // Strip any decals on south/east walls — those faces are away from the camera
    extraTextures: (layout.extraTextures ?? [])
      .filter((t) => t.surface !== "south_wall" && t.surface !== "east_wall")
      .map((t) => ({ ...t, texture: null })),
  };
}

// ── Queue building ─────────────────────────────────────────────────────────

/**
 * @type {Array<{key:string,type:'texture'|'model',name:string,prompt:string,
 *   expectedPath:string,applyToData:(d:any,p:string|null)=>void,isDecal:boolean}>}
 */
const pendingQueue = [];

/**
 * @type {Map<string,{key:string,type:'texture'|'model',name:string,prompt:string,
 *   expectedPath:string,applyToData:(d:any,p:string|null)=>void,isDecal:boolean}>}
 */
const taskRegistry = new Map();

function enqueue(key, type, name, prompt, expectedPath, applyToData, isDecal = false) {
  const taskDef = { key, type, name, prompt, expectedPath, applyToData, isDecal };
  taskRegistry.set(key, taskDef);

  const fullPath = path.join(PUBLIC_DIR, expectedPath);
  if (existsSync(fullPath)) {
    applyToData(roomsData, expectedPath);
    assetStatus.set(key, "done");
  } else {
    pendingQueue.push(taskDef);
    assetStatus.set(key, "pending");
  }
}

async function resetAndRequeueAsset(key) {
  const taskDef = taskRegistry.get(key);
  if (!taskDef) return false;

  taskDef.applyToData(roomsData, null);
  await saveRooms();

  const fullPath = path.join(PUBLIC_DIR, taskDef.expectedPath);
  try { await unlink(fullPath); } catch {}

  pendingQueue.push({ ...taskDef });
  assetStatus.set(key, "pending");
  drainQueue().catch(console.error);
  return true;
}

function queueRoomAssets(room) {
  // Hallway wall texture (global)
  if (!roomsData.hallwayTexture) {
    const key = "hallway_texture";
    if (!assetStatus.has(key) || assetStatus.get(key) === "error") {
      enqueue(
        key, "texture", "hospital_wall",
        "hospital hallway wall, painted plaster, clinical white, seamless tileable texture",
        "assets/textures/hospital_wall_1.png",
        (data, p) => { data.hallwayTexture = p; }
      );
    }
  } else {
    assetStatus.set("hallway_texture", "done");
  }

  // Hallway floor texture (global)
  if (!roomsData.hallwayFloorTexture) {
    const key = "hallway_floor_texture";
    if (!assetStatus.has(key) || assetStatus.get(key) === "error") {
      enqueue(
        key, "texture", "hospital_floor",
        "hospital hallway floor, linoleum tiles, clinical white grey, seamless tileable texture",
        "assets/textures/hospital_floor_1.png",
        (data, p) => { data.hallwayFloorTexture = p; }
      );
    }
  } else {
    assetStatus.set("hallway_floor_texture", "done");
  }

  const rid = room.id;

  if (!room.floorTexture) {
    const name = `${rid}_floor`;
    enqueue(`${rid}_floor`, "texture", name, room.floorTexturePrompt,
      `assets/textures/${name}_1.png`,
      (data, p) => { const r = data.rooms.find((x) => x.id === rid); if (r) r.floorTexture = p; }
    );
  } else { assetStatus.set(`${rid}_floor`, "done"); }

  if (!room.wallTexture) {
    const name = `${rid}_wall`;
    enqueue(`${rid}_wall`, "texture", name, room.wallTexturePrompt,
      `assets/textures/${name}_1.png`,
      (data, p) => { const r = data.rooms.find((x) => x.id === rid); if (r) r.wallTexture = p; }
    );
  } else { assetStatus.set(`${rid}_wall`, "done"); }

  for (const modelDef of (room.models ?? [])) {
    const key = `${rid}_model_${modelDef.id}`;
    if (!modelDef.model) {
      if (!modelDef.prompt) {
        // No path and no prompt to generate from — mark as error
        assetStatus.set(key, "error");
        console.warn(`[server] Model "${modelDef.id}" has neither a file path nor a generation prompt.`);
        continue;
      }
      const mname = `${rid}_${modelDef.id}`;
      const mid = modelDef.id;
      enqueue(key, "model", mname, modelDef.prompt,
        `assets/models/${mname}.glb`,
        (data, p) => {
          const r = data.rooms.find((x) => x.id === rid);
          if (r) { const m = r.models.find((x) => x.id === mid); if (m) m.model = p; }
        }
      );
    } else { assetStatus.set(key, "done"); }
  }

  for (const tex of room.extraTextures) {
    const key = `${rid}_tex_${tex.id}`;
    if (!tex.texture) {
      const name = `${rid}_${tex.id}`;
      // isDecal=true → generateTexture will apply background removal via --rembg flag
      enqueue(key, "texture", name, tex.prompt,
        `assets/textures/${name}_1.png`,
        (data, p) => {
          const r = data.rooms.find((x) => x.id === rid);
          if (r) { const t = r.extraTextures.find((x) => x.id === tex.id); if (t) t.texture = p; }
        },
        true /* isDecal */
      );
    } else { assetStatus.set(key, "done"); }
  }
}

// ── Parallel queue processing ──────────────────────────────────────────────

let queueRunning = false;

async function runGeneration(task) {
  const scriptName = task.type === "texture" ? "generateTexture" : "generateModel";
  let args;
  if (task.type === "texture") {
    args = ["run", scriptName, "--", task.prompt, task.name, "--count", "1"];
    if (task.isDecal) args.push("--rembg");
  } else {
    args = ["run", scriptName, "--", task.prompt, task.name];
  }

  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdout.on("data", (d) =>
      process.stdout.write(`  [${task.key}] ${d}`)
    );
    child.stderr.on("data", (d) =>
      process.stderr.write(`  [${task.key}] ${d}`)
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`))
    );
    child.on("error", reject);
  });
}

async function processTask(task) {
  activeTasks.push(task.key);
  assetStatus.set(task.key, "running");

  const typeLabel = task.type === "texture"
    ? (task.isDecal ? "decal  " : "texture")
    : "model  ";
  console.log(`\n[gen] ▶ ${typeLabel}  ${task.key}`);
  console.log(`[gen]   prompt: ${task.prompt.slice(0, 90)}${task.prompt.length > 90 ? "…" : ""}`);

  try {
    await runGeneration(task);

    const fullPath = path.join(PUBLIC_DIR, task.expectedPath);
    if (existsSync(fullPath)) {
      task.applyToData(roomsData, task.expectedPath);
      assetStatus.set(task.key, "done");
      console.log(`[gen] ✓ done    ${task.key}  →  ${task.expectedPath}`);
    } else {
      assetStatus.set(task.key, "error");
      console.error(`[gen] ✗ fail    ${task.key}: output file not found`);
    }
  } catch (err) {
    assetStatus.set(task.key, "error");
    console.error(`[gen] ✗ fail    ${task.key}: ${err.message}`);
  }

  const idx = activeTasks.indexOf(task.key);
  if (idx >= 0) activeTasks.splice(idx, 1);

  await saveRooms();
}

async function drainQueue() {
  if (queueRunning || pendingQueue.length === 0) return;
  queueRunning = true;

  const tasks = [...pendingQueue];
  pendingQueue.length = 0;

  const total = tasks.length;
  console.log(`\n[gen] ${"═".repeat(52)}`);
  console.log(`[gen] Starting ${total} generation task(s)  (unlimited parallel)`);
  console.log(`[gen] ${"═".repeat(52)}`);
  const t0 = Date.now();

  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      if (task) await processTask(task);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, tasks.length) }, worker)
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  const done = tasks.filter((t) => assetStatus.get(t.key) === "done").length;
  const errors = tasks.filter((t) => assetStatus.get(t.key) === "error").length;
  console.log(`\n[gen] ${"═".repeat(52)}`);
  console.log(`[gen] Complete: ${done}/${total} done, ${errors} error(s)  (${elapsed}s)`);
  console.log(`[gen] ${"═".repeat(52)}\n`);

  queueRunning = false;

  if (pendingQueue.length > 0) drainQueue().catch(console.error);
}

// ── Room deletion ──────────────────────────────────────────────────────────

async function deleteRoom(roomId) {
  const room = roomsData.rooms.find((r) => r.id === roomId);
  if (!room) return false;

  const assetPaths = [
    room.floorTexture,
    room.wallTexture,
    ...(room.models ?? []).map((m) => m.model),
    ...(room.extraTextures ?? []).map((t) => t.texture),
  ].filter(Boolean);

  console.log(`[server] Deleting room: ${roomId} (${room.name})`);

  for (const assetPath of assetPaths) {
    const fullPath = path.join(PUBLIC_DIR, assetPath);
    try {
      await unlink(fullPath);
      console.log(`[server]   deleted: ${assetPath}`);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(`[server]   could not delete ${assetPath}: ${err.message}`);
      }
    }
  }

  for (const key of [...assetStatus.keys()]) {
    if (key.startsWith(roomId + "_")) assetStatus.delete(key);
  }

  roomsData.rooms = roomsData.rooms.filter((r) => r.id !== roomId);
  await saveRooms();
  console.log(`[server] Room deleted: ${roomId}`);
  return true;
}

// ── Room layout regeneration ────────────────────────────────────────────────

/**
 * Keeps the same room id but calls Claude again to get a fresh layout.
 * Deletes old generated assets and re-queues everything.
 */
async function regenerateRoomLayout(roomId) {
  const room = roomsData.rooms.find((r) => r.id === roomId);
  if (!room) return false;

  console.log(`[server] Regenerating layout for: ${roomId} (${room.name})`);

  // Delete existing per-room generated assets
  const assetPaths = [
    room.floorTexture,
    room.wallTexture,
    ...(room.models ?? []).map((m) => m.model),
    ...(room.extraTextures ?? []).map((t) => t.texture),
  ].filter(Boolean);

  for (const assetPath of assetPaths) {
    // Only delete files that live under this room's id prefix (don't touch reused models)
    if (!assetPath.includes(roomId)) continue;
    const fullPath = path.join(PUBLIC_DIR, assetPath);
    try { await unlink(fullPath); } catch {}
  }

  // Clear old status entries for this room
  for (const key of [...assetStatus.keys()]) {
    if (key.startsWith(roomId + "_")) assetStatus.delete(key);
  }

  // Generate new layout from Claude
  const existingModels = await scanExistingModels();
  let layout;
  try {
    layout = await callClaude(room.name, room.prompt, existingModels);
  } catch (err) {
    console.error(`[server] Regenerate Claude error: ${err.message}`);
    return false;
  }
  if (!layout) return false;

  // Update room in place (keep id, name, prompt, createdAt)
  room.floorTexturePrompt = layout.floorTexturePrompt;
  room.floorTexture = null;
  room.wallTexturePrompt = layout.wallTexturePrompt;
  room.wallTexture = null;
  room.models = (layout.models ?? []).map((m) => ({
    id: m.id,
    prompt: m.prompt ?? "",
    model: m.existingModel ?? null,
    collides: m.collides ?? true,
  }));
  room.placements = (layout.placements ?? []).map((p) => ({
    ...p,
    position: [p.position[0], 0, p.position[2]], // enforce Y=0 (floor only)
  }));
  room.interactionTiles = layout.interactionTiles ?? [];
  room.extraTextures = (layout.extraTextures ?? [])
    .filter((t) => t.surface !== "south_wall" && t.surface !== "east_wall")
    .map((t) => ({ ...t, texture: null }));

  await saveRooms();
  queueRoomAssets(room);
  drainQueue().catch(console.error);

  console.log(`[server] Room regenerated: ${roomId} — ${room.models.length} model(s), ${room.placements.length} placement(s)`);
  return true;
}

// ── HTTP server ────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function statusPayload() {
  return {
    hallwayTexture: roomsData.hallwayTexture,
    hallwayFloorTexture: roomsData.hallwayFloorTexture,
    rooms: roomsData.rooms,
    status: Object.fromEntries(assetStatus),
    queueLength: pendingQueue.length,
    activeTasks: [...activeTasks],
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const json = (code, data) => {
    res.writeHead(code, { ...CORS, "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // GET /api/status
  if (req.method === "GET" && url.pathname === "/api/status") {
    json(200, statusPayload());
    return;
  }

  // POST /api/rooms — create new room via Claude
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    let body;
    try { body = await parseBody(req); }
    catch { json(400, { error: "invalid JSON" }); return; }

    const { name, prompt } = body;
    if (!name || !prompt) {
      json(400, { error: "name and prompt required" });
      return;
    }

    try {
      console.log(`[server] New room request: "${name}" / "${prompt}"`);
      const existingModels = await scanExistingModels();
      const room = await buildNewRoom(name, prompt, existingModels);
      if (!room) {
        json(500, { error: "Layout generation failed (Claude API unavailable or returned no JSON)" });
        return;
      }
      roomsData.rooms.push(room);
      await saveRooms();
      queueRoomAssets(room);
      drainQueue().catch(console.error);
      console.log(`[server] Room created: ${room.id} — ${room.models.length} model(s), ${room.placements.length} placement(s)`);
      json(200, { room, ...statusPayload() });
    } catch (err) {
      console.error(`[server] Failed to create room: ${err.message}`);
      json(500, { error: err.message });
    }
    return;
  }

  // POST /api/rooms/:id/regenerate-layout — regenerate Claude layout for existing room
  const regenLayoutMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/regenerate-layout$/);
  if (req.method === "POST" && regenLayoutMatch) {
    const roomId = regenLayoutMatch[1];
    let ok = false;
    try {
      ok = await regenerateRoomLayout(roomId);
    } catch (err) {
      console.error(`[server] Regenerate layout error: ${err.message}`);
      json(500, { error: err.message });
      return;
    }
    json(ok ? 200 : 404, ok ? statusPayload() : { error: `Room not found: ${roomId}` });
    return;
  }

  // POST /api/regenerate/:key — reset and re-queue a single failed asset
  const regenMatch = url.pathname.match(/^\/api\/regenerate\/([^/]+)$/);
  if (req.method === "POST" && regenMatch) {
    const key = decodeURIComponent(regenMatch[1]);
    const ok = await resetAndRequeueAsset(key);
    json(ok ? 200 : 404, ok ? statusPayload() : { error: `Unknown asset key: ${key}` });
    return;
  }

  // DELETE /api/rooms/:id
  const deleteMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const roomId = deleteMatch[1];
    const deleted = await deleteRoom(roomId);
    json(deleted ? 200 : 404, deleted ? statusPayload() : { error: `Room not found: ${roomId}` });
    return;
  }

  res.writeHead(404, CORS);
  res.end("Not found");
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function main() {
  await loadRooms();

  for (const room of roomsData.rooms) {
    queueRoomAssets(room);
  }

  const pending = pendingQueue.length;
  const done = [...assetStatus.values()].filter((s) => s === "done").length;
  const total = assetStatus.size;

  console.log(`[server] ${roomsData.rooms.length} room(s) | ${done}/${total} assets done | ${pending} queued`);

  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}/api/status`);
    console.log("[server] Vite:   http://localhost:5173/debug-hospital.html");
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("[server] ⚠  ANTHROPIC_API_KEY not set — new rooms use keyword fallback layout");
    }
    if (pending > 0) {
      console.log(`[server] Starting generation queue (${pending} tasks, unlimited parallel)…\n`);
      drainQueue().catch(console.error);
    } else {
      console.log("[server] All assets up to date.\n");
    }
  });
}

main().catch((err) => {
  console.error("[server] Fatal:", err);
  process.exit(1);
});
