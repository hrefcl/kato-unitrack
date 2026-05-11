import type { Scale } from "@kato-unitrack/catalog";

export interface InventoryEntry {
  readonly code: string;
  readonly owned: number;
  readonly used: number;
  readonly addedFromSets?: readonly string[];
}

export interface Inventory {
  readonly scale: Scale | string;
  readonly entries: Readonly<Record<string, InventoryEntry>>;
}

/**
 * Structured set contents. The catalog ships a free-text
 * `set_contents_summary` (e.g. "R282-45 + R315-45") which is not
 * machine-readable. Until the PDF is reparsed for accurate contents,
 * only a small whitelist of sets is fully decomposable; the rest add
 * the set's own code to the inventory but cannot be expanded.
 */
export interface SetContents {
  readonly setCode: string;
  readonly items: ReadonlyArray<{ readonly code: string; readonly qty: number }>;
  /** True if items[] was verified against the PDF; false = seed. */
  readonly verified: boolean;
  readonly notes?: string;
}
