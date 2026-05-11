#!/usr/bin/env node
/**
 * build-catalog.mjs
 *
 * Reads the KATO UNITRACK reference spreadsheet (the single source of
 * truth from Fase 1) and produces a normalized JSON catalog that the
 * rest of the platform consumes.
 *
 * Source : kato_unitrack_catalogo_completo_v2.xlsx
 * Output : data/kato_unitrack_catalog.json
 *
 * The JSON shape is documented in docs/DATA_MODEL.md.
 */

import XLSX from "xlsx";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Two AI-extracted spreadsheets exist; both are derived from the PDF.
//
//   - SPINE_XLSX (v2): single-sheet unified schema, 330 codes,
//                       has Abbreviation + PDF Page columns.
//   - ENRICH_XLSX (v1, per-category sheets): adds tie_type, superelevated,
//                       double-track spacing, turnout control, pier height,
//                       bridge color, set dimension, set contents.
//
// We use the spine for every piece and merge enrichment fields on
// exact Item # match. v1's 74 unique codes are AI-invented suffixes
// like "-DT" / "(PC)" that collide with the spine's real PC item
// numbers — we drop them on purpose.
const SPINE_XLSX = resolve(ROOT, "data", "source", "kato_unitrack_catalogo_completo_v2.xlsx");
const ENRICH_XLSX = resolve(ROOT, "data", "source", "KATO_UNITRACK_Catalogo_Completo_v1.xlsx");
const OUT_JSON = resolve(ROOT, "data", "kato_unitrack_catalog.json");

// ---------------------------------------------------------------------------
// Category → piece type mapping
//
// `type` is what the geometry engine reasons about, `category` is what the
// catalog UI groups by. We keep both because they answer different questions.
// ---------------------------------------------------------------------------
const TYPE_BY_CATEGORY = {
  "Straight Track": "straight",
  "Curved Track": "curve",
  "Turnout": "turnout",
  "Double Track": "double_track",
  "Slab Track": "slab_track",
  "Viaduct Straight": "viaduct_straight",
  "Viaduct Double": "viaduct_double",
  "Bridge": "bridge",
  "Crossing": "crossing",
  "Crossover": "crossover",
  "Adjustment Track": "adjustment",
  "Specialty Track": "specialty",
  "Bumper Track": "bumper",
  "Feeder Track": "feeder",
  "Flexible Track": "flexible",
  "Joiner": "joiner",
  "Pier": "pier",
  "Catenary Pole": "catenary",
  "Cable": "cable",
  "Power": "accessory",
  "Power Pack": "accessory",
  "Power Supply": "accessory",
  "Controller": "accessory",
  "Sound Box": "accessory",
  "Sound Card": "accessory",
  "Signal": "accessory",
  "Signal Switch": "accessory",
  "Switch": "accessory",
  "Turntable": "turntable",
  "Roadbed": "roadbed",
  "Hardware": "hardware",
  "Building": "accessory",
  "Rerailer": "specialty",
  "Specialty": "specialty",
  "Bridge Set": "set",
  "Starter Set": "set",
  "Master Set": "set",
  "V-Series Set": "set",
  "Compact Set": "set",
  "UNITRAM": "unitram",
};

const CATEGORIES_WITH_NATIVE_GEOMETRY = new Set([
  "Straight Track",
  "Curved Track",
  "Double Track",
  "Slab Track",
  "Viaduct Straight",
  "Viaduct Double",
  "Adjustment Track",
  "Bumper Track",
  "Feeder Track",
  "Specialty Track",
  "Bridge",
  "Crossing",
  "Crossover",
  "Turnout",
  "Flexible Track",
]);

// ---------------------------------------------------------------------------
// Per-piece geometry derivation
//
// For every track piece with enough metadata we derive:
//   - connections[]   : ordered list of physical connection points
//                       (local mm coordinates, direction in degrees where
//                        0° = +X, CCW positive — see GEOMETRY.md)
//   - footprint       : bounding box hint for the canvas
//
// Pieces without enough metadata are emitted with `connections: []` and
// `snappable: false` so the geometry engine never tries to align them.
// ---------------------------------------------------------------------------

function deriveStraight(row) {
  const L = row.length_mm;
  if (!Number.isFinite(L) || L <= 0) return null;
  return {
    connections: [
      { id: "A", position_mm: [0, 0], direction_deg: 180 },
      { id: "B", position_mm: [L, 0], direction_deg: 0 },
    ],
    footprint_mm: { width: L, height: 25 },
    snappable: true,
  };
}

