#!/usr/bin/env node
/**
 * Harness para ejercitar el OpenAIProvider con prompts reales.
 *
 *   OPENAI_API_KEY=sk-... node scripts/test-openai-prompts.mjs
 *
 * Esto NO se importa en producción ni se commitea con la key. Sirve
 * solo para iterar el prompt hasta que las propuestas cierren bien.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Carga vía import directo del source TS — necesita tsx.
const { parseCatalog } = await import(resolve(ROOT, "packages/catalog/src/index.ts"));
const { OpenAIProvider, materializeProposal } = await import(
  resolve(ROOT, "packages/ai-providers/src/index.ts")
);
const { validate } = await import(resolve(ROOT, "packages/geometry-engine/src/index.ts"));

const catalog = parseCatalog(
  readFileSync(resolve(ROOT, "data/kato_unitrack_catalog.json"), "utf8"),
);
const seed = JSON.parse(
  readFileSync(resolve(ROOT, "data/inventory_seed.json"), "utf8"),
);
const inventory = Object.fromEntries(seed.pieces.map((p) => [p.code, p.qty]));

const provider = new OpenAIProvider(process.env.OAI_MODEL || "gpt-4o-mini");
provider.setApiKey(process.env.OPENAI_API_KEY);
provider.setCatalog(catalog);

const PROMPTS = [
  "óvalo simple cerrado usando R315-45 y rectas S248",
  "óvalo doble concéntrico (vía exterior + interior) con la separación KATO de 33mm",
  "patio de maniobras: una vía recta principal + 2 desvíos que generen sidings paralelos",
  "passing siding: óvalo doble con un crossover de 2 turnouts entre las dos vías",
];

const results = [];

for (const userIntent of PROMPTS) {
  process.stdout.write(`\n=== PROMPT: ${userIntent}\n`);
  let proposals = [];
  try {
    proposals = await provider.generateLayoutSuggestion({
      scale: "N",
      boardMm: { width: 2000, height: 1200 },
      availableInventory: inventory,
      userIntent,
      maxProposals: 1,
    });
  } catch (e) {
    console.log("  ERROR provider:", e.message);
    results.push({ userIntent, ok: false, reason: e.message });
    continue;
  }
  if (proposals.length === 0) {
    console.log("  (sin propuestas)");
    results.push({ userIntent, ok: false, reason: "empty" });
    continue;
  }
  for (const prop of proposals) {
    console.log("  PROPOSAL name:", prop.name);
    console.log("  moves:", prop.moves.length);
    const mat = materializeProposal(prop, catalog);
    if (!mat.ok) {
      console.log("  ❌ MATERIALIZE FAIL:", mat.reason);
      results.push({ userIntent, ok: false, reason: mat.reason, moves: prop.moves.length });
      continue;
    }
    const v = validate(mat.layout, catalog.geometryMap());
    console.log("  placements:", mat.layout.placements.length);
    console.log("  attachments:", mat.layout.attachments.length);
    console.log("  open ends:", v.openEnds.length);
    console.log("  geom errors:", v.errors.length);
    console.log("  geom OK:", v.ok ? "✓" : "✗");
    if (v.errors.length > 0) console.log("  errors:", v.errors.slice(0, 3));
    results.push({
      userIntent,
      ok: v.ok,
      moves: prop.moves.length,
      placements: mat.layout.placements.length,
      openEnds: v.openEnds.length,
      errors: v.errors.length,
      rationale: prop.rationale?.slice(0, 200),
    });
  }
}

console.log("\n=== RESUMEN ===");
console.table(results);
