import { getUiRoot } from "./uiRoot";

export type LogoOverlayMount = {
  teardown: () => void;
};

export function mountLogoOverlay(): LogoOverlayMount {
  const uiRoot = getUiRoot();

  const el = document.createElement("div");
  el.className = "hh_logo_overlay";

  const img = document.createElement("img");
  img.className = "hh_logo_img";
  img.src = "/assets/ui/hectic-hospital-logo.png";
  img.alt = "Hectic Hospital";
  img.draggable = false;

  el.appendChild(img);
  uiRoot.appendChild(el);

  return {
    teardown() {
      el.remove();
    },
  };
}
