import { describe, it, expect } from "vitest";
import { renderLayoutToSvgString, renderPieceBody, renderPieceSvg } from "../src/render.js";
import type { PieceGeometry, Placement } from "../src/types.js";

const straight248: PieceGeometry = {
  code: "20-000",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [248, 0], direction_deg: 0 },
  ],
  footprint_mm: { width: 248, height: 25 },
};

const curveR315A45: PieceGeometry = {
  code: "20-120",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [222.7386, 92.2614], direction_deg: 45 },
  ],
  arc: { radius_mm: 315, sweep_deg: 45, center_mm: [0, 315] },
};

const turnoutR718: PieceGeometry = {
  code: "20-202",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [248, 0], direction_deg: 0 },
    { id: "C", position_mm: [185.83, 24.47], direction_deg: 15 },
  ],
  turnout: {
    radius_mm: 718, diverge_deg: 15, hand: "L",
    straight_length_mm: 248,
  },
};

describe("renderPieceBody (no wrapper)", () => {
  it("returns plain inner SVG for a straight", () => {
    const body = renderPieceBody(straight248);
    expect(body).not.toBeNull();
    expect(body!).not.toContain("<svg");
    expect(body!).not.toContain("scale(1,-1)");
    expect(body!).toMatch(/<line[^>]+stroke=/);
  });

  it("renders turnout body when turnout descriptor is present", () => {
    const body = renderPieceBody(turnoutR718);
    expect(body).not.toBeNull();
    expect(body!).toContain("<path");
    expect(body!).toContain("<line");
    expect(body!).toContain("<circle"); // C connector marker
  });

  it("returns null for a piece with no connections", () => {
    expect(renderPieceBody({ code: "x", connections: [] })).toBeNull();
  });
});

describe("renderPieceSvg uses renderPieceBody", () => {
  it("output equals svg-wrapped body for the same piece", () => {
    const body = renderPieceBody(straight248)!;
    const full = renderPieceSvg(straight248)!;
    expect(full).toContain(body);
    expect(full).toContain("<svg");
    expect(full).toContain("scale(1,-1)");
  });
});

describe("renderLayoutToSvgString", () => {
  const geomMap = new Map<string, PieceGeometry>([
    [straight248.code, straight248],
    [curveR315A45.code, curveR315A45],
    [turnoutR718.code, turnoutR718],
  ]);

  it("emits a self-contained SVG document for a 12-piece M1 oval", () => {
    // Build a minimal 12-placement layout (8 curves + 4 straights).
    const placements: Placement[] = [];
    for (let i = 0; i < 8; i++) {
      placements.push({
        id: `c${i}`, code: curveR315A45.code,
        position_mm: [i * 50, 0], rotation_deg: i * 45, mirrored: false,
      });
    }
    for (let i = 0; i < 4; i++) {
      placements.push({
        id: `s${i}`, code: straight248.code,
        position_mm: [i * 250, 0], rotation_deg: 0, mirrored: false,
      });
    }
    const svg = renderLayoutToSvgString(
      { placements, board_mm: { width: 1500, height: 800 } },
      geomMap,
    );
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // One <g data-placement-id="..."> per placement.
    const placementGroups = svg.match(/data-placement-id="/g) ?? [];
    expect(placementGroups.length).toBe(12);
    // Board outline included by default.
    expect(svg).toMatch(/<rect[^>]+stroke-dasharray="8 8"/);
  });

  it("renders a turnout body inside the layout SVG", () => {
    const layout = {
      placements: [{
        id: "t1", code: turnoutR718.code,
        position_mm: [0, 0] as [number, number],
        rotation_deg: 0, mirrored: false,
      }],
      board_mm: { width: 500, height: 100 },
    };
    const svg = renderLayoutToSvgString(layout, geomMap);
    // The turnout uses arcs (paths). Layout SVG must include them.
    expect(svg).toMatch(/<path[^>]+/);
    expect(svg).toContain('data-code="20-202"');
  });

  it("escapes potentially malicious placement ids in data-* attrs", () => {
    const layout = {
      placements: [{
        id: '"><script>alert(1)</script>',
        code: straight248.code,
        position_mm: [0, 0] as [number, number],
        rotation_deg: 0, mirrored: false,
      }],
    };
    const svg = renderLayoutToSvgString(layout, geomMap, { showBoard: false });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&quot;");
  });

  it("produces well-formed SVG for an empty layout", () => {
    const svg = renderLayoutToSvgString({ placements: [] }, geomMap, { showBoard: false });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // No placement groups.
    expect(svg).not.toContain("data-placement-id=");
  });

  it("viewBox Y compensates for the outer scale(1,-1) so content is not clipped", () => {
    // Place a single straight at world y=100. After the flip, it
    // renders at SVG y=-100; the viewBox Y must include -100, not +100.
    const layout = {
      placements: [{
        id: "p1", code: straight248.code,
        position_mm: [0, 100] as [number, number],
        rotation_deg: 0, mirrored: false,
      }],
      board_mm: { width: 500, height: 500 },
    };
    const svg = renderLayoutToSvgString(layout, geomMap, { showBoard: false, contentPaddingMm: 0 });
    const vbMatch = svg.match(/viewBox="([^"]+)"/);
    expect(vbMatch).not.toBeNull();
    const parts = vbMatch![1]!.split(/\s+/).map(Number);
    const vbX = parts[0]!;
    const vbY = parts[1]!;
    const vbW = parts[2]!;
    const vbH = parts[3]!;
    // The piece sits at world y in [100-12.5, 100+12.5]. After
    // scale(1,-1) the content lives at SVG y in [-112.5, -87.5].
    // viewBox must cover that range.
    expect(vbY).toBeLessThan(-87.5);
    expect(vbY + vbH).toBeGreaterThanOrEqual(-87.5);
    expect(vbX).toBeLessThanOrEqual(0);
    expect(vbX + vbW).toBeGreaterThanOrEqual(248);
  });
});
