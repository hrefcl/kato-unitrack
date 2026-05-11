import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "@kato-unitrack/catalog";
import { emptyInventory, addPiece } from "@kato-unitrack/inventory";
import { generateLayouts, OvalSimpleStrategy, OvalDoubleStrategy } from "../src/index.js";
import { validate } from "@kato-unitrack/geometry-engine";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = parseCatalog(
  readFileSync(resolve(here, "..", "..", "..", "data", "kato_unitrack_catalog.json"), "utf8"),
);

describe("oval-simple", () => {
  it("produces a validatable oval from R315-45 + S248", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-120", 8); // R315-45 ×8
    inv = addPiece(inv, "20-000", 4); // S248 ×4

    const results = generateLayouts(
      {
        catalog,
        inventory: inv,
        board_mm: { width: 1400, height: 700 },
        scale: "N",
      },
      [new OvalSimpleStrategy()],
    );
    expect(results.length).toBeGreaterThan(0);
    const r = results[0]!;
    expect(r.layout.inventory_usage["20-120"]).toBe(8);
    // The strategy maximizes use of available straights: with 4 in stock
    // it uses 2 per side × 2 sides = 4.
    expect(r.layout.inventory_usage["20-000"]).toBe(4);
    // The closure is part of validate() being green.
    const geom = catalog.geometryMap();
    const re = validate(
      { placements: r.layout.placements, attachments: r.layout.attachments },
      geom,
    );
    expect(re.ok).toBe(true);
  });

  it("returns no layouts when inventory is too small", () => {
    const inv = emptyInventory("N");
    const results = generateLayouts(
      {
        catalog,
        inventory: inv,
        board_mm: { width: 1400, height: 700 },
        scale: "N",
      },
      [new OvalSimpleStrategy()],
    );
    expect(results.length).toBe(0);
  });
});

describe("oval-double", () => {
  it("produces a double oval when two adjacent radii are stocked", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-120", 8); // R315-45 ×8 (outer)
    inv = addPiece(inv, "20-110", 8); // R282-45 ×8 (inner, 33mm closer)
    inv = addPiece(inv, "20-000", 8); // S248 ×8 (4 per oval)

    const results = generateLayouts(
      {
        catalog,
        inventory: inv,
        board_mm: { width: 1400, height: 800 },
        scale: "N",
      },
      [new OvalDoubleStrategy()],
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.layout.inventory_usage["20-120"]).toBe(8);
    expect(results[0]!.layout.inventory_usage["20-110"]).toBe(8);
  });
});
