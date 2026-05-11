/**
 * Inventory operations.
 *
 * Inventory is a plain value object. Every operation returns a new
 * Inventory; callers (stores, undo stacks) keep the previous version
 * if they want to roll back. No mutation.
 */

import type { CatalogIndex } from "@kato-unitrack/catalog";
import type { Inventory, InventoryEntry } from "./types.js";
import { knownSet } from "./sets.js";

export * from "./types.js";
export * from "./sets.js";

export function emptyInventory(scale: string): Inventory {
  return { scale, entries: {} };
}

export function available(inv: Inventory, code: string): number {
  const e = inv.entries[code];
  if (!e) return 0;
  return Math.max(0, e.owned - e.used);
}

export function addPiece(inv: Inventory, code: string, qty: number, from?: string): Inventory {
  if (qty <= 0) return inv;
  const prev = inv.entries[code];
  const sets = new Set(prev?.addedFromSets ?? []);
  if (from) sets.add(from);
  const next: InventoryEntry =
    sets.size > 0
      ? {
          code,
          owned: (prev?.owned ?? 0) + qty,
          used: prev?.used ?? 0,
          addedFromSets: [...sets],
        }
      : {
          code,
          owned: (prev?.owned ?? 0) + qty,
          used: prev?.used ?? 0,
        };
  return { ...inv, entries: { ...inv.entries, [code]: next } };
}

export function removePiece(inv: Inventory, code: string, qty: number): Inventory {
  if (qty <= 0) return inv;
  const prev = inv.entries[code];
  if (!prev) return inv;
  const newOwned = Math.max(0, prev.owned - qty);
  const newUsed = Math.min(prev.used, newOwned);
  const next: InventoryEntry = { ...prev, owned: newOwned, used: newUsed };
  return { ...inv, entries: { ...inv.entries, [code]: next } };
}

export function markUsed(inv: Inventory, code: string, qty: number): Inventory {
  if (qty <= 0) return inv;
  const prev = inv.entries[code] ?? { code, owned: 0, used: 0 };
  const newUsed = Math.min(prev.used + qty, prev.owned);
  return { ...inv, entries: { ...inv.entries, [code]: { ...prev, used: newUsed } } };
}

export function freeUsed(inv: Inventory, code: string, qty: number): Inventory {
  if (qty <= 0) return inv;
  const prev = inv.entries[code];
  if (!prev) return inv;
  return {
    ...inv,
    entries: { ...inv.entries, [code]: { ...prev, used: Math.max(0, prev.used - qty) } },
  };
}

/**
 * Add a set to the inventory. If the set has a verified contents
 * decomposition, the constituent pieces are added; otherwise the set
 * code itself is recorded as an opaque entry plus a warning.
 */
export interface AddSetResult {
  readonly inventory: Inventory;
  readonly expanded: boolean;
  readonly warning?: string;
}

export function addSet(
  inv: Inventory,
  catalog: CatalogIndex,
  setCode: string,
  qty: number = 1,
): AddSetResult {
  const setPiece = catalog.byCode.get(setCode);
  if (!setPiece) {
    return {
      inventory: inv,
      expanded: false,
      warning: `unknown set code ${setCode}`,
    };
  }
  const recipe = knownSet(setCode);
  if (!recipe) {
    return {
      inventory: addPiece(inv, setCode, qty),
      expanded: false,
      warning: `set ${setCode} contents not decomposed — recorded as opaque entry. See packages/inventory/src/sets.ts.`,
    };
  }
  let out = inv;
  for (const item of recipe.items) {
    out = addPiece(out, item.code, item.qty * qty, setCode);
  }
  return { inventory: out, expanded: true };
}

export function totalOwned(inv: Inventory): number {
  let n = 0;
  for (const e of Object.values(inv.entries)) n += e.owned;
  return n;
}