function deriveCurve(row) {
  const R = row.radius_mm;
  const A = row.angle_degrees;
  if (!Number.isFinite(R) || !Number.isFinite(A) || R <= 0 || A <= 0) return null;
  const rad = (A * Math.PI) / 180;
  // Local frame: track enters at origin pointing +X, curves left (+Y, CCW).
  // KATO curves are symmetric so the canvas mirrors them at placement time
  // to render right-handed curves.
  const ex = R * Math.sin(rad);
  const ey = R * (1 - Math.cos(rad));
  return {
    connections: [
      { id: "A", position_mm: [0, 0], direction_deg: 180 },
      { id: "B", position_mm: [+ex, +ey], direction_deg: +A },
    ],
    arc: { radius_mm: R, sweep_deg: A, center_mm: [0, R] },
    footprint_mm: { width: ex + 25, height: ey + 25 },
    snappable: true,
  };
}

// KATO turnout standard geometry (US 2023 catalog).
// straight branch goes A→B in +X for `length_mm`. Divergent branch C is
// computed as a curve of radius R sweeping `diverge_deg` from the entry.
const TURNOUT_FIXTURES = {
  // N scale -------------------------------------------------------------
  "20-202": { length_mm: 248, radius_mm: 718, diverge_deg: 15, hand: "L" }, // #6 L
  "20-203": { length_mm: 248, radius_mm: 718, diverge_deg: 15, hand: "R" }, // #6 R
  "20-220": { length_mm: 124, radius_mm: 481, diverge_deg: 15, hand: "L" }, // #4 L
  "20-221": { length_mm: 124, radius_mm: 481, diverge_deg: 15, hand: "R" }, // #4 R
  "20-222": { length_mm: 124, radius_mm: 481, diverge_deg: 15, hand: "Wye", wye: true },
  "20-230": { length_mm: 248, radius_mm: 481, diverge_deg: 15, hand: "L", double_track: true },
  "20-231": { length_mm: 248, radius_mm: 481, diverge_deg: 15, hand: "R", double_track: true },
  "20-240": { length_mm: 0, radius_mm: 150, diverge_deg: 45, hand: "L", compact: true },
  "20-241": { length_mm: 0, radius_mm: 150, diverge_deg: 45, hand: "R", compact: true },
  // HO scale ------------------------------------------------------------
  "2-862": { length_mm: 492, radius_mm: 867, diverge_deg: 15, hand: "L" },
  "2-863": { length_mm: 492, radius_mm: 867, diverge_deg: 15, hand: "R" },
  "2-852": { length_mm: 246, radius_mm: 550, diverge_deg: 22.5, hand: "L" },
  "2-853": { length_mm: 246, radius_mm: 550, diverge_deg: 22.5, hand: "R" },
  "2-840": { length_mm: 246, radius_mm: 490, diverge_deg: 22.5, hand: "L" },
  "2-841": { length_mm: 246, radius_mm: 490, diverge_deg: 22.5, hand: "R" },
  "2-860": { length_mm: 492, radius_mm: 867, diverge_deg: 15, hand: "L" },
  "2-861": { length_mm: 492, radius_mm: 867, diverge_deg: 15, hand: "R" },
};

function deriveTurnout(row) {
  const f = TURNOUT_FIXTURES[row.code];
  if (!f) {
    // Unknown turnout (e.g. machine accessories under category=Turnout).
    return null;
  }
  const rad = (f.diverge_deg * Math.PI) / 180;
  const sign = f.hand === "R" ? -1 : 1;
  const ex = f.radius_mm * Math.sin(rad);
  const ey = sign * f.radius_mm * (1 - Math.cos(rad));
  const dirC = sign * f.diverge_deg;

  const connections = [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
  ];
  if (f.length_mm > 0) {
    connections.push({ id: "B", position_mm: [f.length_mm, 0], direction_deg: 0 });
  }
  connections.push({
    id: "C",
    position_mm: [ex, ey],
    direction_deg: dirC,
  });

  return {
    connections,
    turnout: {
      radius_mm: f.radius_mm,
      diverge_deg: f.diverge_deg,
      hand: f.hand,
      straight_length_mm: f.length_mm,
      double_track: !!f.double_track,
      wye: !!f.wye,
      compact: !!f.compact,
    },
    footprint_mm: {
      width: Math.max(f.length_mm, ex) + 25,
      height: Math.abs(ey) + 25,
    },
    snappable: true,
  };
}

