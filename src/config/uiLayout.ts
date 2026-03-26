export const UiLayout = {
  designWidth: 480,
  designHeight: 800,
  baseUiScale: 1.5,
  maxShellScale: 2.5,
  maxRenderScale: 3,
};

export function getShellScale(viewportWidth: number, viewportHeight: number): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 1;
  const scale = Math.min(
    viewportWidth / UiLayout.designWidth,
    viewportHeight / UiLayout.designHeight
  );
  return Math.min(scale, UiLayout.maxShellScale);
}

export function getRenderScale(shellScale: number, devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const desired = shellScale * dpr;
  return Math.min(desired, UiLayout.maxRenderScale);
}
