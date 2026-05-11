/**
 * Set decomposition seeds.
 *
 * Only a small whitelist of well-documented KATO sets is encoded here.
 * Adding more requires consulting the PDF page (see `pdf_page` on the
 * catalog entry) — we refuse to invent contents we can't cite.
 *
 * Verified entries (`verified: true`) come from cross-checking the
 * dimensions printed in the PDF against the official KATO M-series /
 * V-series contents list.
 */

import type { SetContents } from "./types.js";

export const SET_CONTENTS: ReadonlyMap<string, SetContents> = new Map([
  [
    "20-852",
    {
      setCode: "20-852",
      // KATO M1 Basic Oval Track Set. Track-only contents per the PDF
      // description (1337×677 mm layout). Power pack / cables / adapter
      // are catalogued separately and intentionally NOT expanded here —
      // they are not snappable track pieces.
      items: [
        { code: "20-000", qty: 4 },     // S248 — straight 248 mm ×4
        { code: "20-020", qty: 1 },     // S124 — straight 124 mm ×1
        { code: "20-027-1", qty: 1 },   // S124 Crossing Gate & Re-Railer ×1
        { code: "20-040", qty: 1 },     // S62 — straight 62 mm ×1
        { code: "20-041", qty: 1 },     // S62 Feeder ×1
        { code: "20-120", qty: 8 },     // R315-45 — base radius ×8
      ],
      verified: true,
      notes: "KATO M1 Basic Oval Set, track-only. Source: catalog description, p.5. Layout 1337×677 mm.",
    },
  ],
  // Add more sets here as their contents are verified against the PDF.
]);

export function knownSet(code: string): SetContents | undefined {
  return SET_CONTENTS.get(code);
}
