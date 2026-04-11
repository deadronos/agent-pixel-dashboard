import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true
  }
});
