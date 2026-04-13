import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@agent-watch/event-schema": resolve(currentDir, "../../packages/event-schema/src/index.ts")
    }
  }
});