function deriveDoubleTrack(row) {
  // Double-track pieces carry two parallel rails. We expose two pairs of
  // connection points so the layout generator can chain them as a pair.
  if (Number.isFinite(row.length_mm) && row.length_mm > 0) {
    const L = row.length_mm;
    return {
      connections: [
        { id: "A1", position_mm: [0, 0], direction_deg: 180, track: 1 },
        { id: "B1", position_mm: [L, 0], direction_deg: 0, track: 1 },
        { id: "A2", position_mm: [0, 33], direction_deg: 180, track: 2 },
        { id: "B2", position_mm: [L, 33], direction_deg: 0, track: 2 },
      ],
      double_track: { spacing_mm: 33 },
      footprint_mm: { width: L, height: 58 },
      snappable: true,
    };
  }
  if (Number.isFinite(row.radius_mm) && Number.isFinite(row.angle_degrees)) {
    // Concentric curves — we leave the precise inner/outer split to the
    // geometry engine because the spreadsheet only carries one radius
    // value. We still emit the conceptual connectors.
    const R = row.radius_mm;
    const A = row.angle_degrees;
    const rad = (A * Math.PI) / 180;
    const ex = R * Math.sin(rad);
    const ey = R * (1 - Math.cos(rad));
    return {
      connections: [
        { id: "A1", position_mm: [0, 0], direction_deg: 180, track: 1 },
        { id: "B1", position_mm: [ex, ey], direction_deg: A, track: 1 },
        { id: "A2", position_mm: [0, 33], direction_deg: 180, track: 2 },
        { id: "B2", position_mm: [ex, ey + 33], direction_deg: A, track: 2 },
      ],
      arc: { radius_mm: R, sweep_deg: A, center_mm: [0, R] },
      double_track: { spacing_mm: 33 },
      footprint_mm: { width: ex + 25, height: ey + 58 },
      snappable: true,
    };
  }
  return null;
}

