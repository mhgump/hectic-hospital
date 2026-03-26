export type UiMount = {
  teardown: () => void;
};

export function getUiRoot(): HTMLDivElement {
  const el = document.querySelector<HTMLDivElement>("#ui-root");
  if (!el) throw new Error("Missing #ui-root");
  return el;
}

export function clearUiRoot() {
  getUiRoot().innerHTML = "";
}



