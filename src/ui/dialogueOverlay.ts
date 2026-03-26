import { getUiRoot } from "./uiRoot";

export interface DialogueAction {
  label: string;
  key: string;
  color?: string;
}

export interface DialogueOverlayConfig {
  npcName: string;
  npcRole: string;
  portraitColor?: string;
  initialText: string;
  actions: DialogueAction[];
  onAction: (actionKey: string) => void;
  onPlayerMessage: (text: string) => void;
  onClose: () => void;
}

export interface DialogueOverlayMount {
  appendNpcText(text: string): void;
  appendPlayerText(text: string): void;
  setThinking(thinking: boolean): void;
  teardown(): void;
}

const ROLE_COLORS: Record<string, string> = {
  receptionist: "#E0B028",
  nurse: "#FFFFFF",
  doctor: "#4A7FDB",
  patient: "#6BBF7A",
  dangerous: "#D93636",
};

const ROLE_INITIALS: Record<string, string> = {
  receptionist: "R",
  nurse: "N",
  doctor: "D",
  patient: "P",
  dangerous: "!",
};

function roleColorFor(role: string): string {
  return ROLE_COLORS[role] ?? "#888";
}

export function mountDialogueOverlay(cfg: DialogueOverlayConfig): DialogueOverlayMount {
  const uiRoot = getUiRoot();

  const portraitBg = cfg.portraitColor ?? roleColorFor(cfg.npcRole);
  const initial = ROLE_INITIALS[cfg.npcRole] ?? "?";

  const el = document.createElement("div");
  el.className = "hh_dlg_overlay";
  el.innerHTML = `
    <div class="hh_dlg_backdrop"></div>
    <div class="hh_dlg_panel">
      <div class="hh_dlg_topbar">
        <button class="hh_dlg_close" type="button" data-dlg-close>
          <span class="hh_dlg_close_arrow">&#8592;</span> Back to Hospital
        </button>
      </div>

      <div class="hh_dlg_portrait_area">
        <div class="hh_dlg_portrait" style="background:${portraitBg};">
          <span class="hh_dlg_portrait_initial">${initial}</span>
        </div>
        <div class="hh_dlg_npc_name">${escHtml(cfg.npcName)}</div>
        <div class="hh_dlg_npc_role">${escHtml(cfg.npcRole)}</div>
      </div>

      <div class="hh_dlg_history" data-dlg-history></div>

      <div class="hh_dlg_thinking" data-dlg-thinking style="display:none;">
        <span class="hh_dlg_dot"></span>
        <span class="hh_dlg_dot"></span>
        <span class="hh_dlg_dot"></span>
      </div>

      <div class="hh_dlg_input_area">
        <input class="hh_dlg_input" type="text"
               placeholder="Type a response…" data-dlg-input autocomplete="off" />
        <button class="hh_dlg_send" type="button" data-dlg-send>Send</button>
      </div>

      <div class="hh_dlg_actions" data-dlg-actions></div>
    </div>
  `;

  uiRoot.appendChild(el);

  const historyEl = el.querySelector<HTMLElement>("[data-dlg-history]")!;
  const thinkingEl = el.querySelector<HTMLElement>("[data-dlg-thinking]")!;
  const inputEl = el.querySelector<HTMLInputElement>("[data-dlg-input]")!;
  const sendBtn = el.querySelector<HTMLButtonElement>("[data-dlg-send]")!;
  const actionsEl = el.querySelector<HTMLElement>("[data-dlg-actions]")!;
  const closeBtn = el.querySelector<HTMLButtonElement>("[data-dlg-close]")!;

  function addBubble(who: "npc" | "player", text: string) {
    const bubble = document.createElement("div");
    bubble.className = `hh_dlg_bubble hh_dlg_bubble_${who}`;
    const label = document.createElement("span");
    label.className = "hh_dlg_bubble_label";
    label.textContent = who === "npc" ? cfg.npcName : "You";
    const body = document.createElement("span");
    body.className = "hh_dlg_bubble_text";
    body.textContent = text;
    bubble.appendChild(label);
    bubble.appendChild(body);
    historyEl.appendChild(bubble);
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // Render initial NPC line
  addBubble("npc", cfg.initialText);

  // Render action buttons
  function renderActions() {
    actionsEl.innerHTML = "";
    for (const action of cfg.actions) {
      const btn = document.createElement("button");
      btn.className = "hh_dlg_action_btn";
      btn.type = "button";
      btn.textContent = action.label;
      if (action.color) {
        btn.style.background = action.color;
      }
      btn.dataset.dlgAction = action.key;
      actionsEl.appendChild(btn);
    }
  }
  renderActions();

  function sendPlayerMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addBubble("player", text);
    cfg.onPlayerMessage(text);
  }

  // Event: send button
  sendBtn.addEventListener("click", sendPlayerMessage, { passive: true });

  // Event: enter key in input
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPlayerMessage();
    }
  });

  // Event: action buttons (delegated)
  actionsEl.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-dlg-action]");
    if (target?.dataset.dlgAction) {
      cfg.onAction(target.dataset.dlgAction);
    }
  }, { passive: true });

  // Event: close/back button
  closeBtn.addEventListener("click", () => cfg.onClose(), { passive: true });

  // Event: backdrop click closes
  const backdrop = el.querySelector<HTMLElement>(".hh_dlg_backdrop")!;
  backdrop.addEventListener("click", () => cfg.onClose(), { passive: true });

  // Prevent touch events from propagating to the game canvas
  el.addEventListener("pointerdown", (e) => e.stopPropagation(), { capture: true });
  el.addEventListener("pointermove", (e) => e.stopPropagation(), { capture: true });
  el.addEventListener("pointerup", (e) => e.stopPropagation(), { capture: true });

  // Focus the input after a short delay so mobile keyboard doesn't jump
  setTimeout(() => inputEl.focus(), 100);

  return {
    appendNpcText(text: string) {
      addBubble("npc", text);
    },
    appendPlayerText(text: string) {
      addBubble("player", text);
    },
    setThinking(thinking: boolean) {
      thinkingEl.style.display = thinking ? "flex" : "none";
      if (thinking) {
        historyEl.scrollTop = historyEl.scrollHeight;
      }
    },
    teardown() {
      el.remove();
    },
  };
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
