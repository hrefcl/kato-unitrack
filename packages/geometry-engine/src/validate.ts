/**
 * Whole-layout validation. Used by the layout generator and the AI
 * proposal materializer.
 */

import {
  DEFAULT_TOLERANCES,
  type Layout,
  type PieceGeometry,
  type Tolerances,
  type ValidationResult,
} from "./types.js";
import { connectionWorld } from "./transform.js";
import { canAttachWorld } from "./snap.js";
import { openEnds } from "./topology.js";
import { detectCollisions } from "./collision.js";

export function validate(
  layout: Layout,
  pieces: Map<string, PieceGeometry>,
  tol: Tolerances = DEFAULT_TOLERANCES,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Every referenced piece must exist.
  for (const p of layout.placements) {
    if (!pieces.has(p.code)) errors.push(`unknown piece code '${p.code}' in placement ${p.id}`);
  }
  // Every attachment must reference real placements and real connectors,
  // and the world positions/directions must agree within tolerance.
  for (const att of layout.attachments) {
    const pa = layout.placements.find((p) => p.id === att.a.placementId);
    const pb = layout.placements.find((p) => p.id === att.b.placementId);
    if (!pa || !pb) {
      errors.push(`attachment references missing placement: ${att.a.placementId} / ${att.b.placementId}`);
      continue;
    }
    const ga = pieces.get(pa.code);
    const gb = pieces.get(pb.code);
    if (!ga || !gb) continue;
    const ca = ga.connections.find((c) => c.id === att.a.connectionId);
    const cb = gb.connections.find((c) => c.id === att.b.connectionId);
    if (!ca || !cb) {
      errors.push(`attachment references missing connector: ${att.a.connectionId} / ${att.b.connectionId}`);
      continue;
    }
    const wa = connectionWorld(ga, ca, pa);
    const wb = connectionWorld(gb, cb, pb);
    const check = canAttachWorld(wa, wb, tol);
    if (!check.ok) {
      errors.push(`attachment ${pa.id}:${att.a.connectionId} ↔ ${pb.id}:${att.b.connectionId} fails: ${check.reason}`);
    }
  }
  // Collisions are warnings, not errors — AABB is conservative.
  const cols = detectCollisions(layout, pieces, tol.snapDistanceMm * 2);
  for (const [a, b] of cols) warnings.push(`possible collision: ${a} ↔ ${b}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    openEnds: openEnds(layout, pieces),
  };
}
