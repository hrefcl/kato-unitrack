import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "@kato-unitrack/catalog";
import { emptyInventory, addSet } from "@kato-unitrack/inventory";
import { generateLayouts } from "../src/index.js";
import { validate, DEFAULT_TOLERANCES } from "@kato-unitrack/geometry-engine";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = parseCatalog(
  readFileSync(resolve(here, "..", "..", "..", "data", "kato_unitrack_catalog.json"), "utf8"),
);

describe("Onboarding flow integration", () => {
  it("successfully generates a layout from the M1 starter set (20-852)", () => {
    // 1. Start with empty inventory
    let inv = emptyInventory("N");
    
    // 2. Add the M1 set (20-852)
    const result = addSet(inv, catalog, "20-852", 1);
    expect(result.warning).toBeUndefined();
    inv = result.inventory;

    // Verify inventory content
    // 4×S248, 1×S124, 1×S124RE (20-027-1), 1×S62, 1×S62F (20-041), 8×R315-45
    expect(inv.entries["20-000"]?.owned).toBe(4);
    expect(inv.entries["20-120"]?.owned).toBe(8);

    // 3. Generate layout
    const layouts = generateLayouts({
      catalog,
      inventory: inv,
      board_mm: { width: 1500, height: 800 },
      scale: "N",
    });

    // 4. Validate results
    expect(layouts.length).toBeGreaterThan(0);
    const first = layouts[0]!;

    // Check that it's a valid layout according to geometry-engine
    const geomMap = catalog.geometryMap();
    const validation = validate(
      { placements: first.layout.placements, attachments: first.layout.attachments },
      geomMap,
      DEFAULT_TOLERANCES
    );

    expect(validation.ok).toBe(true);
    expect(first.layout.placements.length).toBeGreaterThan(0);
    expect(validation.errors).toEqual([]);
    expect(validation.openEnds.length).toBe(0); // closed loop

    // 5. Verify the generator actually consumed the M1 curves + straights
    //    (a future regression in piece selection would change this).
    expect(first.layout.inventory_usage["20-120"]).toBe(8); // 8 × R315-45
    const straightsUsed = first.layout.inventory_usage["20-000"] ?? 0;
    expect(straightsUsed).toBeGreaterThan(0);
    expect(straightsUsed % 2).toBe(0); // symmetric across sides
  });
});
