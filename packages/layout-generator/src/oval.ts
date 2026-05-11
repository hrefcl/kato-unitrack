/**
 * Oval strategies: simple (single track) and double (two concentric tracks).
 *
 * The math:
 *
 *   A closed oval = 8 curves of 45° sweep (= 360°) + an even number of
 *   straights split across top and bottom. Footprint:
 *
 *     width  = N_straight_per_side × L_straight + 2 × R
 *     height = 2 × R
 *
 *   We pick the largest curve radius from inventory that:
 *     - has ≥ 8 copies in inventory,
 *     - has 45° sweep,
 *     - fits the board (2R ≤ board.height).
 *
 *   Then we pick the longest straight with ≥ 2 copies available
 *   (mirrored top/bottom), repeating until the oval as wide as possible
 *   while keeping width ≤ board.width.
 *
 * The output Layout is verified against the geometry engine via the
 * caller (`generate` returns a candidate; the entry point in
 * src/index.ts runs `validate`).
 */

import { available, type Inventory } from "@kato-unitrack/inventory";
import type { CatalogIndex, PieceDefinition } from "@kato-unitrack/catalog";
import type {
  Attachment,
  Placement,
  PieceGeometry,
} from "@kato-unitrack/geometry-engine";
import {
  connectionWorld,
  placementForAttach,
} from "@kato-unitrack/geometry-engine";
import type {
  GeneratedLayout,
  LayoutGeneratorInput,
  LayoutStrategy,
} from "./types.js";

function curvesByRadius(
  catalog: CatalogIndex,
  scale: string,
  sweep_deg: number,
): PieceDefinition[] {
  return catalog
    .byType.get("curve")
    ?.filter(
      (p) =>
        p.scale === scale &&
        Number.isFinite(p.radius_mm) &&
        Math.abs((p.angle_degrees ?? 0) - sweep_deg) < 0.01 &&
        p.connections.length === 2,
    )
    .sort((a, b) => (b.radius_mm ?? 0) - (a.radius_mm ?? 0)) ?? [];
}

function straightsBy(
  catalog: CatalogIndex,
  scale: string,
): PieceDefinition[] {
  return catalog
    .byType.get("straight")
    ?.filter(
      (p) =>
        p.scale === scale &&
        Number.isFinite(p.length_mm) &&
        p.connections.length === 2,
    )
    .sort((a, b) => (b.length_mm ?? 0) - (a.length_mm ?? 0)) ?? [];
}

function chainEndToEnd(
  pieces: ReadonlyArray<{ code: string; geom: PieceGeometry }>,
  startId: string,
): { placements: Placement[]; attachments: Attachment[] } {
  const placements: Placement[] = [];
  const attachments: Attachment[] = [];
  let prev: Placement | null = null;
  for (let i = 0; i < pieces.length; i++) {
    const cur = pieces[i]!;
    const id = `${startId}-${i}`;
    if (!prev) {
      placements.push({
        id,
        code: cur.code,
        position_mm: [0, 0],
        rotation_deg: 0,
        mirrored: false,
      });
    } else {
      const prevGeom = pieces[i - 1]!.geom;
      const prevB = connectionWorld(prevGeom, prevGeom.connections[1]!, prev);
      const next = placementForAttach(cur.geom, "A", prevB, {
        mirrored: false,
        placementId: id,
      });
      placements.push(next);
      attachments.push({
        a: { placementId: prev.id, connectionId: "B" },
        b: { placementId: id, connectionId: "A" },
      });
    }
    prev = placements[placements.length - 1]!;
  }
  return { placements, attachments };
}

interface OvalParams {
  curveCode: string;
  straightCode: string;
  straightsPerSide: number;
}

function buildOval(
  catalog: CatalogIndex,
  params: OvalParams,
): GeneratedLayout | { error: string } {
  const curve = catalog.byCode.get(params.curveCode);
  const straight = catalog.byCode.get(params.straightCode);
  if (!curve || !straight) return { error: "unknown piece code" };
  const R = curve.radius_mm ?? 0;
  const L = straight.length_mm ?? 0;
  if (R <= 0 || L <= 0) return { error: "missing geometry" };

  const curveGeom: PieceGeometry = catalog.asGeometry(curve.code);
  const straightGeom: PieceGeometry = catalog.asGeometry(straight.code);

  // Chain order: N straights → 4 curves (180°) → N straights → 4 curves (180°)
  const sequence: Array<{ code: string; geom: PieceGeometry }> = [];
  for (let i = 0; i < params.straightsPerSide; i++)
    sequence.push({ code: straight.code, geom: straightGeom });
  for (let i = 0; i < 4; i++) sequence.push({ code: curve.code, geom: curveGeom });
  for (let i = 0; i < params.straightsPerSide; i++)
    sequence.push({ code: straight.code, geom: straightGeom });
  for (let i = 0; i < 4; i++) sequence.push({ code: curve.code, geom: curveGeom });

  const { placements, attachments } = chainEndToEnd(sequence, "ov");

  // Close the loop: last connector to first connector.
  const first = placements[0]!;
  const last = placements[placements.length - 1]!;
  attachments.push({
    a: { placementId: last.id, connectionId: "B" },
    b: { placementId: first.id, connectionId: "A" },
  });

  // Compute footprint bounds for the result.
  const width = params.straightsPerSide * L + 2 * R;
  const height = 2 * R;

  const usage: Record<string, number> = {};
  usage[straight.code] = 2 * params.straightsPerSide;
  usage[curve.code] = 8;

  return {
    strategy: "oval-simple",
    name: `Oval ${curve.abbreviation ?? curve.code} × ${params.straightsPerSide}/side ${straight.abbreviation ?? straight.code}`,
    placements,
    attachments,
    board_mm: { width, height },
    inventory_usage: usage,
    notes: `${params.straightsPerSide * 2}×${L}mm straights + 8×${R}mm curves (R${R} 45°). Footprint ${Math.round(width)}×${Math.round(height)} mm.`,
  };
}

