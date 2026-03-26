import { getUiRoot } from "./uiRoot";

export type HudMount = {
  teardown: () => void;
  setMoney: (money: number) => void;
  setReputation: (rep: number) => void;
  setTimer: (seconds: number) => void;
  setPatientCount: (count: number) => void;
  showAlert: (message: string) => void;
};

export function mountHud(): HudMount {
  const uiRoot = getUiRoot();

  const el = document.createElement("div");
  el.className = "jk_hud";
  el.innerHTML = `
    <div class="jk_hud_card">
      <div class="jk_hud_row">
        <div class="jk_hud_stat"><span class="jk_hud_label">$</span> <span data-hh-money>500</span></div>
        <div class="jk_hud_stat"><span class="jk_hud_label">Rep</span> <span data-hh-rep>50</span></div>
        <div class="jk_hud_stat"><span class="jk_hud_label">⏱</span> <span data-hh-timer>3:00</span></div>
        <div class="jk_hud_stat"><span class="jk_hud_label">Patients</span> <span data-hh-patients>0</span></div>
      </div>
    </div>
    <div class="hh_alert" data-hh-alert style="display:none;"></div>
  `;

  uiRoot.appendChild(el);

  const moneyEl = el.querySelector<HTMLElement>("[data-hh-money]")!;
  const repEl = el.querySelector<HTMLElement>("[data-hh-rep]")!;
  const timerEl = el.querySelector<HTMLElement>("[data-hh-timer]")!;
  const patientEl = el.querySelector<HTMLElement>("[data-hh-patients]")!;
  const alertEl = el.querySelector<HTMLElement>("[data-hh-alert]")!;

  let alertTimeout: ReturnType<typeof setTimeout> | null = null;

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return {
    setMoney(money: number) {
      moneyEl.textContent = `$${money}`;
    },
    setReputation(rep: number) {
      repEl.textContent = String(Math.round(rep));
    },
    setTimer(seconds: number) {
      timerEl.textContent = formatTime(Math.max(0, seconds));
    },
    setPatientCount(count: number) {
      patientEl.textContent = String(count);
    },
    showAlert(message: string) {
      alertEl.textContent = message;
      alertEl.style.display = "block";
      if (alertTimeout) clearTimeout(alertTimeout);
      alertTimeout = setTimeout(() => {
        alertEl.style.display = "none";
      }, 2500);
    },
    teardown() {
      if (alertTimeout) clearTimeout(alertTimeout);
      el.remove();
    },
  };
}
