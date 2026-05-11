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
 * Render a piece to an SVG string. Returns null if the piece cannot be
 * drawn procedurally (no geometry / accessory).
 */
export function renderPieceSvg(
  piece: PieceGeometry & { arc?: ExtendedGeom["arc"]; turnout?: ExtendedGeom["turnout"]; double_track?: ExtendedGeom["double_track"]; type?: string },
  opts: SvgOptions = {},
): string | null {
  const p = piece as ExtendedGeom & { type?: string };
  if (!p.connections || p.connections.length === 0) return null;

  let body = "";
  if (p.turnout) {
    body = renderTurnout(p, opts);
  } else if (p.arc) {
    body = renderCurve(p, opts);
  } else if (p.double_track && p.connections.length === 4) {
    body = renderDoubleStraight(p, opts);
  } else if (p.connections.length === 2 && p.connections[0]!.position_mm[1] === 0) {
    body = renderStraight(p, opts);
  } else {
    return null;
  }

  const vb = opts.viewBoxMm ?? computeViewBox(p);
  return svgHeader(vb, opts) + body + svgFooter();
}
