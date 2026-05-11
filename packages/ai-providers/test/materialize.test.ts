import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "@kato-unitrack/catalog";
import { validate } from "@kato-unitrack/geometry-engine";
import { LocalDemoProvider, materializeProposal } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = parseCatalog(
  readFileSync(resolve(here, "..", "..", "..", "data", "kato_unitrack_catalog.json"), "utf8"),
);

describe("LocalDemoProvider + materialize", () => {
  it("emits a proposal the engine can validate end-to-end", async () => {
    const provider = new LocalDemoProvider();
    provider.setCatalog(catalog);
    const props = await provider.generateLayoutSuggestion({
      scale: "N",
      boardMm: { width: 1400, height: 700 },
      availableInventory: { "20-120": 8, "20-000": 4 },
    });
    expect(props.length).toBeGreaterThan(0);
    const mat = materializeProposal(props[0]!, catalog);
    expect(mat.ok).toBe(true);
    if (!mat.ok) return;
    const geom = catalog.geometryMap();
    const v = validate(mat.layout, geom);
    expect(v.errors).toEqual([]);
  });

  it("ranks proposals by total piece count DESC (maximises inventory use)", async () => {
    const provider = new LocalDemoProvider();
    provider.setCatalog(catalog);
    // Bigger inventory → richer candidates.
    const props = await provider.generateLayoutSuggestion({
      scale: "N",
      boardMm: { width: 2000, height: 1200 },
      availableInventory: {
        "20-110": 8,  // R282-45
        "20-120": 8,  // R315-45
        "20-000": 17, // S248
        "20-020": 2,  // S124
        "20-040": 4,  // S62
      },
      maxProposals: 4,
    });
    expect(props.length).toBeGreaterThan(1);
    const counts = props.map((p) => p.moves.length);
    // Non-increasing: each proposal uses <= the previous.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
    // Top proposal materializes cleanly through the engine.
    const mat = materializeProposal(props[0]!, catalog);
    expect(mat.ok).toBe(true);
    if (!mat.ok) return;
    const geom = catalog.geometryMap();
    const v = validate(mat.layout, geom);
    expect(v.errors).toEqual([]);
  });

  it("throws clearly when the catalog is not configured", async () => {
    const provider = new LocalDemoProvider();
    await expect(
      provider.generateLayoutSuggestion({
        scale: "N",
        boardMm: { width: 1500, height: 800 },
        availableInventory: { "20-120": 8 },
      }),
    ).rejects.toThrow(/catalog not configured/i);
  });
});
