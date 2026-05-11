/**
 * Procedural SVG renderer for snappable pieces.
 *
 * The renderer turns a PieceGeometry into an SVG string whose
 * coordinates are in millimetres (viewBox uses mm). It is intentionally
 * unstyled — the frontend can re-skin it via CSS.
 *
 * Pieces with `snappable: false` and no connections are not rendered;
 * the caller should fall back to a placeholder or a PDF crop.
 */

import { deg2rad } from "./vec.js";
import type { PieceGeometry, Vec2 } from "./types.js";

const TIE_HALF_HEIGHT = 7.5;   // half-height of the schematic tie strip
const RAIL_OFFSET = 4.5;       // distance from centerline to each rail
const RAIL_STROKE = 0.6;
const TIE_STROKE = 0.3;

export interface SvgOptions {
  /** Stroke colours; default black ties + dark grey rails. */
  readonly tieColor?: string;
  readonly railColor?: string;
  /** Add a small bbox padding so strokes don't clip. */
  readonly paddingMm?: number;
  /** Override viewBox; defaults to piece footprint. */
  readonly viewBoxMm?: { x: number; y: number; w: number; h: number };
}

interface ExtendedGeom extends PieceGeometry {
  readonly arc?: {
    readonly radius_mm: number;
    readonly sweep_deg: number;
    readonly center_mm: Vec2;
  };
  readonly turnout?: {
    readonly radius_mm: number;
    readonly diverge_deg: number;
    readonly hand: "L" | "R" | "Wye";
    readonly straight_length_mm: number;
  };
  readonly double_track?: { readonly spacing_mm: number };
}

function svgHeader(viewBox: { x: number; y: number; w: number; h: number }, opts?: SvgOptions): string {
  const pad = opts?.paddingMm ?? 2;
  const vb = `${viewBox.x - pad} ${viewBox.y - pad} ${viewBox.w + pad * 2} ${viewBox.h + pad * 2}`;
  // Flip Y so the SVG matches the engine's math frame (+Y up).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><g transform="scale(1,-1)">`;
}

function svgFooter(): string {
  return `</g></svg>`;
}

function renderStraight(piece: ExtendedGeom, opts: SvgOptions): string {
  const a = piece.connections[0]!;
  const b = piece.connections[1]!;
  const x0 = a.position_mm[0], x1 = b.position_mm[0];
  const tieColor = opts.tieColor ?? "#222";
  const railColor = opts.railColor ?? "#444";
  const ties: string[] = [];
  const tieStep = 8;
  for (let x = x0 + 4; x < x1 - 2; x += tieStep) {
    ties.push(`<line x1="${x}" y1="${-TIE_HALF_HEIGHT}" x2="${x}" y2="${TIE_HALF_HEIGHT}" stroke="${tieColor}" stroke-width="${TIE_STROKE}"/>`);
  }
  const rails = [
    `<line x1="${x0}" y1="${-RAIL_OFFSET}" x2="${x1}" y2="${-RAIL_OFFSET}" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`,
    `<line x1="${x0}" y1="${RAIL_OFFSET}" x2="${x1}" y2="${RAIL_OFFSET}" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`,
  ];
  return ties.join("") + rails.join("");
}

function arcPath(R: number, sweepDeg: number, offset: number): string {
  // Arc starts at (0, offset), centred at (0, R), sweeps CCW by sweepDeg.
  // End point of arc of radius (R - offset) (inner rail if offset positive,
  // outer rail if offset negative — we negate offset for the +Y rail).
  const r = R - offset;
  const a = deg2rad(sweepDeg);
  const ex = r * Math.sin(a);
  const ey = R - r * Math.cos(a);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  // Sweep flag: 1 = CCW in standard SVG, but we already flipped Y in the
  // outer <g>, so the on-screen sweep direction is 0.
  return `M ${0},${offset} A ${r} ${r} 0 ${largeArc} 0 ${ex} ${ey}`;
}

