import { expect, test } from "@playwright/test";

type PlayerPos = { x: number; y: number; z: number } | null;

test.describe("movement", () => {
  test("tap-to-move moves the player", async ({ page }, testInfo) => {
    const errors: string[] = [];

    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto("/?e2e=1&seed=1", { waitUntil: "domcontentloaded" });
    await page.locator("#game-canvas").click({ timeout: 15_000 });
    await expect(page.locator("[data-jk-score]")).toBeVisible({ timeout: 15_000 });

    // Ensure initial async load completed.
    await page.waitForFunction(() => document.documentElement.dataset.jkReady === "1", null, {
      timeout: 60_000,
    });

    // Ensure test API is available.
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).__jk !== "undefined"))
      .toBe(true);

    const start = await page.evaluate(() => (window as any).__jk.getPlayerPos() as PlayerPos);
    expect(start).not.toBeNull();

    // Tap somewhere away from center to set a move target via the input system.
    const box = await page.locator("#game-canvas").boundingBox();
    if (!box) throw new Error("Missing canvas bounding box");
    const tapX = box.x + box.width * 0.8;
    const tapY = box.y + box.height * 0.55;
    await page.mouse.click(tapX, tapY);

    // Wait until the player moved a bit (distance from start increases).
    await expect
      .poll(async () => {
        const p = (await page.evaluate(() => (window as any).__jk.getPlayerPos() as PlayerPos))!;
        if (!p || !start) return 0;
        const dx = p.x - start.x;
        const dz = p.z - start.z;
        return Math.sqrt(dx * dx + dz * dz);
      })
      .toBeGreaterThan(0.25);

    await page.screenshot({ path: testInfo.outputPath("moved.png"), fullPage: true });

    await expect(page.locator(".jk_error")).toBeHidden();
    expect(errors).toEqual([]);
  });
});
