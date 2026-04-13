import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-watch/event-schema": fileURLToPath(new URL("../event-schema/src/index.ts", import.meta.url))
    }
  }
});
