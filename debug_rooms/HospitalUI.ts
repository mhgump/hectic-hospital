import type { HospitalRoom, RoomsData, AssetStatus, StatusMap, ServerStatusResponse } from "./types";

const SERVER_URL = "http://localhost:3737";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorizeJson(json: string): string {
  return json
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="jk">$1</span>$2')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, (m, s) => m.replace(s, `<span class="js">${s}</span>`))
    .replace(/:\s*(-?\d+(?:\.\d+)?(?!\.))/g, (m, n) => m.replace(n, `<span class="jn">${n}</span>`))
    .replace(/:\s*(null)/g, (m, n) => m.replace(n, `<span class="jnl">${n}</span>`));
}

// ── HospitalUI ─────────────────────────────────────────────────────────────

export class HospitalUI {
  private el: HTMLElement;
  private data: RoomsData;
  private statusMap: StatusMap = {};
  private activeTasks: string[] = [];
  private queueLength = 0;
  private serverState: "connecting" | "connected" | "offline" = "connecting";
  private selectedRoom: HospitalRoom | null = null;
  private modalOpen = false;

  private selectEl!: HTMLSelectElement;
  private serverDotEl!: HTMLElement;
  private serverLabelEl!: HTMLElement;
  private infoEl!: HTMLElement;

  private onRoomSelect: (room: HospitalRoom) => void;
  private onNewRoom: (name: string, prompt: string) => Promise<HospitalRoom | null>;
  private onDeleteRoom: (roomId: string) => Promise<boolean>;
  private onRegenerateLayout: (roomId: string) => Promise<void>;
  private onRegenerateAsset: (key: string) => Promise<void>;

  constructor(
    el: HTMLElement,
    data: RoomsData,
    callbacks: {
      onRoomSelect: (room: HospitalRoom) => void;
      onNewRoom: (name: string, prompt: string) => Promise<HospitalRoom | null>;
      onDeleteRoom: (roomId: string) => Promise<boolean>;
      onRegenerateLayout: (roomId: string) => Promise<void>;
      onRegenerateAsset: (key: string) => Promise<void>;
    }
  ) {
    this.el = el;
    this.data = data;
    this.onRoomSelect = callbacks.onRoomSelect;
    this.onNewRoom = callbacks.onNewRoom;
    this.onDeleteRoom = callbacks.onDeleteRoom;
    this.onRegenerateLayout = callbacks.onRegenerateLayout;
    this.onRegenerateAsset = callbacks.onRegenerateAsset;
  }

  mount(): void {
    this.el.innerHTML = "";
    this.el.appendChild(this.buildHeader());
    this.infoEl = document.createElement("div");
    this.infoEl.className = "hd-info";
    this.el.appendChild(this.infoEl);

    if (this.data.rooms.length > 0) {
      this.selectRoom(this.data.rooms[0]!);
    } else {
      this.showNoRooms();
    }
  }

  // ── Server updates (called by polling loop) ────────────────────────────────

  applyServerResponse(res: ServerStatusResponse): void {
    this.data.hallwayTexture = res.hallwayTexture;
    this.data.hallwayFloorTexture = res.hallwayFloorTexture;
    this.statusMap = res.status;
    this.activeTasks = res.activeTasks ?? [];
    this.queueLength = res.queueLength;
    this.serverState = "connected";
    this.updateServerDot();

    // Merge incoming rooms
    for (const incoming of res.rooms) {
      const idx = this.data.rooms.findIndex((r) => r.id === incoming.id);
      if (idx >= 0) {
        this.data.rooms[idx] = incoming;
      } else {
        this.data.rooms.push(incoming);
        this.addSelectOption(incoming);
      }
    }

    // Refresh info panel for current room
    if (this.selectedRoom) {
      const fresh = this.data.rooms.find((r) => r.id === this.selectedRoom!.id);
      if (fresh) { this.selectedRoom = fresh; this.renderInfo(fresh); }
    }
  }

