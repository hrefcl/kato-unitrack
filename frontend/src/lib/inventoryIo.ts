/**
 * Inventory import/export. Self-contained JSON format the user can
 * archive, share, or roundtrip via Git.
 *
 *   {
 *     "schema_version": 1,
 *     "kind": "kato-unitrack/inventory-export",
 *     "scale": "N",
 *     "exported_at": "<ISO>",
 *     "entries": { "20-000": { "owned": 17, "used": 0 }, ... }
 *   }
 *
 * `used` is included for round-trip fidelity (a saved layout's pieces
 * stay marked-used after import). Import refuses files that don't
 * declare our `kind` marker so an arbitrary JSON can't get loaded by
 * mistake.
 */

import type { Inventory } from "@kato-unitrack/inventory";

export interface InventoryExport {
  schema_version: 1;
  kind: "kato-unitrack/inventory-export";
  scale: string;
  exported_at: string;
  entries: Record<string, { owned: number; used: number }>;
}

export function inventoryToJson(inv: Inventory): string {
  const out: InventoryExport = {
    schema_version: 1,
    kind: "kato-unitrack/inventory-export",
    scale: String(inv.scale),
    exported_at: new Date().toISOString(),
    entries: {},
  };
  for (const e of Object.values(inv.entries)) {
    if (e.owned <= 0) continue;
    out.entries[e.code] = { owned: e.owned, used: e.used };
  }
  return JSON.stringify(out, null, 2);
}

export interface ParsedImport {
  ok: true;
  scale: string;
  entries: Record<string, { owned: number; used: number }>;
  totalPieces: number;
  totalCodes: number;
}
export interface FailedImport {
  ok: false;
  reason: string;
}

export function parseInventoryJson(text: string): ParsedImport | FailedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `JSON malformado: ${(e as Error).message}` };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "El archivo no contiene un objeto JSON." };
  }
  const r = raw as Partial<InventoryExport>;
  if (r.kind !== "kato-unitrack/inventory-export") {
    return {
      ok: false,
      reason: `Tipo desconocido (esperado kato-unitrack/inventory-export, obtenido ${r.kind ?? "<sin kind>"}).`,
    };
  }
  if (r.schema_version !== 1) {
    return { ok: false, reason: `schema_version ${r.schema_version} no soportado.` };
  }
  if (!r.entries || typeof r.entries !== "object") {
    return { ok: false, reason: "Falta el objeto entries." };
  }
  const entries: Record<string, { owned: number; used: number }> = {};
  let totalPieces = 0;
  for (const [code, e] of Object.entries(r.entries)) {
    if (
      !e ||
      typeof (e as { owned?: unknown }).owned !== "number" ||
      typeof (e as { used?: unknown }).used !== "number"
    )
      continue;
    const owned = Math.max(0, Math.floor((e as { owned: number }).owned));
    const used = Math.max(0, Math.min(owned, Math.floor((e as { used: number }).used)));
    if (owned <= 0) continue;
    entries[code] = { owned, used };
    totalPieces += owned;
  }
  return {
    ok: true,
    scale: String(r.scale ?? "N"),
    entries,
    totalPieces,
    totalCodes: Object.keys(entries).length,
  };
}
