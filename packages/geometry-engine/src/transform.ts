/**
 * Local → world transforms for placed pieces.
 *
 * The composed transform for a Placement is:
 *
 *     M = T(Tx, Ty) · R(θ) · S(1, sy)        where sy = mirrored ? −1 : +1
 *
 * That is, first mirror across the local X axis (if requested), then
 * rotate around the piece origin, then translate to world.
 */

import { deg2rad, wrap180 } from "./vec.js";
import type {
  Connection,
  ConnectionWorld,
  PieceGeometry,
  Placement,
  Vec2,
} from "./types.js";

export function localToWorldPoint(p: Vec2, placement: Placement): Vec2 {
  const [px, py] = p;
  const sy = placement.mirrored ? -1 : 1;
  const c = Math.cos(deg2rad(placement.rotation_deg));
  const s = Math.sin(deg2rad(placement.rotation_deg));
  const [tx, ty] = placement.position_mm;
  return [
    tx + px * c - sy * py * s,
    ty + px * s + sy * py * c,
  ];
}

export function localToWorldDir(deg: number, placement: Placement): number {
  return placement.mirrored
    ? wrap180(placement.rotation_deg - deg)
    : wrap180(placement.rotation_deg + deg);
}

export function connectionWorld(
  piece: PieceGeometry,
  conn: Connection,
  placement: Placement,
): ConnectionWorld {
  return {
    position: localToWorldPoint(conn.position_mm, placement),
    direction: localToWorldDir(conn.direction_deg, placement),
  };
}

/**
 * Solve for the Placement that puts piece `piece`'s connection `connId`
 * exactly at `target.position` with world direction = target.direction + 180°.
 *
 * That is: "attach the candidate connector to a target connector".
 */
export function placementForAttach(
  piece: PieceGeometry,
  connId: string,
  target: ConnectionWorld,
  options: { mirrored: boolean; placementId: string },
): Placement {
  const conn = piece.connections.find((c) => c.id === connId);
  if (!conn) {
    throw new Error(
      `[geometry-engine] connection '${connId}' not found on piece '${piece.code}'`,
    );
  }

  // Required world direction at the candidate connector: opposite of target.
  const requiredWorldDir = wrap180(target.direction + 180);

  // Solve θ from: localToWorldDir(conn.direction_deg) = requiredWorldDir
  //   mirrored:     θ − δ_local = requiredWorldDir  ⇒  θ = required + δ_local
  //   not mirrored: θ + δ_local = requiredWorldDir  ⇒  θ = required − δ_local
  const rotation_deg = options.mirrored
    ? wrap180(requiredWorldDir + conn.direction_deg)
    : wrap180(requiredWorldDir - conn.direction_deg);

  // Solve (Tx, Ty) so that localToWorldPoint(conn.position) = target.position.
  const c = Math.cos(deg2rad(rotation_deg));
  const s = Math.sin(deg2rad(rotation_deg));
  const sy = options.mirrored ? -1 : 1;
  const [px, py] = conn.position_mm;
  const Tx = target.position[0] - (px * c - sy * py * s);
  const Ty = target.position[1] - (px * s + sy * py * c);

  return {
    id: options.placementId,
    code: piece.code,
    position_mm: [Tx, Ty],
    rotation_deg,
    mirrored: options.mirrored,
  };
}