  setServerState(state: "connecting" | "connected" | "offline"): void {
    this.serverState = state;
    this.updateServerDot();
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "hd-header";

    const titlebar = document.createElement("div");
    titlebar.className = "hd-titlebar";
    const titleEl = document.createElement("div");
    titleEl.className = "hd-title";
    titleEl.textContent = "Hectic Hospital — Debug";
    titlebar.appendChild(titleEl);

    const srv = document.createElement("div");
    srv.className = "hd-server";
    this.serverDotEl = document.createElement("div");
    this.serverDotEl.className = "hd-server-dot connecting";
    this.serverLabelEl = document.createElement("span");
    this.serverLabelEl.className = "hd-server-label";
    this.serverLabelEl.textContent = ":3737";
    srv.appendChild(this.serverDotEl);
    srv.appendChild(this.serverLabelEl);
    titlebar.appendChild(srv);
    header.appendChild(titlebar);

    const controls = document.createElement("div");
    controls.className = "hd-controls";

    this.selectEl = document.createElement("select");
    this.selectEl.className = "hd-select";
    this.populateSelect();
    this.selectEl.addEventListener("change", () => {
      const room = this.data.rooms.find((r) => r.id === this.selectEl.value);
      if (room) this.selectRoom(room);
    });
    controls.appendChild(this.selectEl);

    const newBtn = this.btn("New", "primary");
    newBtn.addEventListener("click", () => this.showNewRoomModal());
    controls.appendChild(newBtn);

    const regenBtn = this.btn("Regenerate");
    regenBtn.title = "Ask Claude to regenerate this room's layout from scratch";
    regenBtn.addEventListener("click", async () => {
      if (!this.selectedRoom) return;
      if (!confirm(`Regenerate layout for "${this.selectedRoom.name}"?\n\nThis will delete all current assets and generate a new layout using Claude.`)) return;
      regenBtn.disabled = true;
      regenBtn.textContent = "Asking Claude…";
      await this.onRegenerateLayout(this.selectedRoom.id);
      regenBtn.textContent = "Regenerate";
      regenBtn.disabled = false;
    });
    controls.appendChild(regenBtn);

    const delBtn = this.btn("Delete", "danger");
    delBtn.title = "Delete current room and all its generated assets";
    delBtn.addEventListener("click", () => this.deleteCurrentRoom());
    controls.appendChild(delBtn);

    const exportBtn = this.btn("Export");
    exportBtn.title = "Download merged JSON → replace public/data/hospital-rooms.json";
    exportBtn.addEventListener("click", () => this.exportJson());
    controls.appendChild(exportBtn);

    header.appendChild(controls);
    return header;
  }

  private updateServerDot(): void {
    if (!this.serverDotEl) return;
    this.serverDotEl.className = `hd-server-dot ${this.serverState}`;
    this.serverLabelEl.textContent =
      this.serverState === "connected" ? ":3737 ●" :
      this.serverState === "offline"   ? ":3737 ✗" : ":3737 …";
  }

