import { Action } from "./actions";
import type { KeyBinding } from "./bindings";

export type TapEvent = {
  clientX: number;
  clientY: number;
  pointerType: string;
};

export type DragDelta = {
  dx: number;
  dy: number;
};

export type MoveAxis = {
  x: number; // left (-1) .. right (+1)
  y: number; // forward (+1) .. back (-1) (named y for 2D axis; mapped to world Z later)
};

export type InputManagerOptions = {
  element: HTMLElement;
  keyBindings: KeyBinding[];
  tapMaxMovePx?: number;
  tapMaxMs?: number;
};

export class InputManager {
  private readonly element: HTMLElement;
  private readonly tapMaxMovePx: number;
  private readonly tapMaxMs: number;

  private readonly downKeys = new Set<string>();
  private readonly pressedThisFrame = new Set<Action>();

  private tapQueue: TapEvent[] = [];

  private activePointerId: number | null = null;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragDx = 0;
  private dragDy = 0;

  private tapDownX = 0;
  private tapDownY = 0;
  private tapDownTimeMs = 0;
  private tapMoved = false;
  private tapPointerType = "mouse";

  private readonly keyBindingsByCode = new Map<string, Action[]>();

  constructor(opts: InputManagerOptions) {
    this.element = opts.element;
    this.tapMaxMovePx = opts.tapMaxMovePx ?? 12;
    this.tapMaxMs = opts.tapMaxMs ?? 300;

    for (const b of opts.keyBindings) {
      for (const code of b.codes) {
        const arr = this.keyBindingsByCode.get(code) ?? [];
        arr.push(b.action);
        this.keyBindingsByCode.set(code, arr);
      }
    }

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // Pointer events cover touch + mouse on modern browsers.
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerCancel);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
  }

  beginFrame() {
    // IMPORTANT:
    // Do NOT clear pressed actions here. Key/pointer events can happen between frames,
    // and clearing here would drop them before gameplay/debug code reads them.
    this.dragDx = 0;
    this.dragDy = 0;
  }

  endFrame() {
    // Clear pressed actions AFTER all systems (scene + debug overlay) have read them.
    this.pressedThisFrame.clear();
  }

  wasPressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  getMoveAxis(): MoveAxis {
    // Keyboard fallback: WASD + Arrow keys.
    const left = this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0;
    const right = this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0;
    const forward = this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0;
    const back = this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0;

    const x = right - left;
    const y = forward - back;
    return { x, y };
  }

  consumeTaps(): TapEvent[] {
    const out = this.tapQueue;
    this.tapQueue = [];
    return out;
  }

  consumeLookDragDelta(): DragDelta {
    const out = { dx: this.dragDx, dy: this.dragDy };
    this.dragDx = 0;
    this.dragDy = 0;
    return out;
  }

  private onKeyDown(ev: KeyboardEvent) {
    if (ev.repeat) return;
    this.downKeys.add(ev.code);
    const actions = this.keyBindingsByCode.get(ev.code);
    if (actions) {
      for (const a of actions) this.pressedThisFrame.add(a);
    }
  }

  private onKeyUp(ev: KeyboardEvent) {
    this.downKeys.delete(ev.code);
  }

  private isDown(code: string): boolean {
    return this.downKeys.has(code);
  }

  private onPointerDown(ev: PointerEvent) {
    // Only track one active pointer for drag-to-look to keep it simple for v1.
    if (this.activePointerId === null) {
      this.activePointerId = ev.pointerId;
      this.dragLastX = ev.clientX;
      this.dragLastY = ev.clientY;
    }

    this.tapDownX = ev.clientX;
    this.tapDownY = ev.clientY;
    this.tapDownTimeMs = performance.now();
    this.tapMoved = false;
    this.tapPointerType = ev.pointerType;
  }

  private onPointerMove(ev: PointerEvent) {
    const dxTap = ev.clientX - this.tapDownX;
    const dyTap = ev.clientY - this.tapDownY;
    if (dxTap * dxTap + dyTap * dyTap > this.tapMaxMovePx * this.tapMaxMovePx) {
      this.tapMoved = true;
    }

    if (this.activePointerId !== ev.pointerId) return;
    const dx = ev.clientX - this.dragLastX;
    const dy = ev.clientY - this.dragLastY;
    this.dragLastX = ev.clientX;
    this.dragLastY = ev.clientY;
    // Keep drag-to-look separate from tap-to-move:
    // - small finger jitter during a tap should not rotate the camera
    // - only start accumulating look drag after we've exceeded the tap threshold
    if (this.tapMoved) {
      this.dragDx += dx;
      this.dragDy += dy;
    }
  }

  private onPointerUp(ev: PointerEvent) {
    if (this.activePointerId === ev.pointerId) {
      this.activePointerId = null;
    }

    const dt = performance.now() - this.tapDownTimeMs;
    if (!this.tapMoved && dt <= this.tapMaxMs) {
      this.tapQueue.push({
        clientX: ev.clientX,
        clientY: ev.clientY,
        pointerType: this.tapPointerType,
      });
      // Semantically this is a "move" intent; mapping to an action keeps the contract.
      this.pressedThisFrame.add(Action.Move);
    }
  }

  private onPointerCancel(ev: PointerEvent) {
    if (this.activePointerId === ev.pointerId) {
      this.activePointerId = null;
    }
  }
}



