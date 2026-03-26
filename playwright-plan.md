# Playwright integration plan (JamKit)

This document describes how we’ll add **Playwright E2E testing** so an AI agent (and humans) can:

- Open the game in a real browser
- Perform basic actions (click/tap/drag)
- Capture **screenshots** (and optional video/trace)
- Capture and assert on **console logs + uncaught errors**
- Fail fast on runtime crashes (including the in-game `.jk_error` overlay)

This is a **plan only** (no implementation in this doc). It’s written to be executed incrementally.

---

## Goals

- **One-command pass/fail**: `npm run e2e` returns exit code 0/1.
- **Production-like**: Run tests against `vite preview` of `vite build` output (not `vite dev`).
- **Unattended**: No manual clicks, no inspector, no prompts.
- **Action coverage** (minimum):
  - Page loads without runtime errors
  - HUD appears
  - Results screen appears after time elapses (in test mode later)
  - “Play Again” works
  - Tap-to-move and drag-to-look can be simulated
- **Artifacts**: On failure, collect screenshot + trace to debug quickly.

---

## Non-goals (initially)

- Perfect pixel-diff / visual regression across GPUs.
- Full gameplay correctness (AI pathing, physics accuracy).
- Multi-browser matrix (start with Chromium; expand later).

---

## Current status (repo today)

- No `test` script; no Playwright/Vitest.
- Runtime error visibility exists via `ErrorOverlay` which shows `.jk_error` on uncaught errors / unhandled promise rejections.
- UI has stable selectors (good for E2E):
  - Menu: `[data-jk-start]`
  - Results: `[data-jk-again]`
  - HUD: `[data-jk-score]`, `[data-jk-time]`

---

## Proposed approach

### Key design decisions

- **Use Playwright’s `webServer`** to start `vite preview` on a known port for tests.
- **Prefer built output**:
  - `npm run build`
  - `vite preview --host --port <fixed>`
- **Fail on errors**:
  - Any `pageerror`
  - Any `console.error`
  - `.jk_error` becoming visible (ErrorOverlay)

This aligns with JamKit’s “primary method should work or show an error” rule: tests should not hide errors—tests should surface them.

---

## Phase 1: Minimal Playwright E2E (smoke + screenshots)

### Files to add