  private populateSelect(): void {
    this.selectEl.innerHTML = "";
    if (this.data.rooms.length === 0) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "(no rooms)";
      this.selectEl.appendChild(opt);
      return;
    }
    for (const room of this.data.rooms) this.addSelectOption(room);
  }

  private addSelectOption(room: HospitalRoom): void {
    if (this.selectEl.querySelector(`option[value="${room.id}"]`)) return;
    const opt = document.createElement("option");
    opt.value = room.id;
    opt.textContent = room.name;
    if (this.selectedRoom?.id === room.id) opt.selected = true;
    this.selectEl.appendChild(opt);
  }

  // ── Room selection ─────────────────────────────────────────────────────────

  selectRoom(room: HospitalRoom): void {
    this.selectedRoom = room;
    this.selectEl.value = room.id;
    this.renderInfo(room);
    this.onRoomSelect(room);
  }

  private showNoRooms(): void {
    this.infoEl.innerHTML =
      '<div class="hd-no-rooms">Waiting for server…<br><br>Run:<br><code style="color:#7ec882">npm run hospital-server</code></div>';
  }

  // ── Delete room ────────────────────────────────────────────────────────────

  private async deleteCurrentRoom(): Promise<void> {
    if (!this.selectedRoom) return;
    const room = this.selectedRoom;
    if (!confirm(`Delete "${room.name}" and all its generated assets?\n\nThis cannot be undone.`)) return;

    const ok = await this.onDeleteRoom(room.id);
    if (!ok) {
      alert("Failed to delete room (server may be offline).");
      return;
    }

    // Remove from local data
    this.data.rooms = this.data.rooms.filter((r) => r.id !== room.id);
    this.selectEl.querySelector(`option[value="${room.id}"]`)?.remove();

    if (this.data.rooms.length > 0) {
      this.selectRoom(this.data.rooms[0]!);
    } else {
      this.selectedRoom = null;
      this.showNoRooms();
    }
  }

  // ── Info panel ─────────────────────────────────────────────────────────────

  private renderInfo(room: HospitalRoom): void {
    const info = this.infoEl;
    info.innerHTML = "";

    // Room header
    const rh = document.createElement("div");
    rh.className = "hd-room-header";
    const rn = document.createElement("div");
    rn.className = "hd-room-name";
    rn.textContent = room.name;
    const rp = document.createElement("div");
    rp.className = "hd-room-prompt";
    rp.textContent = `"${room.prompt}"`;
    rh.appendChild(rn);
    rh.appendChild(rp);
    info.appendChild(rh);

    // Components
    const sec = document.createElement("div");
    sec.className = "hd-section";
    const st = document.createElement("div");
    st.className = "hd-section-title";
    st.textContent = "Components";
    sec.appendChild(st);
    info.appendChild(sec);

    const list = document.createElement("div");
    list.className = "hd-components";

    this.compRow(list, "Hallway Wall (global)",  "hallway_texture",       this.data.hallwayTexture,      "hospital_wall");
    this.compRow(list, "Hallway Floor (global)", "hallway_floor_texture", this.data.hallwayFloorTexture, "hospital_floor");
    this.compRow(list, "Floor Texture",   `${room.id}_floor`, room.floorTexture, `${room.id}_floor`);
    this.compRow(list, "Wall Texture",    `${room.id}_wall`,  room.wallTexture,  `${room.id}_wall`);

    for (const m of (room.models ?? [])) {
      const label = `Model: ${m.id}${m.collides ? "" : " (no collide)"}`;
      this.compRow(list, label, `${room.id}_model_${m.id}`, m.model, `${room.id}_${m.id}`);
    }
    for (const tex of (room.extraTextures ?? [])) {
      this.compRow(list, `Decal: ${tex.id} (${tex.surface})`, `${room.id}_tex_${tex.id}`, tex.texture, `${room.id}_${tex.id}`);
    }

    info.appendChild(list);

    // Queue line
    const ql = document.createElement("div");
    ql.className = "hd-queue-line";
    if (this.activeTasks.length > 0) {
      ql.className += " hd-queue-active";
      ql.textContent = `⚡ generating: ${this.activeTasks.slice(0, 2).join(", ")}${this.activeTasks.length > 2 ? " …" : ""}`;
    } else if (this.queueLength > 0) {
      ql.textContent = `${this.queueLength} task(s) queued`;
    } else {
      ql.textContent = this.serverState === "offline" ? "server offline" : "queue idle";
    }
    info.appendChild(ql);

    // JSON
    const jsec = document.createElement("div");
    jsec.className = "hd-json-section";
    const jt = document.createElement("div");
    jt.className = "hd-section-title";
    jt.textContent = "Layout JSON";
    jsec.appendChild(jt);
    const pre = document.createElement("pre");
    pre.className = "hd-json-view";
    pre.innerHTML = colorizeJson(esc(JSON.stringify(room, null, 2)));
    jsec.appendChild(pre);
    info.appendChild(jsec);
  }

  private compRow(parent: HTMLElement, label: string, key: string, value: string | null, assetName: string): void {
    const row = document.createElement("div");
    row.className = "hd-comp-row";

    const isError = !value && (this.statusMap[key] ?? "unknown") === "error";

    const badge = document.createElement("div");
    badge.className = "hd-badge " + this.badgeClass(key, value);
    badge.textContent = this.badgeText(key, value);
    row.appendChild(badge);

    const ci = document.createElement("div");
    ci.className = "hd-comp-info";
    const cn = document.createElement("div");
    cn.className = "hd-comp-name";
    cn.textContent = label;
    const ck = document.createElement("div");
    ck.className = "hd-comp-key";
    ck.textContent = value ? (value.split("/").pop() ?? value) : assetName;
    ck.title = value ?? assetName;
    ci.appendChild(cn);
    ci.appendChild(ck);
    row.appendChild(ci);

    if (isError) {
      const retryBtn = document.createElement("button");
      retryBtn.className = "hd-btn hd-retry-btn";
      retryBtn.title = "Retry generation";
      retryBtn.textContent = "↺";
      retryBtn.addEventListener("click", async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = "…";
        badge.className = "hd-badge hd-badge-pending";
        badge.textContent = "pending";
        await this.onRegenerateAsset(key);
        retryBtn.textContent = "↺";
        retryBtn.disabled = false;
      });
      row.appendChild(retryBtn);
    }

    parent.appendChild(row);
  }

  private badgeClass(key: string, value: string | null): string {
    if (value) return "hd-badge-done";
    const s = (this.statusMap[key] ?? "unknown") as AssetStatus;
    return `hd-badge-${s}`;
  }

  private badgeText(key: string, value: string | null): string {
    if (value) return "done";
    const labels: Record<AssetStatus, string> = { pending: "pending", running: "running", done: "done", error: "error", unknown: "…" };
    return labels[(this.statusMap[key] ?? "unknown") as AssetStatus] ?? "…";
  }

  // ── New Room Modal ─────────────────────────────────────────────────────────

  showNewRoomModal(): void {
    if (this.modalOpen) return;
    this.modalOpen = true;

    const overlay = document.createElement("div");
    overlay.className = "hd-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "hd-modal";

    const title = document.createElement("div");
    title.className = "hd-modal-title";
    title.textContent = "New Hospital Room";
    modal.appendChild(title);

    const nameF = this.field("Room Name", "input", "e.g. Reception Desk");
    const nameInput = nameF.querySelector("input") as HTMLInputElement;
    modal.appendChild(nameF);

    const promptF = this.field("Room Description", "textarea", "e.g. hospital reception area with a large front desk, waiting chairs, and a notice board");
    const promptInput = promptF.querySelector("textarea") as HTMLTextAreaElement;
    const hint = document.createElement("div");
    hint.className = "hd-modal-hint";
    hint.innerHTML = this.serverState === "connected"
      ? "✓ Claude Opus will generate the full layout from your description."
      : "⚠ Server offline — run <code>npm run hospital-server</code> first.";
    promptF.appendChild(hint);
    modal.appendChild(promptF);

    const actions = document.createElement("div");
    actions.className = "hd-modal-actions";

    const cancelBtn = this.btn("Cancel");
    cancelBtn.addEventListener("click", () => this.closeModal(overlay));

    const createBtn = this.btn("Generate Layout", "primary");
    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      const prompt = promptInput.value.trim();
      nameInput.classList.toggle("error", !name);
      promptInput.classList.toggle("error", !prompt);
      if (!name || !prompt) return;

      createBtn.textContent = "Asking Claude…";
      createBtn.disabled = true;

      const room = await this.onNewRoom(name, prompt);
      this.closeModal(overlay);

      if (room) {
        if (!this.data.rooms.find((r) => r.id === room.id)) {
          this.data.rooms.push(room);
          this.addSelectOption(room);
        }
        this.selectRoom(room);
      } else {
        alert("Failed to create room. Check that the server is running.");
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) this.closeModal(overlay); });
    nameInput.focus();
  }

  private closeModal(overlay: HTMLElement): void {
    overlay.parentNode?.removeChild(overlay);
    this.modalOpen = false;
  }

  private field(label: string, tag: "input" | "textarea", placeholder: string): HTMLElement {
    const f = document.createElement("div");
    f.className = "hd-field";
    const lbl = document.createElement("label");
    lbl.className = "hd-label";
    lbl.textContent = label;
    const input = document.createElement(tag);
    input.className = "hd-input";
    (input as HTMLInputElement).placeholder = placeholder;
    if (tag === "textarea") (input as HTMLTextAreaElement).rows = 3;
    f.appendChild(lbl);
    f.appendChild(input);
    return f;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  private exportJson(): void {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hospital-rooms.json"; a.click();
    URL.revokeObjectURL(url);
  }

  private btn(label: string, variant?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = `hd-btn${variant ? " " + variant : ""}`;
    b.textContent = label;
    return b;
  }

  getData(): RoomsData { return this.data; }
}

// ── Server helpers (called from hospital-debug.ts) ─────────────────────────

export async function postNewRoom(name: string, prompt: string): Promise<HospitalRoom | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, prompt }),
      signal: AbortSignal.timeout(35_000), // Claude + server processing time
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.room as HospitalRoom ?? null;
  } catch { return null; }
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch { return false; }
}
