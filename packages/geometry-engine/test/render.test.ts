import { describe, it, expect } from "vitest";
import { renderPieceSvg } from "../src/render.js";

describe("renderPieceSvg", () => {
  it("renders a straight", () => {
    const svg = renderPieceSvg({
      code: "20-000",
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [248, 0], direction_deg: 0 },
      ],
      footprint_mm: { width: 248, height: 25 },
    });
    expect(svg).not.toBeNull();
    expect(svg!).toContain("<svg");
    expect(svg!).toContain("viewBox=");
    expect(svg!).toContain("</svg>");
  });

  it("renders a curve with convex sweep flag (regression)", () => {
    const svg = renderPieceSvg({
      code: "20-120",
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [222.74, 92.26], direction_deg: 45 },
      ],
      arc: { radius_mm: 315, sweep_deg: 45, center_mm: [0, 315] },
    });
    // The inner <g transform="scale(1,-1)"> means a CCW math arc should use sweep-flag 1.
    // We expect both rail paths to have sweep-flag 1.
    // arcPath returns: `M 0,offset A r r 0 0 0 ex ey` (CURRENTLY WRONG)
    // We want to find TWO occurrences of "A [radius] [radius] 0 0 1" for the rails.
    const matches = svg!.match(/A\s+[\d.]+\s+[\d.]+\s+0\s+0\s+1/g);
    // Currently, ballast adds one '1', and rails add zero '1's. Total 1.
    // After fix, ballast adds one '1', and two rails add two '1's. Total 3.
    expect(matches?.length).toBe(3);
  });

  it("renders a turnout", () => {
    const svg = renderPieceSvg({
      code: "20-202",
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [248, 0], direction_deg: 0 },
        { id: "C", position_mm: [185.83, 24.47], direction_deg: 15 },
      ],
      turnout: {
        radius_mm: 718,
        diverge_deg: 15,
        hand: "L",
        straight_length_mm: 248,
      },
    } as any);
    expect(svg).not.toBeNull();
    expect(svg!).toContain("<line");
    expect(svg!).toContain("<path");
  });

  it("returns null for an accessory with no connections", () => {
    const svg = renderPieceSvg({ code: "24-818", connections: [] } as any);
    expect(svg).toBeNull();
  });

  it("[ID-B-R1] curve rail arc reconstructs to centre (0, R) (math-frame)", () => {
    // Strong regression test per Team B's v1 observation: parsing the
    // sweep flag alone doesn't prove the arc is on the right side of
    // the chord. Reconstruct the centre from the SVG endpoint-to-centre
    // algorithm and confirm it lands at (0, R).
    const R = 315;
    const sweep = 45;
    const svg = renderPieceSvg({
      code: "20-120",
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [222.74, 92.26], direction_deg: 45 },
      ],
      arc: { radius_mm: R, sweep_deg: sweep, center_mm: [0, R] },
    } as never);
    expect(svg).not.toBeNull();
    // Find every "M sx,sy A rx ry 0 large sweep ex ey" command.
    const re = /M\s+([-\d.]+)[, ]\s*([-\d.]+)\s+A\s+([\d.]+)\s+([\d.]+)\s+0\s+([01])\s+([01])\s+([-\d.]+)[, ]?\s*([-\d.]+)/g;
    const seenCenters: Array<[number, number]> = [];
    for (const m of svg!.matchAll(re)) {
      const sx = Number(m[1]!), sy = Number(m[2]!);
      const rx = Number(m[3]!);
      const fA = Number(m[5]!), fS = Number(m[6]!);
      const ex = Number(m[7]!), ey = Number(m[8]!);
      // SVG endpoint-to-centre, circular case (rx === ry).
      // 1. Midpoint of the chord.
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      // 2. Half-chord vector and length.
      const dx = (ex - sx) / 2, dy = (ey - sy) / 2;
      const d2 = dx * dx + dy * dy;
      const h2 = rx * rx - d2;
      if (h2 < -1e-6) continue; // unreachable; numerical fluff
      const h = Math.sqrt(Math.max(0, h2));
      // 3. Perpendicular to the chord, length h. Two candidates:
      //    +(-dy, dx) and -(-dy, dx). Pick by large-arc / sweep flags.
      const px = -dy, py = dx;
      const len = Math.hypot(px, py) || 1;
      const ux = px / len, uy = py / len;
      // Per the SVG spec, the sign is (fA === fS) ? -1 : +1 in the
      // perpendicular direction.
      const sign = fA === fS ? -1 : 1;
      const cx = mx + sign * ux * h;
      const cy = my + sign * uy * h;
      seenCenters.push([cx, cy]);
    }
    // Both rails (inner + outer) should reconstruct to (0, R).
    expect(seenCenters.length).toBeGreaterThanOrEqual(2);
    for (const [cx, cy] of seenCenters) {
      expect(Math.abs(cx - 0)).toBeLessThan(0.5);
      expect(Math.abs(cy - R)).toBeLessThan(0.5);
    }
  });
});
