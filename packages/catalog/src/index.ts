/**
 * Typed catalog loader and index.
 *
 * The catalog is treated as read-only at runtime. Mutating callers
 * should generate a new JSON via scripts/build-catalog.mjs and ship a
 * new release.
 */

import type { PieceGeometry } from "@kato-unitrack/geometry-engine";
import type { CatalogFile, PieceDefinition } from "./types.js";

export * from "./types.js";

export class CatalogIndex {
  readonly all: readonly PieceDefinition[];
  readonly byCode: ReadonlyMap<string, PieceDefinition>;
  readonly byCategory: ReadonlyMap<string, readonly PieceDefinition[]>;
  readonly byScale: ReadonlyMap<string, readonly PieceDefinition[]>;
  readonly byType: ReadonlyMap<string, readonly PieceDefinition[]>;

  constructor(file: CatalogFile) {
    const all = [...file.pieces];
    this.all = all;
    const byCode = new Map<string, PieceDefinition>();
    const byCategory = new Map<string, PieceDefinition[]>();
    const byScale = new Map<string, PieceDefinition[]>();
    const byType = new Map<string, PieceDefinition[]>();
    for (const p of all) {
      if (byCode.has(p.code)) {
        // Don't throw — catalog should be unique, but if it isn't we'd
        // rather surface duplicates via stats than refuse to load.
        // The loader logs to console; callers can check stats.
        console.warn(`[catalog] duplicate code: ${p.code}`);
      }
      byCode.set(p.code, p);
      pushTo(byCategory, p.category, p);
      pushTo(byScale, p.scale, p);
      pushTo(byType, p.type, p);
    }
    this.byCode = byCode;
    this.byCategory = byCategory;
    this.byScale = byScale;
    this.byType = byType;
  }

  /** Lookup by KATO Item #; throws if missing. */
  mustGet(code: string): PieceDefinition {
    const p = this.byCode.get(code);
    if (!p) throw new Error(`[catalog] piece not found: ${code}`);
    return p;
  }

  /** Subset that the geometry engine can actually place. */
  snappable(): PieceDefinition[] {
    return this.all.filter((p) => p.snappable);
  }

  /** Free-text search over name + description; case-insensitive. */
  search(query: string): PieceDefinition[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.all.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.abbreviation?.toLowerCase().includes(q) ?? false) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    );
  }

  /** Project a PieceDefinition down to a PieceGeometry for the engine. */
  asGeometry(code: string): PieceGeometry {
    const p = this.mustGet(code);
    const out: PieceGeometry = {
      code: p.code,
      connections: p.connections,
      snappable: p.snappable,
    };
    if (p.footprint_mm) (out as { footprint_mm?: typeof p.footprint_mm }).footprint_mm = p.footprint_mm;
    if (p.arc) (out as { arc?: typeof p.arc }).arc = p.arc;
    return out;
  }

  /** Build the (code → geometry) map the engine wants. */
  geometryMap(): Map<string, PieceGeometry> {
    const m = new Map<string, PieceGeometry>();
    for (const p of this.all) {
      const g: PieceGeometry = {
        code: p.code,
        connections: p.connections,
        snappable: p.snappable,
      };
      if (p.footprint_mm) (g as { footprint_mm?: typeof p.footprint_mm }).footprint_mm = p.footprint_mm;
      if (p.arc) (g as { arc?: typeof p.arc }).arc = p.arc;
      m.set(p.code, g);
    }
    return m;
  }
}

function pushTo<K, V>(m: Map<K, V[]>, key: K, value: V): void {
  const arr = m.get(key);
  if (arr) arr.push(value);
  else m.set(key, [value]);
}

/** Parse a CatalogFile from a raw JSON string or value. */
export function parseCatalog(raw: string | object): CatalogIndex {
  const file = (typeof raw === "string" ? JSON.parse(raw) : raw) as CatalogFile;
  return new CatalogIndex(file);
}
