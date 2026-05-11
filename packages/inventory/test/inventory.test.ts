import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "@kato-unitrack/catalog";
import {
  emptyInventory,
  addPiece,
  removePiece,
  markUsed,
  freeUsed,
  available,
  addSet,
  totalOwned,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = parseCatalog(readFileSync(resolve(here, "..", "..", "..", "data", "kato_unitrack_catalog.json"), "utf8"));

describe("inventory", () => {
  it("adds and removes pieces", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-000", 4);
    expect(available(inv, "20-000")).toBe(4);
    inv = addPiece(inv, "20-000", 4);
    expect(available(inv, "20-000")).toBe(8);
    inv = removePiece(inv, "20-000", 3);
    expect(available(inv, "20-000")).toBe(5);
  });

  it("tracks used pieces against owned", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-110", 8);
    inv = markUsed(inv, "20-110", 8);
    expect(available(inv, "20-110")).toBe(0);
    inv = freeUsed(inv, "20-110", 4);
    expect(available(inv, "20-110")).toBe(4);
  });

  it("clamps used at owned", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-110", 2);
    inv = markUsed(inv, "20-110", 99);
    expect(available(inv, "20-110")).toBe(0);
    expect(inv.entries["20-110"]!.used).toBe(2);
  });

  it("expands a known set (M1 Basic Oval, 20-852)", () => {
    let inv = emptyInventory("N");
    const r = addSet(inv, catalog, "20-852");
    expect(r.expanded).toBe(true);
    inv = r.inventory;
    expect(available(inv, "20-120")).toBe(8); // R315-45 ×8
    expect(available(inv, "20-000")).toBe(4); // S248 ×4
    expect(available(inv, "20-020")).toBe(1); // S124 ×1
  });

  it("records an unknown set as opaque with a warning", () => {
    // Use a set that exists in the catalog but isn't yet in SET_CONTENTS.
    const r = addSet(emptyInventory("N"), catalog, "20-860"); // V1 set
    expect(r.expanded).toBe(false);
    expect(r.warning).toMatch(/not decomposed/);
    expect(available(r.inventory, "20-860")).toBe(1);
  });

  it("totalOwned sums all entries", () => {
    let inv = emptyInventory("N");
    inv = addPiece(inv, "20-000", 4);
    inv = addPiece(inv, "20-110", 8);
    expect(totalOwned(inv)).toBe(12);
  });
});
