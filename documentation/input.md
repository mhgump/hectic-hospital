# Input System in JamKit

## Design Philosophy

**Touch-first, keyboard fallback.** The game is designed for mobile (Supercell style), so touch/pointer is primary.

---

## Input Flow

```
User Input → InputManager → Actions → Game Logic
    ↓              ↓            ↓
 (pointer)    (processes)   (consumed)
 (keyboard)
```

---

## InputManager API

Located in `src/input/InputManager.ts`.

### Tap/Click to Move

```typescript
// In render loop:
const taps = ctx.input.consumeTaps();
if (taps.length > 0) {
  const tap = taps.at(-1);
  // tap.clientX, tap.clientY = screen coordinates
}
```

Taps are **consumed** when read—they don't persist across frames.

### Keyboard Movement (WASD/Arrows)

```typescript
const axis = ctx.input.getMoveAxis();
// axis.x: -1 (left) to +1 (right)
// axis.y: -1 (back) to +1 (forward)
```

This is NOT consumed—it reflects current key state.

### Drag for Camera Look

```typescript
const look = ctx.input.consumeLookDragDelta();
// look.dx, look.dy = pixels moved since last consume
```

Used for camera rotation.

**Note:** JamKit separates tap-to-move and drag-to-look:
- Small finger jitter during a tap does **not** rotate the camera
- Drag deltas start accumulating only after movement exceeds the tap threshold

---

## Actions & Bindings

### Actions (`src/input/actions.ts`)

```typescript
export enum Action {
  Move = "Move",                 // semantic "move intent" (set on tap)
  Look = "Look",                 // reserved for look intent
  Pause = "Pause",
  DebugToggle = "DebugToggle",
  InspectorToggle = "InspectorToggle",
}
```

### Key Bindings (`src/input/bindings.ts`)

```typescript
export const defaultKeyBindings: KeyBinding[] = [
  { action: Action.Pause, codes: ["Escape"] },
  { action: Action.DebugToggle, codes: ["KeyZ"] },
  { action: Action.InspectorToggle, codes: ["KeyX"] },
];
```

### Important: Movement keys are currently hardcoded

Keyboard movement (WASD/Arrows) is currently implemented directly inside `InputManager.getMoveAxis()` and **not** configurable via `bindings.ts` yet:

```typescript
// In src/input/InputManager.ts
const left = this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0;
const right = this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0;
const forward = this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0;
const back = this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0;
```

This is intentional for v1 simplicity. If you want fully configurable movement bindings later, we can extend the bindings layer to drive the axis as well.

---

## Camera-Relative Movement

Keyboard input is camera-relative, not world-relative. This makes WASD feel natural regardless of camera angle:

```typescript
// Get camera's forward direction on ground plane
const forward = camera.getTarget().subtract(camera.position).normalize();
forward.y = 0;
if (forward.lengthSquared() > 1e-6) forward.normalize();

// Get right vector (perpendicular to forward on ground)
const right = Vector3.Cross(Vector3.Up(), forward);
if (right.lengthSquared() > 1e-6) right.normalize();

// Combine with input axis
const axis = ctx.input.getMoveAxis();
const moveDir = right.scale(axis.x).add(forward.scale(axis.y));
player.setMoveDirection(moveDir);
```

---

## Tap-to-Move with Raycasting

For tap-to-move, we raycast onto an invisible ground plane:

```typescript
// Create invisible pick plane at y=0
const pickPlane = MeshBuilder.CreateGround("pickPlane", { width: 200, height: 200 }, scene);
pickPlane.isVisible = false;
pickPlane.isPickable = true;

// On tap, raycast to find world position
const taps = ctx.input.consumeTaps();
if (taps.length > 0) {
  const tap = taps.at(-1);
  const rect = canvas.getBoundingClientRect();
  const x = tap.clientX - rect.left;
  const y = tap.clientY - rect.top;
  
  const pick = scene.pick(x, y, (m) => m === pickPlane);
  if (pick?.hit && pick.pickedPoint) {
    player.setMoveTarget(pick.pickedPoint);
  }
}
```

**Important:** This requires `@babylonjs/core/Culling/ray` to be imported!

**If the canvas is CSS-scaled (fixed design resolution):**
Convert pointer coordinates from client space into **render space** before calling `scene.pick(...)`.
Otherwise taps and hovers will be offset.

Example formula:
```
const rect = canvas.getBoundingClientRect();
const renderW = engine.getRenderWidth();
const renderH = engine.getRenderHeight();
const x = (clientX - rect.left) * (renderW / rect.width);
const y = (clientY - rect.top) * (renderH / rect.height);
```

---

## PlayerController

Located in `src/player/PlayerController.ts`.

### Two Movement Modes

1. **Target-based** (tap-to-move):
   ```typescript
   player.setMoveTarget(worldPosition);
   ```

2. **Direction-based** (keyboard):
   ```typescript
   player.setMoveDirection(normalizedDirection);
   // or
   player.setMoveDirection(null); // stop
   ```

### Update Loop

```typescript
// In render loop:
player.update(scene);
```

This moves the player toward target or in direction, using `moveSpeed`.

---

## Mobile Considerations

### Touch Events

The InputManager handles both `pointer` events (modern, unified) for cross-platform support.

### Preventing Scroll

The canvas has `touch-action: none` in CSS to prevent page scrolling during gameplay.

### UI Overlays and Pointer Events

By default, `#ui-root` has `pointer-events: none` so taps reach the canvas. Any
interactive UI (HUD, dialogs, buttons) must opt-in with `pointer-events: auto`
on the container or the specific elements. Otherwise taps will fall through and
trigger movement.

### Audio Unlock

First tap also unlocks audio (handled separately by AudioManager).

---

## Adding New Input Actions

1. Add action to `src/input/actions.ts`
2. Add key binding to `src/input/bindings.ts` (if keyboard)
3. Add handler in `InputManager.ts`
4. Consume in game logic (usually `PlayState.ts`)
