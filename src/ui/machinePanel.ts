import { getUiRoot } from "./uiRoot";

export type MachinePanelMount = {
  setVisible: (visible: boolean) => void;
  setBusy: (busy: boolean) => void;
  containsTarget: (target: EventTarget | null) => boolean;
  teardown: () => void;
};

export function mountMachinePanel(opts: { onMoreCrystals: () => void }): MachinePanelMount {
  const uiRoot = getUiRoot();

  const el = document.createElement("div");
  el.className = "jk_panel jk_machinePanel";
  el.innerHTML = `
    <div class="jk_panel_card">
      <div class="jk_panel_title">Crystal Machine</div>
      <div class="jk_panel_text">Walk up to the machine and press the button.</div>
      <button class="jk_button jk_panel_button" type="button" data-jk-more>
        More crystals
      </button>
    </div>
  `;

  uiRoot.appendChild(el);

  const card = el.querySelector<HTMLDivElement>(".jk_panel_card");
  if (!card) throw new Error("Machine panel missing card element");

  const btn = el.querySelector<HTMLButtonElement>("[data-jk-more]");
  if (!btn) throw new Error("Machine panel missing button");

  btn.addEventListener("click", () => opts.onMoreCrystals(), { passive: true });

  const setVisible = (visible: boolean) => {
    el.style.display = visible ? "grid" : "none";
  };

  const setBusy = (busy: boolean) => {
    btn.disabled = busy;
    btn.textContent = busy ? "Dropping..." : "More crystals";
  };

  // Hidden by default (we show it when player is near).
  setVisible(false);

  return {
    setVisible,
    setBusy,
    containsTarget(target: EventTarget | null) {
      if (!target) return false;
      return card.contains(target as Node);
    },
    teardown() {
      el.remove();
    },
  };
}


