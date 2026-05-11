/**
 * Materialize a LayoutProposal into a validated Layout.
 *
 * This is the *only* path by which an AI suggestion becomes geometry.
 * The function walks the symbolic moves, asking the geometry engine to
 * compute each Placement from the previous one. If any step fails the
 * proposal is rejected — we never "guess" a fixup.
 */

import {
  connectionWorld,
  placementForAttach,
  type Attachment,
  type Placement,
  type PieceGeometry,
} from "@kato-unitrack/geometry-engine";
import type { CatalogIndex } from "@kato-unitrack/catalog";
import type { LayoutProposal } from "./types.js";

export interface MaterializedLayout {
  readonly placements: readonly Placement[];
  readonly attachments: readonly Attachment[];
}

export interface MaterializeOk {
  readonly ok: true;
  readonly layout: MaterializedLayout;
  readonly refToId: Readonly<Record<string, string>>;
}
export interface MaterializeErr {
  readonly ok: false;
  readonly reason: string;
}

export function materializeProposal(
  proposal: LayoutProposal,
  catalog: CatalogIndex,
): MaterializeOk | MaterializeErr {
  const placements: Placement[] = [];
  const attachments: Attachment[] = [];
  const refToId: Record<string, string> = {};
  const refGeom: Record<string, PieceGeometry> = {};

  for (const [i, move] of proposal.moves.entries()) {
    const piece = catalog.byCode.get(move.code);
    if (!piece) return { ok: false, reason: `move ${i}: unknown code ${move.code}` };
    const geom = catalog.asGeometry(move.code);

    if (move.kind === "place") {
      const id = `mat-${i}`;
      placements.push({
        id,
        code: move.code,
        position_mm: [0, 0],
        rotation_deg: 0,
        mirrored: false,
      });
      refToId[move.ref] = id;
      refGeom[move.ref] = geom;
      continue;
    }

    // attach
    const toId = refToId[move.toRef];
    const toGeom = refGeom[move.toRef];
    if (!toId || !toGeom) {
      return { ok: false, reason: `move ${i}: unknown toRef ${move.toRef}` };
    }
    const toPlacement = placements.find((p) => p.id === toId);
    if (!toPlacement) return { ok: false, reason: `move ${i}: missing placement ${toId}` };
    const toConn = toGeom.connections.find((c) => c.id === move.toConn);
    if (!toConn) return { ok: false, reason: `move ${i}: ${move.toRef} has no connection ${move.toConn}` };

    const target = connectionWorld(toGeom, toConn, toPlacement);
    let next: Placement;
    try {
      next = placementForAttach(geom, move.conn, target, {
        mirrored: move.mirrored ?? false,
        placementId: `mat-${i}`,
      });
    } catch (err) {
      return { ok: false, reason: `move ${i}: ${(err as Error).message}` };
    }
    placements.push(next);
    attachments.push({
      a: { placementId: toId, connectionId: move.toConn },
      b: { placementId: next.id, connectionId: move.conn },
    });
    refToId[move.ref] = next.id;
    refGeom[move.ref] = geom;
  }

  return { ok: true, layout: { placements, attachments }, refToId };
}
