import { defineConfig } from "vite";

// Dev: absolute paths are fine.
// Build: use relative base so the output can be hosted under any subpath (e.g. /my-game/).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  optimizeDeps: {
    // Limit dependency scanning to the game entrypoint.
    // This avoids scanning standalone asset demo files under ASSETS/.
    entries: ["index.html", "debug_rooms/index.html"],
  },
}));



