import { getUiRoot } from "../uiRoot";

export function mountMenuScreen(opts: { onStart: () => void }) {
  const uiRoot = getUiRoot();

  uiRoot.innerHTML = `
    <div class="jk_screen jk_screen_center">
      <div class="jk_title">Crystal Courier</div>
      <button class="jk_button" data-jk-start>Start</button>
    </div>
  `;

  const onClick = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-jk-start]")) {
      opts.onStart();
    }
  };
  uiRoot.addEventListener("click", onClick);

  return {
    teardown() {
      uiRoot.removeEventListener("click", onClick);
      uiRoot.innerHTML = "";
    },
  };
}


