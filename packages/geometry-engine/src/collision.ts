/**
 * AABB collision detection.
 *
 * MVP: bounding boxes only. Two placed pieces "collide" iff their AABBs
 * overlap AND they are not directly attached. This catches gross
 * overlaps the layout generator might propose; it does NOT replace a
 * full curved-strip intersection.
 */

import { connectionWorld, localToWorldPoint } from "./transform.js";
import type { Layout, PieceGeometry, Placement } from "./types.js";

export interface AABB {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * AABB for a placed piece. We sample the footprint corners and all
 * connector positions and take the enclosing box. This is intentionally
 * conservative (slightly larger than reality), which matches our goal
 * of catching obvious overlaps without false positives at the joints.
 */
export function placementAABB(
  piece: PieceGeometry,
  placement: Placement,
): AABB {
  const points: Array<readonly [number, number]> = [];
  if (piece.footprint_mm) {
    const w = piece.footprint_mm.width;
    const h = piece.footprint_mm.height;
    points.push(
      localToWorldPoint([0, -h / 2], placement),
      localToWorldPoint([w, -h / 2], placement),
      localToWorldPoint([0, h / 2], placement),
      localToWorldPoint([w, h / 2], placement),
    );
  }
  for (const conn of piece.connections) {
    points.push(localToWorldPoint(conn.position_mm, placement));
  }
  if (points.length === 0) {
    const [x, y] = placement.position_mm;
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function aabbOverlap(a: AABB, b: AABB, slackMm = 0.5): boolean {
  return !(
    a.maxX < b.minX - slackMm ||
    a.minX > b.maxX + slackMm ||
    a.maxY < b.minY - slackMm ||
    a.minY > b.maxY + slackMm
  );
}

/**
 * Return all pairs of placements whose AABBs overlap AND which are not
 * directly attached. A non-empty result means the layout has at least
 * one suspicious collision; further refinement (curved-strip clip) is
 * left to post-MVP.
 */
export function detectCollisions(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
  slackMm = 0.5,
): Array<[string, string]> {
  const attached = new Set<string>();
  for (const a of layout.attachments) {
    const k1 = `${a.a.placementId}|${a.b.placementId}`;
    const k2 = `${a.b.placementId}|${a.a.placementId}`;
    attached.add(k1);
    attached.add(k2);
  }
  const boxes = new Map<string, AABB>();
  for (const p of layout.placements) {
    const g = pieces.get(p.code);
    if (!g) continue;
    boxes.set(p.id, placementAABB(g, p));
  }
  const ids = [...boxes.keys()];
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (attached.has(`${a}|${b}`)) continue;
      if (aabbOverlap(boxes.get(a)!, boxes.get(b)!, slackMm)) out.push([a, b]);
    }
  }
  return out;
}
