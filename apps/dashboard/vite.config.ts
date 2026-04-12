import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envDir: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  resolve: {
    alias: {
      "@agent-watch/event-schema": resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../packages/event-schema/src/index.ts"
      )
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true
  }
});