function renderCurve(piece: ExtendedGeom, opts: SvgOptions): string {
  if (!piece.arc) return "";
  const R = piece.arc.radius_mm;
  const sweep = piece.arc.sweep_deg;
  const railColor = opts.railColor ?? "#444";
  const tieColor = opts.tieColor ?? "#222";
  const inner = `<path d="${arcPath(R, sweep, +RAIL_OFFSET)}" fill="none" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`;
  const outer = `<path d="${arcPath(R, sweep, -RAIL_OFFSET)}" fill="none" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`;
  // Ties: short radial segments every ~8mm of arc length.
  const ties: string[] = [];
  const arcLen = (R * sweep * Math.PI) / 180;
  const tieCount = Math.max(2, Math.floor(arcLen / 8));
  for (let i = 1; i < tieCount; i++) {
    const t = i / tieCount;
    const ang = deg2rad(sweep * t);
    const cx = R * Math.sin(ang);
    const cy = R - R * Math.cos(ang);
    const nx = Math.sin(ang);
    const ny = -Math.cos(ang);
    const x1 = cx + nx * TIE_HALF_HEIGHT;
    const y1 = cy + ny * TIE_HALF_HEIGHT;
    const x2 = cx - nx * TIE_HALF_HEIGHT;
    const y2 = cy - ny * TIE_HALF_HEIGHT;
    ties.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tieColor}" stroke-width="${TIE_STROKE}"/>`);
  }
  return ties.join("") + inner + outer;
}

function renderTurnout(piece: ExtendedGeom, opts: SvgOptions): string {
  if (!piece.turnout) return "";
  const t = piece.turnout;
  const railColor = opts.railColor ?? "#444";
  // Straight branch from A → B
  const straight = renderStraight(
    {
      ...piece,
      connections: [
        { id: "A", position_mm: [0, 0], direction_deg: 180 },
        { id: "B", position_mm: [t.straight_length_mm, 0], direction_deg: 0 },
      ],
    } as ExtendedGeom,
    opts,
  );
  // Diverging branch as an arc
  const sign = t.hand === "R" ? -1 : 1;
  const a = deg2rad(t.diverge_deg);
  const ex = t.radius_mm * Math.sin(a);
  const ey = sign * t.radius_mm * (1 - Math.cos(a));
  // Inner/outer rails of the diverging branch
  const innerR = t.radius_mm - RAIL_OFFSET;
  const outerR = t.radius_mm + RAIL_OFFSET;
  const innerEnd: [number, number] = [innerR * Math.sin(a), sign * (t.radius_mm - innerR * Math.cos(a))];
  const outerEnd: [number, number] = [outerR * Math.sin(a), sign * (t.radius_mm - outerR * Math.cos(a))];
  const sweepFlag = sign === 1 ? 0 : 1; // SVG Y is flipped in <g> wrapper
  const innerPath = `<path d="M 0 ${sign * RAIL_OFFSET} A ${innerR} ${innerR} 0 0 ${sweepFlag} ${innerEnd[0]} ${innerEnd[1]}" fill="none" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`;
  const outerPath = `<path d="M 0 ${-sign * RAIL_OFFSET} A ${outerR} ${outerR} 0 0 ${sweepFlag} ${outerEnd[0]} ${outerEnd[1]}" fill="none" stroke="${railColor}" stroke-width="${RAIL_STROKE}"/>`;
  // Mark the diverging end point with a small circle so the user can see "C".
  const cMark = `<circle cx="${ex}" cy="${ey}" r="1" fill="${railColor}"/>`;
  return straight + innerPath + outerPath + cMark;
}

function renderDoubleStraight(piece: ExtendedGeom, opts: SvgOptions): string {
  const spacing = piece.double_track?.spacing_mm ?? 33;
  const a = piece.connections[0]!;
  const b = piece.connections[1]!;
  const L = b.position_mm[0] - a.position_mm[0];
  const single = (yOffset: number) => `<g transform="translate(0,${yOffset})">` + renderStraight(
    { code: piece.code, connections: [
      { id: "A", position_mm: [0, 0], direction_deg: 180 },
      { id: "B", position_mm: [L, 0], direction_deg: 0 },
    ] } as ExtendedGeom, opts) + "</g>";
  return single(0) + single(spacing);
}

