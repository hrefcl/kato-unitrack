/**
 * Default inventory shipped with the project. Loaded on first run
 * (when localStorage has no persisted store yet). After that the
 * persisted store wins — the user's edits are not overwritten by a
 * second visit.
 *
 * The source spreadsheet and the abbreviation→catalog-code mapping
 * live in `data/inventory_seed.json`. This file is the typed view
 * the store imports.
 */

import seed from "../../../data/inventory_seed.json";

export interface SeedEntry {
  code: string;
  qty: number;
  from?: string;
  note?: string;
}

export interface SeedUnmapped {
  source_abbr: string;
  qty: number;
  reason: string;
}

export interface InventorySeed {
  schema_version: number;
  scale: "N" | "HO";
  owner: string;
  source: string;
  note: string;
  pieces: SeedEntry[];
  unmapped: SeedUnmapped[];
}

export const INVENTORY_SEED: InventorySeed = seed as InventorySeed;
