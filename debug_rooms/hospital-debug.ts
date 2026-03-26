import "./hospital-debug.css";

import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/loaders/glTF";

import { Engine } from "@babylonjs/core/Engines/engine";
import { HospitalRoomRenderer } from "./HospitalRoomRenderer";
import { HospitalUI, postNewRoom, deleteRoom } from "./HospitalUI";
import type { RoomsData, HospitalRoom, ServerStatusResponse } from "./types";

const SERVER_URL = "http://localhost:3737";
const POLL_MS = 5_000;

async function loadInitialData(): Promise<RoomsData> {
  try {
    const res = await fetch(`${SERVER_URL}/api/status`, { signal: AbortSignal.timeout(2_000) });
    if (res.ok) {
      const d = (await res.json()) as ServerStatusResponse;
      return { hallwayTexture: d.hallwayTexture, hallwayFloorTexture: d.hallwayFloorTexture, rooms: d.rooms };
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch("/data/hospital-rooms.json");
    if (res.ok) {
      const j = await res.json();
      return { hallwayTexture: j.hallwayTexture ?? null, hallwayFloorTexture: j.hallwayFloorTexture ?? null, rooms: j.rooms ?? [] };
    }
  } catch { /* fall through */ }

  return { hallwayTexture: null, hallwayFloorTexture: null, rooms: [] };
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#hospital-canvas");
  const uiEl   = document.querySelector<HTMLDivElement>("#hospital-ui");
  if (!canvas || !uiEl) throw new Error("[hospital-debug] Missing DOM elements");

  const initialData = await loadInitialData();
  const engine   = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
  const renderer = new HospitalRoomRenderer(engine, canvas);

  let currentRoomId: string | null = initialData.rooms[0]?.id ?? null;

  const ui = new HospitalUI(uiEl, initialData, {
    onRoomSelect: async (room: HospitalRoom) => {
      currentRoomId = room.id;
      await renderer.loadRoom(room, initialData.hallwayTexture, initialData.hallwayFloorTexture);
    },
    onNewRoom: async (name: string, prompt: string) => {
      return postNewRoom(name, prompt);
    },
    onDeleteRoom: async (roomId: string) => {
      return deleteRoom(roomId);
    },
    onRegenerateLayout: async (roomId: string) => {
      try {
        const res = await fetch(
          `${SERVER_URL}/api/rooms/${encodeURIComponent(roomId)}/regenerate-layout`,
          { method: "POST", signal: AbortSignal.timeout(60_000) }
        );
        if (res.ok) {
          const data = (await res.json()) as ServerStatusResponse;
          ui.applyServerResponse(data);
          const current = data.rooms.find((r) => r.id === roomId);
          if (current) {
            await renderer.loadRoom(current, data.hallwayTexture, data.hallwayFloorTexture);
          }
        }
      } catch { /* server may be offline */ }
    },
    onRegenerateAsset: async (key: string) => {
      try {
        await fetch(`${SERVER_URL}/api/regenerate/${encodeURIComponent(key)}`, {
          method: "POST",
          signal: AbortSignal.timeout(8_000),
        });
      } catch { /* server may be offline */ }
    },
  });

  ui.mount();

  if (initialData.rooms.length > 0) {
    await renderer.loadRoom(initialData.rooms[0]!, initialData.hallwayTexture, initialData.hallwayFloorTexture);
  } else {
    ui.setServerState("connecting");
  }

  // ── Polling loop ───────────────────────────────────────────────────────────

  async function poll(): Promise<void> {
    try {
      const res = await fetch(`${SERVER_URL}/api/status`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) { ui.setServerState("offline"); return; }

      const data = (await res.json()) as ServerStatusResponse;

      // Let the UI merge status updates and re-render component badges
      ui.applyServerResponse(data);

      // Reload scene if current room's assets changed
      const current = data.rooms.find((r) => r.id === currentRoomId);
      if (current) {
        await renderer.refreshIfChanged(current, data.hallwayTexture, data.hallwayFloorTexture);
      }

      // Auto-select if we had no rooms on startup
      if (!currentRoomId && data.rooms.length > 0) {
        currentRoomId = data.rooms[0]!.id;
        ui.selectRoom(data.rooms[0]!);
        await renderer.loadRoom(data.rooms[0]!, data.hallwayTexture, data.hallwayFloorTexture);
      }
    } catch {
      ui.setServerState("offline");
    }
  }

  await poll(); // immediate first poll
  setInterval(() => poll().catch(console.error), POLL_MS);

  engine.runRenderLoop(() => renderer.getScene().render());
  window.addEventListener("resize", () => engine.resize());
}

main().catch((err) => {
  console.error("[hospital-debug] Fatal:", err);
  document.body.innerHTML =
    `<pre style="color:#f55;padding:20px;font-family:monospace;background:#0a0a14">${String(err)}</pre>`;
});
