import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-watch/event-schema": fileURLToPath(new URL("../../packages/event-schema/src/index.ts", import.meta.url)),
      "@agent-watch/plugin-sdk": fileURLToPath(new URL("../../packages/plugin-sdk/src/index.ts", import.meta.url))
    }
  }
});