function deriveGeometry(row) {
  if (!CATEGORIES_WITH_NATIVE_GEOMETRY.has(row.category)) return null;
  switch (row.category) {
    case "Straight Track":
    case "Slab Track":
    case "Viaduct Straight":
    case "Adjustment Track":
    case "Bumper Track":
    case "Feeder Track":
    case "Specialty Track":
    case "Bridge":
    case "Crossing":
    case "Crossover":
    case "Flexible Track":
      return deriveStraight(row);
    case "Curved Track":
      return deriveCurve(row);
    case "Turnout":
      return deriveTurnout(row);
    case "Double Track":
    case "Viaduct Double":
      return deriveDoubleTrack(row);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseQty(v) {
  if (v === null || v === undefined) return { quantity: null, raw: null };
  const raw = String(v).trim();
  if (!raw) return { quantity: null, raw: null };
  const m = raw.match(/^(\d+)/);
  return { quantity: m ? Number(m[1]) : null, raw };
}

// ---------------------------------------------------------------------------
// Image / visual provenance
//
// For every piece, we record:
//   image.kind    : "svg_procedural" | "pdf_photo" | "missing"
//   image.notes   : human-readable note about the visual representation
//
// "svg_procedural"  — the geometry engine can draw this piece from its
//                      connections/arc/turnout/double_track. The frontend
//                      calls renderPieceSvg() at runtime.
// "pdf_photo"       — set later by scripts/extract-pdf-assets.mjs when
//                      a real photo crop has been pulled from the PDF.
// "missing"         — accessory / loco / set / non-track that has no
//                      procedural drawing and no PDF crop yet.
// ---------------------------------------------------------------------------
function imageBlockFor(piece) {
  if (piece.snappable) {
    return {
      kind: "svg_procedural",
      notes: "Drawn at runtime from piece geometry by @kato-unitrack/geometry-engine.",
    };
  }
  return {
    kind: "missing",
    notes: "Needs a PDF crop. See scripts/extract-pdf-assets.mjs (Fase 2.5).",
    needs_pdf_extraction: true,
    source_page: piece.pdf_page ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rail span vs physical footprint
//
// The xlsx only carries one length value per piece, but for some pieces
// (notably bumpers, rerailers, certain bridges) the rail-connectable
// length and the physical footprint differ — e.g. 20-063 bumper has
// rail span = 66 mm but physical footprint = 95 mm.
//
// We make the distinction explicit in the schema. Until the PDF is
// reparsed for actual footprint measurements, footprint_extent_mm
// defaults to rail_span_mm and `footprint_verified_from_pdf` is false.
// ---------------------------------------------------------------------------
function dimensionsBlockFor(piece) {
  if (!Number.isFinite(piece.length_mm)) return null;
  return {
    rail_span_mm: piece.length_mm,
    footprint_extent_mm: piece.length_mm,
    footprint_verified_from_pdf: false,
  };
}

function normalizeRow(raw) {
  const code = String(raw["Item #"] ?? "").trim();
  const category = String(raw["Category"] ?? "").trim();
  const subcategory = raw["Subcategory"] ? String(raw["Subcategory"]).trim() : null;
  const name = String(raw["Product / Line"] ?? "").trim();
  const abbreviation = raw["Abbreviation"] ? String(raw["Abbreviation"]).trim() : null;
  const length_mm = asNumber(raw["Length (mm)"]);
  const length_in = asNumber(raw["Length (in)"]);
  const radius_mm = asNumber(raw["Radius (mm)"]);
  const angle_degrees = asNumber(raw["Angle (°)"]);
  const { quantity, raw: qty_raw } = parseQty(raw["Qty per Pack"]);
  const color = raw["Color / Variant"] ? String(raw["Color / Variant"]).trim() : null;
  const price_usd = asNumber(raw["Price USD"]);
  const description = raw["Functionality / Description"] ? String(raw["Functionality / Description"]).trim() : null;
  const pdf_page = asNumber(raw["PDF Page"]);
  const scale = String(raw["Scale"] ?? "").trim();

  const type = TYPE_BY_CATEGORY[category] ?? "other";

  const piece = {
    code,
    name,
    scale,
    category,
    subcategory,
    type,
    abbreviation,
    length_mm,
    length_in,
    radius_mm,
    angle_degrees,
    pack: { quantity, raw: qty_raw },
    color,
    price_usd,
    description,
    pdf_page,
  };

  const geom = deriveGeometry(piece);
  if (geom) {
    piece.connections = geom.connections;
    if (geom.arc) piece.arc = geom.arc;
    if (geom.turnout) piece.turnout = geom.turnout;
    if (geom.double_track) piece.double_track = geom.double_track;
    piece.footprint_mm = geom.footprint_mm;
    piece.snappable = geom.snappable;
  } else {
    piece.connections = [];
    piece.snappable = false;
  }

  const dims = dimensionsBlockFor(piece);
  if (dims) piece.dimensions = dims;
  piece.image = imageBlockFor(piece);

  return piece;
}

// ---------------------------------------------------------------------------
// Enrichment loader — reads the per-category xlsx and returns a map
// keyed by Item # with the extra fields the spine does not carry.
// ---------------------------------------------------------------------------
function parsePrice(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function loadEnrichment() {
  if (!existsSync(ENRICH_XLSX)) {
    console.warn(`[build-catalog] enrichment xlsx missing, continuing without it: ${ENRICH_XLSX}`);
    return new Map();
  }
  const wb = XLSX.readFile(ENRICH_XLSX);
  const map = new Map();

  for (const sn of wb.SheetNames) {
    if (sn === "Portada") continue;
    const ws = wb.Sheets[sn];
    // Find the header row by scanning for one with ≥3 non-empty cells.
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let hdrIdx = -1;
    for (let i = 0; i < aoa.length; i++) {
      const nonNull = aoa[i].filter((c) => c !== null && c !== "").length;
      if (nonNull >= 3) { hdrIdx = i; break; }
    }
    if (hdrIdx < 0) continue;
    const headers = aoa[hdrIdx];
    for (let i = hdrIdx + 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || !row.some((c) => c !== null && c !== "")) continue;
      const rec = {};
      for (let j = 0; j < headers.length; j++) rec[headers[j]] = row[j];
      const code = rec["Item #"] ? String(rec["Item #"]).trim() : null;
      if (!code) continue;
      // Skip AI-invented suffix variants — those don't exist in real KATO.
      if (/\s\(.*\)$|-DT$|-PC-DT$|\s\(cont\)/.test(code)) continue;

      const enrichment = {
        tie_type: rec["Tie Type"] || null,
        superelevated: rec["Super."] ? String(rec["Super."]).trim().toLowerCase() === "yes" : null,
        double_track_spacing_mm: rec["Intervalo"] ? Number(String(rec["Intervalo"]).replace(/[^0-9.]/g, "")) || null : null,
        turnout_control: rec["Control"] || null,
        pier_height_mm: typeof rec["Altura (mm)"] === "number" ? rec["Altura (mm)"] : null,
        color_variant: rec["Color"] && rec["Color"] !== "—" ? rec["Color"] : null,
        set_dimension: rec["Dimension"] && rec["Dimension"] !== "—" ? rec["Dimension"] : null,
        set_contents_summary: rec["Contenido Principal"] && rec["Contenido Principal"] !== "—" ? rec["Contenido Principal"] : null,
        price_usd_enrich: parsePrice(rec["Precio USD"]),
        funcionalidad_es: rec["Funcionalidad"] || null,
        source_sheet: sn,
      };
      // Drop all-null enrichments so we don't pollute pieces with empty objects.
      const hasAny = Object.entries(enrichment).some(([k, v]) => k !== "source_sheet" && v !== null);
      if (hasAny) map.set(code, enrichment);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(SPINE_XLSX)) {
    console.error(`[build-catalog] spine xlsx not found: ${SPINE_XLSX}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(SPINE_XLSX);
  const ws = wb.Sheets["Catálogo Completo"];
  if (!ws) {
    console.error("[build-catalog] sheet 'Catálogo Completo' not found");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const enrichment = loadEnrichment();
  const pieces = rows
    .filter((r) => r["Item #"] && r["Category"])
    .map(normalizeRow);

  // Merge enrichment by exact Item #.
  let enrichedCount = 0;
  for (const p of pieces) {
    const e = enrichment.get(p.code);
    if (!e) continue;
    enrichedCount++;
    if (e.tie_type) p.tie_type = e.tie_type;
    if (typeof e.superelevated === "boolean") p.superelevated = e.superelevated;
    if (e.turnout_control) p.turnout_control = e.turnout_control;
    if (typeof e.pier_height_mm === "number") p.pier_height_mm = e.pier_height_mm;
    if (e.color_variant && !p.color) p.color = e.color_variant;
    if (e.set_dimension) p.set_dimension = e.set_dimension;
    if (e.set_contents_summary) p.set_contents_summary = e.set_contents_summary;
    if (e.funcionalidad_es) p.description_es = e.funcionalidad_es;
    if (e.double_track_spacing_mm && p.double_track) {
      p.double_track.spacing_mm = e.double_track_spacing_mm;
    }
  }

  const stats = {
    total: pieces.length,
    snappable: pieces.filter((p) => p.snappable).length,
    by_category: pieces.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1;
      return acc;
    }, {}),
    by_scale: pieces.reduce((acc, p) => {
      acc[p.scale] = (acc[p.scale] ?? 0) + 1;
      return acc;
    }, {}),
  };

  // The PDF is the absolute source of truth for KATO part numbers and
  // geometric values. The accompanying xlsx is an AI-assisted extraction
  // of that PDF, so every piece here is flagged as not-yet-PDF-verified.
  // A piece can be promoted to verified=true by hand or via an automated
  // PDF re-parse (see scripts/verify-against-pdf.mjs — TODO).
  for (const p of pieces) {
    p.provenance = {
      source: "xlsx_ai_extracted",
      verified_against_pdf: false,
    };
  }

  const out = {
    schema_version: 1,
    source_of_truth: {
      authoritative: "us_unitrack_1-40_20251028.pdf",
      note: "KATO HO & N Track Catalog (US, 2023 MSRP). The PDF wins on every conflict.",
    },
    source: {
      spine: {
        file: "kato_unitrack_catalogo_completo_v2.xlsx",
        sheet: "Catálogo Completo",
        kind: "ai_extracted_from_pdf",
        codes: pieces.length,
      },
      enrichment: {
        file: "KATO_UNITRACK_Catalogo_Completo_v1.xlsx",
        sheets: "per-category",
        kind: "ai_extracted_from_pdf",
        merged_codes: enrichedCount,
        merge_strategy: "exact Item # only; AI-invented suffix variants dropped",
      },
      pdf: "us_unitrack_1-40_20251028 (KATO HO & N Track Catalog, 2023 MSRP)",
    },
    generated_at: new Date().toISOString(),
    stats,
    pieces,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(`[build-catalog] wrote ${pieces.length} pieces → ${OUT_JSON}`);
  console.log(`[build-catalog] snappable: ${stats.snappable}/${stats.total}`);
}

main();
