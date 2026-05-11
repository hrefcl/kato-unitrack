/**
 * Minimal Express server.
 *
 *   GET  /api/catalog            → the committed catalog JSON
 *   GET  /api/source/pdf         → the source PDF (read-only)
 *   GET  /api/layouts            → stub: empty list (cloud sync is post-MVP)
 *   POST /api/layouts            → stub: 501 Not Implemented
 *
 * The frontend can run without this server (catalog can also be served
 * as a static asset via Vite). This backend exists so a future cloud
 * sync feature can land in one place instead of being scattered.
 */

import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const CATALOG_PATH = resolve(ROOT, "data", "kato_unitrack_catalog.json");
const PDF_PATH = resolve(ROOT, "data", "source", "us_unitrack_1-40_20251028.pdf");

const PORT = Number(process.env.PORT ?? 5174);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

let cachedCatalog: string | null = null;
function loadCatalog(): string {
  if (!cachedCatalog) cachedCatalog = readFileSync(CATALOG_PATH, "utf8");
  return cachedCatalog;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "0.1.0", node: process.version });
});

app.get("/api/catalog", (_req, res) => {
  res.type("application/json").send(loadCatalog());
});

app.get("/api/source/pdf", (_req, res) => {
  res.sendFile(PDF_PATH);
});

app.get("/api/layouts", (_req, res) => {
  res.json({ layouts: [] });
});

app.post("/api/layouts", (_req, res) => {
  res.status(501).json({
    error: "not_implemented",
    message: "Layout cloud sync lands in Fase 5. MVP uses localStorage.",
  });
});

app.listen(PORT, () => {
  console.log(`[kato-unitrack backend] listening on http://localhost:${PORT}`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/catalog`);
  console.log(`  GET  /api/source/pdf`);
  console.log(`  GET  /api/layouts   (empty stub)`);
});
