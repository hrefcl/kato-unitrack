/**
 * Connectivity, open ends, and closed-loop detection.
 */

import type { Layout, OpenEnd, PieceGeometry } from "./types.js";
import { connectionWorld } from "./transform.js";

/**
 * Return every connector in the layout that is not part of any
 * Attachment.
 */
export function openEnds(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
): OpenEnd[] {
  const used = new Set<string>();
  for (const att of layout.attachments) {
    used.add(`${att.a.placementId}:${att.a.connectionId}`);
    used.add(`${att.b.placementId}:${att.b.connectionId}`);
  }
  const ends: OpenEnd[] = [];
  for (const p of layout.placements) {
    const geom = pieces.get(p.code);
    if (!geom) continue;
    for (const conn of geom.connections) {
      const k = `${p.id}:${conn.id}`;
      if (used.has(k)) continue;
      ends.push({
        placementId: p.id,
        connectionId: conn.id,
        world: connectionWorld(geom, conn, p),
      });
    }
  }
  return ends;
}

/**
 * Build the connectivity graph: nodes are placements, edges are
 * attachments. Returns connected components.
 */
export function connectedComponents(layout: Layout): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const p of layout.placements) adj.set(p.id, new Set());
  for (const a of layout.attachments) {
    adj.get(a.a.placementId)?.add(a.b.placementId);
    adj.get(a.b.placementId)?.add(a.a.placementId);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const p of layout.placements) {
    if (seen.has(p.id)) continue;
    const stack = [p.id];
    const comp: string[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      comp.push(id);
      for (const n of adj.get(id) ?? []) if (!seen.has(n)) stack.push(n);
    }
    out.push(comp);
  }
  return out;
}

/**
 * A component is a closed ring if every placement in it has all of its
 * connectors attached. We use the count of attachments where each
 * placement appears, vs the total connector count per placement.
 */
export function closedRings(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
): string[][] {
  const components = connectedComponents(layout);
  const placementConnCount = new Map<string, number>();
  for (const p of layout.placements) {
    placementConnCount.set(p.id, pieces.get(p.code)?.connections.length ?? 0);
  }
  const attachedConn = new Map<string, number>();
  for (const a of layout.attachments) {
    attachedConn.set(a.a.placementId, (attachedConn.get(a.a.placementId) ?? 0) + 1);
    attachedConn.set(a.b.placementId, (attachedConn.get(a.b.placementId) ?? 0) + 1);
  }
  return components.filter((comp) => {
    if (comp.length < 3) return false;
    return comp.every(
      (pid) =>
        (attachedConn.get(pid) ?? 0) >= (placementConnCount.get(pid) ?? Infinity),
    );
  });
}
