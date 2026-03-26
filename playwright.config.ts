import { defineConfig } from "@playwright/test";

// NOTE: This repo is touch-first. Default viewport targets a modern phone size.
// We run against `vite preview` (production-like), not `vite dev`.
export default defineConfig({
  testDir: "e2e",
  // E2E runs a real browser + shared preview server; keep it deterministic by default.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results",
  webServer: {
    command: "npm run preview -- --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

