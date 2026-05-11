/**
 * Convert a generator-produced Layout into a symbolic LayoutProposal.
 *
 * Walk the placements in order. The first becomes a `place` move; each
 * subsequent placement is connected to a previously-emitted one via an
 * `attach` move (the connection IDs come from the matching Attachment
 * in the layout). Any Attachments that link two already-emitted
 * placements (typically the closing ring) become `link` moves.
 *
 * The materializer at @kato-unitrack/ai-providers will rebuild a
 * geometrically equivalent layout from this proposal — modulo
 * sub-millimetre floating-point drift that the engine's tolerances
 * absorb.
 */

import type {
  Attachment,
  Placement,
} from "@kato-unitrack/geometry-engine";
import type { LayoutProposal, ProposalMove } from "./types.js";

interface LayoutLike {
  readonly name: string;
  readonly notes?: string;
  readonly placements: readonly Placement[];
  readonly attachments: readonly Attachment[];
  readonly inventory_usage?: Record<string, number>;
}

export function proposalFromLayout(layout: LayoutLike, rationale?: string): LayoutProposal {
  const moves: ProposalMove[] = [];
  const placed = new Set<string>();

  // Index attachments by the two placement IDs they connect, so we can
  // look up "what attaches placement X to anything already-placed?".
  const adj = new Map<string, Attachment[]>();
  for (const a of layout.attachments) {
    if (!adj.has(a.a.placementId)) adj.set(a.a.placementId, []);
    if (!adj.has(a.b.placementId)) adj.set(a.b.placementId, []);
    adj.get(a.a.placementId)!.push(a);
    adj.get(a.b.placementId)!.push(a);
  }

  const usedAttachments = new Set<Attachment>();

  for (const p of layout.placements) {
    if (placed.size === 0) {
      moves.push({ kind: "place", ref: p.id, code: p.code });
      placed.add(p.id);
      continue;
    }
    // Find a not-yet-used attachment between this placement and one we
    // already emitted.
    const candidates = (adj.get(p.id) ?? []).filter((a) => !usedAttachments.has(a));
    let used: Attachment | undefined;
    for (const a of candidates) {
      const otherId = a.a.placementId === p.id ? a.b.placementId : a.a.placementId;
      if (placed.has(otherId)) {
        used = a;
        break;
      }
    }
    if (used) {
      const toRef = used.a.placementId === p.id ? used.b.placementId : used.a.placementId;
      const toConn = used.a.placementId === p.id ? used.b.connectionId : used.a.connectionId;
      const conn = used.a.placementId === p.id ? used.a.connectionId : used.b.connectionId;
      moves.push({
        kind: "attach",
        ref: p.id,
        code: p.code,
        toRef,
        toConn,
        conn,
        mirrored: p.mirrored,
      });
      usedAttachments.add(used);
    } else {
      // No connecting attachment found. Place it free; we'll need a
      // link later or this is a floating piece. Emit "place" as
      // best-effort fallback.
      moves.push({ kind: "place", ref: p.id, code: p.code });
    }
    placed.add(p.id);
  }

  // Remaining attachments (between two already-placed refs) become
  // `link` moves. Typically these are loop-closing attachments.
  for (const a of layout.attachments) {
    if (usedAttachments.has(a)) continue;
    moves.push({
      kind: "link",
      from: a.a.placementId,
      fromConn: a.a.connectionId,
      to: a.b.placementId,
      toConn: a.b.connectionId,
    });
  }

  return {
    name: layout.name,
    rationale:
      rationale ??
      layout.notes ??
      `Auto-build con ${layout.placements.length} piezas` +
        (layout.inventory_usage
          ? ` (${Object.entries(layout.inventory_usage)
              .map(([k, v]) => `${v}×${k}`)
              .join(", ")})`
          : ""),
    moves,
  };
}
