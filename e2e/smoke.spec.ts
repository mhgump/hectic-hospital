import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("loads without runtime errors and can take a screenshot", async ({ page }, testInfo) => {
    const errors: string[] = [];

    page.on("pageerror", (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    page.on("console", (msg) => {
      // Treat console.error as a test failure signal (surface regressions early).
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    await page.goto("/?e2e=1", { waitUntil: "domcontentloaded" });

    // Ensure focus and satisfy "user gesture" requirements (AudioContext, etc).
    await page.locator("#game-canvas").click({ timeout: 15_000 });

    // HUD indicates PlayState entered.
    await expect(page.locator("[data-jk-score]")).toBeVisible({ timeout: 15_000 });

    // Wait for initial async world/model load to complete in E2E mode.
    // This ensures we catch shader/model/import errors that would otherwise happen after the test ends.
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.jkReady === "1" ||
        document.documentElement.dataset.jkReady === "error",
      null,
      { timeout: 60_000 }
    );
    await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.jkReady)).toBe("1");

    // In-game error overlay should stay hidden.
    await expect(page.locator(".jk_error")).toBeHidden();

    // Always capture a screenshot artifact for inspection / AI usage.
    await page.screenshot({ path: testInfo.outputPath("smoke.png"), fullPage: true });

    // Attach errors for report visibility.
    if (errors.length > 0) {
      await testInfo.attach("runtime-errors", {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
    }

    expect(errors).toEqual([]);
  });
});

