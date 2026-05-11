#!/usr/bin/env node
/**
 * extract-pdf-assets.mjs  —  STUB
 *
 * Goal: for every piece in data/kato_unitrack_catalog.json whose
 *       image.kind === "missing", pull a cropped product photo and the
 *       verified rail-vs-footprint dimensions out of
 *       data/source/us_unitrack_1-40_20251028.pdf, and write:
 *
 *         data/images/<code>.png   (the crop)
 *         + an update to the catalog with image.kind = "pdf_photo",
 *           image.path = "images/<code>.png", dimensions.footprint_extent_mm
 *           promoted from the PDF measurement, and
 *           dimensions.footprint_verified_from_pdf = true.
 *
 * Why this is a stub and not an implementation:
 *
 *   - The KATO PDF intersperses photos, dimension annotations
 *     (0 → 66 → 95 style), price lines, and footnotes. Reliably
 *     associating "the cropped photo" with "the right Item #" is a
 *     real OCR + layout-analysis problem, not a one-liner.
 *   - A naïve regex/heuristic extractor would silently mismatch photos
 *     to codes — *exactly* the kind of "demo visual falsa" the project
 *     explicitly rejects.
 *
 * Recommended implementation path when somebody picks this up:
 *
 *   1. Use pdf.js (or `mutool draw -F png`) to rasterize each page to
 *      a high-DPI image.
 *   2. Use pdf.js's TextContent API to recover the bounding box of every
 *      Item # token (e.g. "20-063") on the page.
 *   3. For each Item # token, walk the page layout to find:
 *        - the photo region above the dimension markers,
 *        - the dimension markers themselves ("0", "66", "95"),
 *        - the price/quantity line ("[1pc] $13.00").
 *      KATO's layout is consistent within a category — group by sheet
 *      and tune the offset model per category.
 *   4. Crop the photo region, save as data/images/<code>.png.
 *   5. Parse the dimension marker triple → footprint_extent_mm.
 *   6. Re-emit the catalog JSON.
 *
 * Until that lands, the catalog ships with image.kind = "missing" for
 * 174 pieces. The frontend falls back to a placeholder + the piece's
 * name; nothing in the geometry pipeline depends on these images, so
 * the platform remains fully functional without them.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG = resolve(__dirname, "..", "data", "kato_unitrack_catalog.json");

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const missing = catalog.pieces.filter((p) => p.image?.kind === "missing");

console.log("=".repeat(64));
console.log("extract-pdf-assets.mjs — STUB");
console.log("=".repeat(64));
console.log(`Pieces awaiting PDF image extraction: ${missing.length}`);
console.log(`Pieces with procedural SVG (no PDF needed): ${catalog.pieces.length - missing.length}`);
console.log("");
console.log("This script does NOT actually extract anything yet. See the");
console.log("file header for the recommended implementation path.");
console.log("");
console.log("Sample of pieces that need a PDF crop:");
for (const p of missing.slice(0, 8)) {
  console.log(`  ${p.code.padEnd(12)} p.${String(p.pdf_page ?? "?").padStart(3)}  ${p.name}`);
}
if (missing.length > 8) console.log(`  ... and ${missing.length - 8} more.`);
process.exit(0);
