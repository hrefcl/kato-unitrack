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

  it("renders a curve", () => {
    const svg = renderPieceSvg({
      code: "20-120",
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [222.74, 92.26], direction_deg: 45 },
      ],
      arc: { radius_mm: 315, sweep_deg: 45, center_mm: [0, 315] },
    });
    expect(svg).not.toBeNull();
    // Curve should contain at least one <path .. arc ..>
    expect(svg!).toMatch(/<path[^>]*A\s+/);
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
});
