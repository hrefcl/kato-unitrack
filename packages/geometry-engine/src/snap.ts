/**
 * Snap candidate search and attachment validation.
 */

import {
  DEFAULT_TOLERANCES,
  type Attachment,
  type ConnectionWorld,
  type Layout,
  type OpenEnd,
  type PieceGeometry,
  type Placement,
  type Tolerances,
} from "./types.js";
import { v2dist, oppositeDir, wrap180 } from "./vec.js";
import { connectionWorld, placementForAttach } from "./transform.js";
import { openEnds } from "./topology.js";

export interface SnapCandidate {
  readonly placement: Placement;
  readonly target: OpenEnd;
  readonly candidateConnectionId: string;
  readonly mirrored: boolean;
}

/**
 * Find the best snap for `piece` near world point `near`, given the
 * current layout. Returns the candidate Placement that mates `piece`'s
 * first (or specified) connector to the closest free connector in the
 * layout. Returns null if no free connector is within `snapDistanceMm`
 * of `near`.
 */
export function findSnapCandidate(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
  newPiece: PieceGeometry,
  near: { x: number; y: number },
  options: {
    candidateConnectionId?: string;
    placementId: string;
    searchRadiusMm?: number;
    tolerances?: Partial<Tolerances>;
  },
): SnapCandidate | null {
  const tol: Tolerances = { ...DEFAULT_TOLERANCES, ...(options.tolerances ?? {}) };
  const searchRadius = options.searchRadiusMm ?? 80;
  const candidateConnId =
    options.candidateConnectionId ?? newPiece.connections[0]?.id;
  if (!candidateConnId) return null;

  const ends = openEnds(layout, pieces);
  let best: { d: number; end: OpenEnd } | null = null;
  for (const e of ends) {
    const d = v2dist(e.world.position, [near.x, near.y]);
    if (d <= searchRadius && (!best || d < best.d)) best = { d, end: e };
  }
  if (!best) return null;

  // Try both orientations (mirrored on/off) and pick the one closer to
  // satisfying the tolerance — same orientation, but lets the caller
  // decide visually if curves should bend left or right later.
  const candidates: SnapCandidate[] = [false, true].map((mirrored) => {
    const placement = placementForAttach(newPiece, candidateConnId, best!.end.world, {
      mirrored,
      placementId: options.placementId,
    });
    return {
      placement,
      target: best!.end,
      candidateConnectionId: candidateConnId,
      mirrored,
    };
  });
  // We always satisfy distance & angle by construction (the math is
  // exact); we still pick mirrored=false by default to keep curves
  // bending in their native handedness — UI can flip with a hotkey.
  return candidates[0] ?? candidates[1] ?? null;
}

/**
 * Validate that two world connectors are geometrically attachable.
 */
export function canAttachWorld(
  a: ConnectionWorld,
  b: ConnectionWorld,
  tol: Tolerances = DEFAULT_TOLERANCES,
): { ok: boolean; reason?: string } {
  const d = v2dist(a.position, b.position);
  if (d > tol.snapDistanceMm) {
    return { ok: false, reason: `connector distance ${d.toFixed(3)} mm > ${tol.snapDistanceMm} mm` };
  }
  if (!oppositeDir(a.direction, b.direction, tol.snapAngleDeg)) {
    const delta = Math.abs(wrap180(a.direction - b.direction - 180));
    return { ok: false, reason: `direction error ${delta.toFixed(3)}° > ${tol.snapAngleDeg}°` };
  }
  return { ok: true };
}

/**
 * Build an Attachment between two placement/connection pairs after
 * verifying their geometry agrees within tolerance.
 */
export function tryAttach(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
  a: { placementId: string; connectionId: string },
  b: { placementId: string; connectionId: string },
  tol: Tolerances = DEFAULT_TOLERANCES,
): { ok: true; attachment: Attachment } | { ok: false; reason: string } {
  const pa = layout.placements.find((p) => p.id === a.placementId);
  const pb = layout.placements.find((p) => p.id === b.placementId);
  if (!pa || !pb) return { ok: false, reason: "placement not found in layout" };
  const ga = pieces.get(pa.code);
  const gb = pieces.get(pb.code);
  if (!ga || !gb) return { ok: false, reason: "piece geometry not found" };
  const ca = ga.connections.find((c) => c.id === a.connectionId);
  const cb = gb.connections.find((c) => c.id === b.connectionId);
  if (!ca || !cb) return { ok: false, reason: "connection id not found on piece" };
  if (
    ca.compatibilityClass &&
    cb.compatibilityClass &&
    ca.compatibilityClass !== cb.compatibilityClass
  ) {
    return { ok: false, reason: "incompatible connector classes" };
  }
  const wa = connectionWorld(ga, ca, pa);
  const wb = connectionWorld(gb, cb, pb);
  const check = canAttachWorld(wa, wb, tol);
  if (!check.ok) return { ok: false, reason: check.reason ?? "tolerance" };
  return { ok: true, attachment: { a, b } };
}