- `playwright.config.ts`
  - `testDir: "e2e"`
  - `use.baseURL: "http://127.0.0.1:4174"` (dedicated port to avoid collisions)
  - `use.viewport: { width: 390, height: 844 }` (iPhone 14-ish; mobile-first)
  - `use.screenshot: "only-on-failure"`
  - `use.trace: "retain-on-failure"`
  - `expect.timeout: 10_000` (WebGL + assets can be slow)
  - `webServer`:
    - `command: "npm run preview -- --port 4174 --strictPort"`
    - `reuseExistingServer: true` (don't fail if already running)
    - Note: expects `npm run build` to have been run first (CI does this; locally dev can run once)
  - `reporter: [["html", { open: "never" }], ["list"], ["json", { outputFile: "test-results/results.json" }]]`
    - JSON reporter enables LLM agents to parse results programmatically
- `e2e/smoke.spec.ts`
  - "loads without crash"
  - "HUD visible"
  - "no `.jk_error` overlay"
  - Take a baseline screenshot (always or on failure)

### Scripts to add (planned)

- `npm run e2e`: build + run Playwright headless (`npm run build && npx playwright test`)
- `npm run e2e:fast`: run Playwright without rebuilding (for rapid iteration after initial build)
- `npm run e2e:headed`: headed mode for local debugging
- `npm run e2e:report`: open Playwright report

We should keep these scripts **independent of `npm run dev`** (JamKit rule: don't start/stop dev server for the user). Playwright will manage its own preview server process.

### Audio handling

`AudioContext` is often suspended in headless browsers until a user gesture. Mitigations:
- The first test action should be a click/tap (unlocks audio).
- In `?e2e=1` mode (Phase 2), we can stub `AudioManager` to skip actual playback, avoiding timing issues.

### Smoke test behavior (planned)

- Navigate to `/`
- Attach listeners:
  - `page.on("pageerror", ...)` → fail
  - `page.on("console", ...)`:
    - fail on `msg.type() === "error"`
    - log the rest for debugging
- Assert the error overlay is not visible:
  - locate `.jk_error`
  - ensure it’s hidden or absent after load settles
- Assert the game is rendering:
  - wait for `#game-canvas`
  - optionally wait for FPS overlay? (not visible by default)
  - take screenshot of the canvas + UI

### Basic actions (planned)

Even without a dedicated "test mode", we can already do:

- **Tap/click** on canvas (creates a tap event)
- **Drag** on canvas (creates look delta)
- **Click** buttons in menu/results if the state flow uses them

Note: Current default state flow is `boot → play` (menu is skipped), so Phase 1 tests should not depend on Menu UI.

### Example smoke test (pseudocode)

```typescript
import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    // Click canvas to unlock audio + ensure focus
    await page.locator("#game-canvas").click();

    // Attach errors to test context for assertions
    (page as any).__errors = errors;
  });

  test("loads without runtime errors", async ({ page }) => {
    // Wait for HUD to appear (indicates PlayState entered)
    await expect(page.locator("[data-jk-score]")).toBeVisible({ timeout: 15_000 });

    // No error overlay
    await expect(page.locator(".jk_error")).toBeHidden();

    // No JS errors
    expect((page as any).__errors).toEqual([]);
  });

  test("can take a screenshot", async ({ page }) => {
    await expect(page.locator("[data-jk-score]")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/screenshot.png", fullPage: true });
  });
});
```

Phase 1 does **not** wait for the Results screen (that would take 60 seconds). Phase 2 with `?e2e=1&durationSec=2` enables fast full-loop tests.

---

## Phase 2: Add deterministic “E2E mode” to make tests stable

Playwright alone can drive inputs, but reliable assertions need determinism and readiness signals.

### E2E mode entrypoint (planned)

Use query params:

- `/?e2e=1`
- `/?e2e=1&seed=123`
- `/?e2e=1&durationSec=2`

### What E2E mode provides (planned)

- **Ready signal**: a deterministic “assets + initial spawns finished” point so tests can `await` it.
  - Example: `document.documentElement.dataset.jkReady = "1"`
  - Or `window.__jk.readyPromise`
- **Seeded RNG** for all randomized spawns (crystals, etc.)
- **Short duration** to reach Results quickly
- Optional: expose a tiny debug/test API (read-only) for assertions:
  - current state key
  - model (score/time)
  - player position

This is intentionally opt-in via `?e2e=1` so normal gameplay stays unchanged.

---

## Phase 3: Real gameplay assertions

Once E2E mode exists, we can add higher-value tests:

- **Tap-to-move**: tap known point → assert player position changes in expected direction.
- **Pickup collection**: spawn a pickup near player → collect → assert score increments + pickup removed.
- **Results loop**: duration short → results visible → click “Play Again” → back to play.

---

## WebGL + headless considerations

Babylon/WebGL in headless can be sensitive to GPU/CI environment.

Planned mitigations:

- Start with **Chromium** only.
- Use Playwright's newer headless mode (`--headless=new`) which has better WebGL support.
- In CI, prefer Playwright's standard browsers and run on a Linux runner with working GPU emulation.
- If needed, set Chromium launch args in `playwright.config.ts`:
  ```typescript
  use: {
    launchOptions: {
      args: [
        "--use-gl=swiftshader",      // Software WebGL (slower but reliable)
        "--disable-dev-shm-usage",   // Avoid /dev/shm issues in Docker
      ],
    },
  },
  ```
- If swiftshader still fails, try `--disable-gpu` as last resort (may break WebGL entirely).

We should validate this empirically once implemented (don't pre-optimize—start without extra args and add only if CI fails).

---

## LLM agent usage

The setup should enable an autonomous LLM agent to:

1. **Run tests and get pass/fail**: `npm run e2e` exits 0 (pass) or 1 (fail).
2. **Parse structured results**: JSON reporter writes to `test-results/results.json`.
3. **Take screenshots on demand**: call `page.screenshot()` in any test, or use `--screenshot on` to capture every test.
4. **Read console logs**: captured in test and included in trace files.
5. **Debug failures**: open `playwright-report/index.html` or read trace files.

### Recommended agent workflow

```
1. Make code changes
2. npm run e2e
3. If exit code != 0:
   - Read test-results/results.json for failure details
   - Inspect test-results/screenshot.png or trace files
   - Fix and retry
4. If exit code == 0: changes are safe to commit
```

---

## CI plan (later)

Add `.github/workflows/e2e.yml` to run:

- `npm ci` (with `actions/cache` for `node_modules`)
- `npx playwright install --with-deps` (with cache for `~/.cache/ms-playwright`)
- `npm run build`
- `npm run e2e:fast` (build already done)
- Upload artifacts on failure:
  - `playwright-report/`
  - `test-results/` (traces, screenshots, JSON results)

---

## What “done” looks like for Phase 1

- `npm run e2e` passes locally with:
  - zero runtime errors
  - a screenshot artifact on failure
  - a Playwright HTML report available for debugging

---

## Open questions (answer before implementation)

- ~~**Port choice**~~: **Answered** — use `4174` (dedicated, avoids collision with default `4173`).
- **State flow for tests**: keep default `boot → play` for E2E, or switch to `boot → menu` so UI flows are testable earlier?
  - Recommendation: keep `boot → play` for Phase 1 (simpler); add `?startState=menu` in Phase 2 if needed.
- **Artifact size**: do we want video enabled (bigger), or just trace + screenshot (smaller)?
  - Recommendation: start with trace + screenshot only; add video later if debugging flaky tests.
- **Audio in E2E mode**: should `?e2e=1` fully stub audio, or just auto-unlock it?
  - Recommendation: auto-unlock + mute (set volume to 0) to avoid timing issues while keeping code paths exercised.