function computeViewBox(piece: ExtendedGeom): { x: number; y: number; w: number; h: number } {
  // Sample every connector + arc center proxy.
  let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of piece.connections) {
    const [x, y] = c.position_mm;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (piece.arc) {
    // For curves, include the apex of the arc which can be above the chord.
    const a = deg2rad(piece.arc.sweep_deg / 2);
    const apexY = piece.arc.radius_mm - piece.arc.radius_mm * Math.cos(a);
    if (apexY > maxY) maxY = apexY;
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
  // Pad for rail width.
  return {
    x: minX,
    y: minY - TIE_HALF_HEIGHT - 1,
    w: maxX - minX,
    h: maxY - minY + 2 * TIE_HALF_HEIGHT + 2,
  };
}

/**
 * Render the inner SVG body of a piece (rails + ties, no `<svg>` wrapper).
 * Returns null if the piece cannot be drawn procedurally.
 *
 * This is the single source of truth for piece markup. `renderPieceSvg`
 * wraps this with an `<svg>` header/footer; `renderLayoutToSvgString`
 * composes many bodies into one shared `<svg>` document.
 */
export function renderPieceBody(
  piece: PieceGeometry & { arc?: ExtendedGeom["arc"]; turnout?: ExtendedGeom["turnout"]; double_track?: ExtendedGeom["double_track"] },
  opts: SvgOptions = {},
): string | null {
  const p = piece as ExtendedGeom;
  if (!p.connections || p.connections.length === 0) return null;
  if (p.turnout) return renderTurnout(p, opts);
  if (p.arc) return renderCurve(p, opts);
  if (p.double_track && p.connections.length === 4) return renderDoubleStraight(p, opts);
  if (p.connections.length === 2 && p.connections[0]!.position_mm[1] === 0) {
    return renderStraight(p, opts);
  }
  return null;
}

/**
 * Render a piece to a standalone SVG string. Returns null if the piece
 * cannot be drawn procedurally (no geometry / accessory).
 */
export function renderPieceSvg(
  piece: PieceGeometry & { arc?: ExtendedGeom["arc"]; turnout?: ExtendedGeom["turnout"]; double_track?: ExtendedGeom["double_track"]; type?: string },
  opts: SvgOptions = {},
): string | null {
  const body = renderPieceBody(piece, opts);
  if (body === null) return null;
  const vb = opts.viewBoxMm ?? computeViewBox(piece as ExtendedGeom);
  return svgHeader(vb, opts) + body + svgFooter();
}

// ---------------------------------------------------------------------------
// Whole-layout renderer
// ---------------------------------------------------------------------------

export interface LayoutSvgOptions extends SvgOptions {
  /** Draw the rectangular board outline at (0,0,width,height). Default true. */
  readonly showBoard?: boolean;
  /** Draw a mm-aligned grid. Default false. */
  readonly showGrid?: boolean;
  /** Padding around the computed content bbox, in mm. Default 25. */
  readonly contentPaddingMm?: number;
  /** Optional bg colour applied as a `<rect>` behind everything. */
  readonly backgroundColor?: string;
}

interface LayoutLike {
  readonly placements: ReadonlyArray<{
    readonly id: string;
    readonly code: string;
    readonly position_mm: Vec2 | readonly [number, number];
    readonly rotation_deg: number;
    readonly mirrored: boolean;
  }>;
  readonly board_mm?: { readonly width: number; readonly height: number };
}

/**
 * Compose every Placement in a Layout into a single SVG document
 * suitable for download or rasterization. No external resources are
 * referenced; the output is fully self-contained inline SVG.
 *
 * SECURITY NOTE: this function ONLY emits inline primitives produced by
 * renderPieceBody (lines, paths, circles). It does NOT embed <image>,
 * external <link>, CSS url() references or untrusted strings, which
 * keeps the resulting Canvas un-tainted and safe to toDataURL() later.
 */
export function renderLayoutToSvgString(
  layout: LayoutLike,
  geometryMap: ReadonlyMap<string, PieceGeometry>,
  options: LayoutSvgOptions = {},
): string {
  const tieColor = options.tieColor ?? "#cbd5e1";
  const railColor = options.railColor ?? "#fbbf24";
  const showBoard = options.showBoard ?? true;
  const showGrid = options.showGrid ?? false;
  const pad = options.contentPaddingMm ?? 25;

  // 1. Compute content bbox across all placements (in world mm).
  let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
  const accum = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of layout.placements) {
    const geom = geometryMap.get(p.code);
    if (!geom) continue;
    const sy = p.mirrored ? -1 : 1;
    const rad = (p.rotation_deg * Math.PI) / 180;
    const cosR = Math.cos(rad), sinR = Math.sin(rad);
    const sample = (lx: number, ly: number) => {
      const wx = p.position_mm[0] + lx * cosR - sy * ly * sinR;
      const wy = p.position_mm[1] + lx * sinR + sy * ly * cosR;
      accum(wx, wy);
    };
    for (const c of geom.connections) sample(c.position_mm[0], c.position_mm[1]);
    if (geom.footprint_mm) {
      const w = geom.footprint_mm.width, h = geom.footprint_mm.height;
      sample(0, -h / 2); sample(w, -h / 2); sample(0, h / 2); sample(w, h / 2);
    }
  }
  if (showBoard && layout.board_mm) {
    accum(0, 0);
    accum(layout.board_mm.width, layout.board_mm.height);
  }
  if (!Number.isFinite(minX)) {
    // Empty layout: tiny default viewBox so the SVG is still well-formed.
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }
  // viewBox must compensate for the outer `scale(1,-1)`: every world
  // point (x, y) renders at SVG (x, -y), so the SVG Y range covers
  // [-maxY, -minY]. The viewBox Y origin (top-left of the visible box)
  // is therefore -maxY - pad. Width unchanged.
  const vbX = minX - pad;
  const vbW = (maxX - minX) + 2 * pad;
  const vbH = (maxY - minY) + 2 * pad;
  const vbY = -maxY - pad;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet">`,
  );
  if (options.backgroundColor) {
    parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${escapeAttr(options.backgroundColor)}"/>`);
  }
  // Flip Y once for the whole document so all child coords use the
  // engine's +Y-up convention.
  parts.push(`<g transform="scale(1,-1)">`);

  // Mirror the flip with translate(0, -2*midY) inside the group is not
  // needed because viewBox is centered around the same Y range; the
  // outer scale flips the Y axis and the child <g transforms compose
  // accordingly.

  if (showGrid) {
    // The grid is inside the <g scale(1,-1)> group, so it lives in
    // world space. Pass the world-coord bbox, not the SVG-coord viewBox.
    parts.push(renderGrid(minX - pad, minY - pad, vbW, vbH));
  }
  if (showBoard && layout.board_mm) {
    parts.push(
      `<rect x="0" y="0" width="${layout.board_mm.width}" height="${layout.board_mm.height}" fill="none" stroke="#3f3f46" stroke-dasharray="8 8" stroke-width="1"/>`,
    );
  }

  for (const p of layout.placements) {
    const geom = geometryMap.get(p.code);
    if (!geom) continue;
    const body = renderPieceBody(geom, { tieColor, railColor });
    if (!body) continue;
    const mirror = p.mirrored ? " scale(1, -1)" : "";
    parts.push(
      `<g transform="translate(${p.position_mm[0]} ${p.position_mm[1]}) rotate(${p.rotation_deg})${mirror}" data-placement-id="${escapeAttr(p.id)}" data-code="${escapeAttr(p.code)}">${body}</g>`,
    );
  }

  parts.push(`</g></svg>`);
  return parts.join("");
}

function renderGrid(x: number, y: number, w: number, h: number, step = 50): string {
  const lines: string[] = [];
  const minVX = Math.ceil(x / step) * step;
  const maxVX = Math.floor((x + w) / step) * step;
  const minHY = Math.ceil(y / step) * step;
  const maxHY = Math.floor((y + h) / step) * step;
  for (let vx = minVX; vx <= maxVX; vx += step) {
    lines.push(`<line x1="${vx}" y1="${y}" x2="${vx}" y2="${y + h}" stroke="#27272a" stroke-width="0.3"/>`);
  }
  for (let hy = minHY; hy <= maxHY; hy += step) {
    lines.push(`<line x1="${x}" y1="${hy}" x2="${x + w}" y2="${hy}" stroke="#27272a" stroke-width="0.3"/>`);
  }
  return `<g data-grid="1">${lines.join("")}</g>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
