import { getUiRoot } from "./uiRoot";

export type HudMount = {
  teardown: () => void;
  setScore: (score: number) => void;
};

export function mountHud(): HudMount {
  const uiRoot = getUiRoot();

  const el = document.createElement("div");
  el.className = "jk_hud";
  el.innerHTML = `
    <div class="jk_hud_card">
      <div class="jk_hud_row">
        <div class="jk_hud_stat"><span class="jk_hud_label">Score</span> <span data-jk-score>0</span></div>
      </div>
    </div>
  `;

  uiRoot.appendChild(el);

  const scoreEl = el.querySelector<HTMLElement>("[data-jk-score]");
  if (!scoreEl) throw new Error("HUD missing score element");

  const setScore = (score: number) => {
    scoreEl.textContent = String(score);
  };

  setScore(0);

  return {
    setScore,
    teardown() {
      el.remove();
    },
  };
}
