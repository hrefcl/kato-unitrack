/**
 * The single most important test in the engine: chain 8 R315-45 curves
 * end-to-end and verify the loop closes within 0.5 mm. If this fails,
 * nothing else in the platform can be trusted.
 */

import { describe, it, expect } from "vitest";
import { placementForAttach, connectionWorld } from "../src/transform.js";
import { validate } from "../src/validate.js";
import type {
  Attachment,
  PieceGeometry,
  Placement,
} from "../src/types.js";

const R = 315;
const ALPHA = 45;
const aRad = (ALPHA * Math.PI) / 180;

const curve: PieceGeometry = {
  code: "20-120",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    {
      id: "B",
      position_mm: [R * Math.sin(aRad), R * (1 - Math.cos(aRad))],
      direction_deg: ALPHA,
    },
  ],
};

describe("closed oval (8 × R315-45)", () => {
  it("closes within tolerance", () => {
    const placements: Placement[] = [];
    const attachments: Attachment[] = [];

    // First piece anchored at the origin.
    placements.push({
      id: "c0",
      code: curve.code,
      position_mm: [0, 0],
      rotation_deg: 0,
      mirrored: false,
    });

    for (let i = 1; i < 8; i++) {
      const prev = placements[i - 1]!;
      // World position/direction of the previous piece's B connector.
      const prevB = connectionWorld(curve, curve.connections[1]!, prev);
      // Attach A of new curve to B of previous.
      const next = placementForAttach(curve, "A", prevB, {
        mirrored: false,
        placementId: `c${i}`,
      });
      placements.push(next);
      attachments.push({
        a: { placementId: prev.id, connectionId: "B" },
        b: { placementId: next.id, connectionId: "A" },
      });
    }

    // Closing attachment: last piece's B should meet first piece's A.
    const last = placements[7]!;
    const first = placements[0]!;
    const lastB = connectionWorld(curve, curve.connections[1]!, last);
    const firstA = connectionWorld(curve, curve.connections[0]!, first);

    const dx = lastB.position[0] - firstA.position[0];
    const dy = lastB.position[1] - firstA.position[1];
    const gap = Math.hypot(dx, dy);
    expect(gap).toBeLessThan(0.5);

    // Now declare the closure and let the validator confirm everything.
    attachments.push({
      a: { placementId: last.id, connectionId: "B" },
      b: { placementId: first.id, connectionId: "A" },
    });
    const pieces = new Map([[curve.code, curve]]);
    const result = validate({ placements, attachments }, pieces);
    expect(result.ok).toBe(true);
    expect(result.openEnds.length).toBe(0);
  });
});
