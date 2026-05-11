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
  it("emits a proposal the engine can validate", async () => {
    const provider = new LocalDemoProvider();
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
});
