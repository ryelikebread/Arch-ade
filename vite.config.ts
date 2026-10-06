import { defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and no screen clearing.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/target/**"] } },
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 2000 },
  test: { environment: "jsdom" },
});
