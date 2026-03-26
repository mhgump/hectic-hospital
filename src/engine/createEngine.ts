import { Engine } from "@babylonjs/core/Engines/engine";

export type EngineWithCanvas = {
  engine: Engine;
  canvas: HTMLCanvasElement;
  dispose: () => void;
};

export function createEngine(canvas: HTMLCanvasElement): EngineWithCanvas {
  // Antialias true gives nicer defaults; can be tuned later via debug sliders.
  const engine = new Engine(canvas, false, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false,
  });

  const onResize = () => {
    engine.resize();
  };
  window.addEventListener("resize", onResize, { passive: true });
  // Ensure the initial canvas backbuffer matches CSS size immediately.
  engine.resize();

  // Basic context loss handling; real troubleshooting doc will expand this.
  const onContextLost = (ev: Event) => {
    ev.preventDefault();
    // eslint-disable-next-line no-console
    console.warn("WebGL context lost");
  };
  const onContextRestored = () => {
    // eslint-disable-next-line no-console
    console.info("WebGL context restored");
  };
  canvas.addEventListener("webglcontextlost", onContextLost as EventListener, false);
  canvas.addEventListener("webglcontextrestored", onContextRestored as EventListener, false);

  const dispose = () => {
    window.removeEventListener("resize", onResize);
    canvas.removeEventListener("webglcontextlost", onContextLost as EventListener);
    canvas.removeEventListener(
      "webglcontextrestored",
      onContextRestored as EventListener
    );
    engine.dispose();
  };

  return { engine, canvas, dispose };
}



