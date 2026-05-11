import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { CatalogIndex, parseCatalog } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "..", "..", "..", "data", "kato_unitrack_catalog.json");

describe("CatalogIndex", () => {
  it("loads and indexes the shipped catalog", () => {
    const raw = readFileSync(catalogPath, "utf8");
    const idx: CatalogIndex = parseCatalog(raw);
    expect(idx.all.length).toBeGreaterThan(300);
    expect(idx.byCode.get("20-000")).toBeDefined();
    expect(idx.byCategory.get("Straight Track")!.length).toBeGreaterThan(10);
    expect(idx.byScale.get("N")!.length).toBeGreaterThan(100);
    expect(idx.snappable().length).toBeGreaterThan(100);
  });

  it("searches by code, name and abbreviation", () => {
    const idx = parseCatalog(readFileSync(catalogPath, "utf8"));
    expect(idx.search("R315-45").some((p) => p.code === "20-120")).toBe(true);
    expect(idx.search("248mm").length).toBeGreaterThan(0);
  });

  it("projects to a geometry map the engine can consume", () => {
    const idx = parseCatalog(readFileSync(catalogPath, "utf8"));
    const m = idx.geometryMap();
    const straight = m.get("20-000")!;
    expect(straight.connections.length).toBe(2);
    expect(straight.connections[1]!.position_mm).toEqual([248, 0]);
  });
});
