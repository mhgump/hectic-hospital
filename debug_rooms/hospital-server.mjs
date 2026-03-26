#!/usr/bin/env node
/**
 * Hospital Room Debug Server
 * Run: npm run hospital-server
 *
 * - Calls Claude Opus to generate room layouts from prompts
 * - Runs generateTexture / generateModel in parallel (unlimited concurrent)
 * - Persists state to public/data/hospital-rooms.json
 * - HTTP API polled by the browser client every 5s
 */

import http from "http";
import { spawn } from "child_process";
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROOMS_FILE = path.join(ROOT, "public", "data", "hospital-rooms.json");
const PUBLIC_DIR = path.join(ROOT, "public");
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
    }
    if (migrated) {
      console.log("[server] Applied schema migration(s)");
      await saveRooms();
    }
  } catch {
    roomsData = { hallwayTexture: null, rooms: [] };
  }
}

async function saveRooms() {
  await mkdir(path.dirname(ROOMS_FILE), { recursive: true });
  await writeFile(ROOMS_FILE, JSON.stringify(roomsData, null, 2), "utf8");
}

// ── Claude layout generation ───────────────────────────────────────────────

const CLAUDE_SYSTEM = `You are a game world designer for "Hectic Hospital", a top-down hospital management game.
Generate a hospital room layout as a JSON object. Return ONLY the JSON — no markdown, no explanation.

Room dimensions: 10 wide (X axis, -5 to +5), 10 deep (Z axis, -5 to +5), 3 tall.
Origin is room center floor. Doors are in the CENTER of each wall (door: 1.5 wide × 2.2 tall).
The camera shows the room from the south-east outside corner looking north-west.

Schema (all fields required):
{
  "floorTexturePrompt": "string — MUST end with: seamless tileable texture",
  "wallTexturePrompt": "string — single interior wall texture used on ALL walls, MUST end with: seamless tileable texture",
  "models": [
    {
      "id": "snake_case_id",
      "prompt": "static prop description, MUST end with: static prop isolated on white background",
      "collides": true
    }
  ],
  "placements": [
    {
      "modelId": "snake_case_id",
      "position": [x, 0, z],
      "rotationY": 0,
      "scale": 1.0
    }
  ],
  "extraTextures": [
    {
      "id": "snake_case_id",
      "prompt": "flat decal or sign description",
      "surface": "north_wall",
      "uvOffset": [0.5, 0.7],
      "uvScale": [0.2, 0.2]
    }
  ]
}

Hard rules — MODELS:
- 1–3 distinct models. Absolute maximum: 5. Fewer is better — rely on placements for density.
- Each model generates one GLB static prop. No skeleton, no rig, no animation.
- Model prompts: single static object, no background. MUST end with: static prop isolated on white background.
- collides: true for solid blockers (furniture, equipment, shelving). false for thin/flat items (plants, signs, lamps).

Hard rules — PLACEMENTS:
- Every modelId MUST match an id in models.
- Reuse models heavily across many placements to fill the room.
- Vary rotationY (0, 90, 180, 270) and scale (0.85–1.15) per instance.
- Positions: X and Z in [-4, 4], Y always 0.
- Minimum 1.5 units between any two placements.
- Keep door openings clear: avoid X∈[-0.75, 0.75] near Z=±5; avoid Z∈[-0.75, 0.75] near X=±5.

Hard rules — TEXTURES:
- wallTexturePrompt: single neutral tileable texture for ALL interior walls (north + west). White paint, tile, etc.
- extraTextures: 2–6 entries per surface (north_wall, west_wall, floor). Total may reach 18.
  Use these to make walls and floor feel lived-in and specific to the room. Be creative and dark:
  stains, scuff marks, worn patches, blood splats, rugs, floor decals, equipment outlines, posters,
  warning signs, safety notices, exit signs, window frames, vents, electrical panels, dirt streaks.
- Each surface should have at least 2 extraTextures entries that vary in position and content.
- extraTextures surfaces: north_wall, west_wall, floor only.
- uvOffset [u,v]: center — u=0 left, u=1 right; v=0 bottom, v=1 top (walls); v=0 near edge (floor).
- uvScale [s,s]: uniform fraction of shorter surface dimension. SAME value both elements.
- Texture prompts: flat 2D image/decal, no "scene", "room", "photo", "background".`;


