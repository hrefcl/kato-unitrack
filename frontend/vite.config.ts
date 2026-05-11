import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const catalogJson = JSON.parse(
  readFileSync(resolve(__dirname, "..", "data", "kato_unitrack_catalog.json"), "utf8"),
);

export default defineConfig({
  plugins: [react()],
  define: {
    __KATO_CATALOG__: JSON.stringify(catalogJson),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5174",
    },
  },
});