export class OvalSimpleStrategy implements LayoutStrategy {
  readonly name = "oval-simple";
  describe(): string {
    return "Single-track closed oval: 8 × R-45° curves + 2N × straights. Picks the largest curve radius and straight length that fit the board and the inventory.";
  }

  generate(input: LayoutGeneratorInput): GeneratedLayout[] {
    const { catalog, inventory, board_mm, scale } = input;
    const results: GeneratedLayout[] = [];
    const maxResults = input.preferences?.maxResults ?? 3;

    const curves = curvesByRadius(catalog, scale, 45);
    const straights = straightsBy(catalog, scale);

    for (const curve of curves) {
      const R = curve.radius_mm!;
      if (2 * R > board_mm.height) continue;
      if (available(inventory, curve.code) < 8) continue;

      for (const straight of straights) {
        const L = straight.length_mm!;
        const availStraight = available(inventory, straight.code);
        const availPerSide = Math.floor(availStraight / 2);
        if (availPerSide < 1) continue;
        const maxPerSide = Math.min(
          availPerSide,
          Math.floor((board_mm.width - 2 * R) / L),
        );
        if (maxPerSide < 1) continue;
        const built = buildOval(catalog, {
          curveCode: curve.code,
          straightCode: straight.code,
          straightsPerSide: maxPerSide,
        });
        if ("error" in built) continue;
        results.push(built);
        if (results.length >= maxResults) return results;
      }
    }
    return results;
  }
}

export class OvalDoubleStrategy implements LayoutStrategy {
  readonly name = "oval-double";
  describe(): string {
    return "Two concentric closed ovals using KATO's 33 mm (N) / 40 mm (HO) radial spacing. Produces parallel tracks for passing-train scenarios.";
  }

  generate(input: LayoutGeneratorInput): GeneratedLayout[] {
    const { catalog, inventory, board_mm, scale } = input;
    const SPACING = scale === "HO" ? 40 : 33;
    const results: GeneratedLayout[] = [];
    const maxResults = input.preferences?.maxResults ?? 2;

    const curves = curvesByRadius(catalog, scale, 45);
    const straights = straightsBy(catalog, scale);

    // For each pair of curves whose radii differ by exactly SPACING, try to
    // build two ovals sharing the same straights-per-side count.
    for (const outer of curves) {
      const innerCandidate = curves.find(
        (c) => Math.abs((outer.radius_mm! - c.radius_mm!) - SPACING) < 0.5,
      );
      if (!innerCandidate) continue;
      const inner = innerCandidate;
      if (2 * outer.radius_mm! > board_mm.height) continue;
      if (available(inventory, outer.code) < 8) continue;
      if (available(inventory, inner.code) < 8) continue;

      for (const straight of straights) {
        const L = straight.length_mm!;
        const availStraight = available(inventory, straight.code);
        const perSide = Math.floor(availStraight / 4); // two ovals × two sides
        if (perSide < 1) continue;
        const maxPerSide = Math.min(
          perSide,
          Math.floor((board_mm.width - 2 * outer.radius_mm!) / L),
        );
        if (maxPerSide < 1) continue;
        const ovalA = buildOval(catalog, {
          curveCode: outer.code,
          straightCode: straight.code,
          straightsPerSide: maxPerSide,
        });
        const ovalB = buildOval(catalog, {
          curveCode: inner.code,
          straightCode: straight.code,
          straightsPerSide: maxPerSide,
        });
        if ("error" in ovalA || "error" in ovalB) continue;
        // Shift the inner oval by SPACING in Y so it sits concentric.
        const shifted = {
          ...ovalB,
          placements: ovalB.placements.map((p) => ({
            ...p,
            id: `in-${p.id}`,
            position_mm: [p.position_mm[0], p.position_mm[1] + SPACING] as [number, number],
          })),
          attachments: ovalB.attachments.map((a) => ({
            a: { placementId: `in-${a.a.placementId}`, connectionId: a.a.connectionId },
            b: { placementId: `in-${a.b.placementId}`, connectionId: a.b.connectionId },
          })),
        };
        const usage: Record<string, number> = {};
        for (const [k, v] of Object.entries(ovalA.inventory_usage)) usage[k] = (usage[k] ?? 0) + v;
        for (const [k, v] of Object.entries(shifted.inventory_usage)) usage[k] = (usage[k] ?? 0) + v;
        results.push({
          strategy: "oval-double",
          name: `Double oval: outer R${outer.radius_mm} / inner R${inner.radius_mm}, ${maxPerSide}/side ${straight.abbreviation ?? straight.code}`,
          placements: [...ovalA.placements, ...shifted.placements],
          attachments: [...ovalA.attachments, ...shifted.attachments],
          board_mm: { width: ovalA.board_mm.width, height: ovalA.board_mm.height + SPACING },
          inventory_usage: usage,
          notes: `Two concentric ovals, ${SPACING}mm radial spacing.`,
        });
        if (results.length >= maxResults) return results;
      }
    }
    return results;
  }
}