async function callClaude(name, prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[claude] ANTHROPIC_API_KEY not set — using keyword fallback layout");
    return null;
  }

  console.log(`[claude] Generating layout for: "${name}" / "${prompt}"`);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: CLAUDE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Room name: "${name}"\nRoom description: "${prompt}"`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text ?? "";

  // Extract JSON from response (handles ```json blocks or bare JSON)
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
      { id: "furniture", prompt: "generic hospital furniture piece, static prop isolated on white background", collides: true },
    ],
    placements: [
      { modelId: "furniture", position: [0, 0, 2], rotationY: 0, scale: 1 },
    ],
    extraTextures: [],
  };
}

async function buildNewRoom(name, prompt) {
  let layout;
  try {
    layout = await callClaude(name, prompt);
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
    models: (layout.models ?? []).map((m) => ({ ...m, model: null, collides: m.collides ?? true })),
    placements: layout.placements ?? [],
    extraTextures: (layout.extraTextures ?? []).map((t) => ({ ...t, texture: null })),
  };
}

// ── Queue building ─────────────────────────────────────────────────────────

/** @type {Array<{key:string,type:'texture'|'model',name:string,prompt:string,expectedPath:string,applyToData:(d:any,p:string|null)=>void}>} */
const pendingQueue = [];

/** @type {Map<string, {key:string,type:'texture'|'model',name:string,prompt:string,expectedPath:string,applyToData:(d:any,p:string|null)=>void}>} */
const taskRegistry = new Map();

function enqueue(key, type, name, prompt, expectedPath, applyToData) {
  const taskDef = { key, type, name, prompt, expectedPath, applyToData };
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

  // Clear the path in room data
  taskDef.applyToData(roomsData, null);
  await saveRooms();

  // Delete existing file so it regenerates
  const fullPath = path.join(PUBLIC_DIR, taskDef.expectedPath);
  try { await unlink(fullPath); } catch {}

  // Re-enqueue and process
  pendingQueue.push({ ...taskDef });
  assetStatus.set(key, "pending");
  drainQueue().catch(console.error);
  return true;
}

function queueRoomAssets(room) {
  // Hallway wall texture (global — south-wall exterior, uses user-generated hospital_wall_1.png)
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

  // Hallway floor texture (global — corridor strip outside south wall, uses hospital_floor_1.png)
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
      enqueue(key, "texture", name, tex.prompt,
        `assets/textures/${name}_1.png`,
        (data, p) => {
          const r = data.rooms.find((x) => x.id === rid);
          if (r) { const t = r.extraTextures.find((x) => x.id === tex.id); if (t) t.texture = p; }
        }
      );
    } else { assetStatus.set(key, "done"); }
  }
}

// ── Parallel queue processing ──────────────────────────────────────────────

let queueRunning = false;

async function runGeneration(task) {
  const scriptName = task.type === "texture" ? "generateTexture" : "generateModel";
  const args =
    task.type === "texture"
      ? ["run", scriptName, "--", task.prompt, task.name, "--count", "1"]
      : ["run", scriptName, "--", task.prompt, task.name];

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

  const typeLabel = task.type === "texture" ? "texture" : "model  ";
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

  // Pool: each worker picks the next task from a shared iterator
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

  // In case new tasks were added while we were running
  if (pendingQueue.length > 0) drainQueue().catch(console.error);
}

// ── Room deletion ──────────────────────────────────────────────────────────

async function deleteRoom(roomId) {
  const room = roomsData.rooms.find((r) => r.id === roomId);
  if (!room) return false;

  // Collect all asset paths for this room
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

  // Remove status entries
  for (const key of [...assetStatus.keys()]) {
    if (key.startsWith(roomId + "_")) assetStatus.delete(key);
  }

  // Remove from rooms array
  roomsData.rooms = roomsData.rooms.filter((r) => r.id !== roomId);
  await saveRooms();
  console.log(`[server] Room deleted: ${roomId}`);
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

  // GET /api/status — polled every 5s by the browser
  if (req.method === "GET" && url.pathname === "/api/status") {
    json(200, statusPayload());
    return;
  }

  // POST /api/rooms — creates a new room via Claude layout generation
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
      const room = await buildNewRoom(name, prompt);
      if (!room) {
        console.error("[server] Layout generation failed — room not created");
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
    if (deleted) {
      json(200, statusPayload());
    } else {
      json(404, { error: `Room not found: ${roomId}` });
    }
    return;
  }

  res.writeHead(404, CORS);
  res.end("Not found");
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function main() {
  await loadRooms();

  // Queue missing assets for all existing rooms
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
