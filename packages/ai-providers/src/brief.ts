/**
 * AI Brief — pre-computed structural analysis the model receives along
 * with the raw inventory. Doing this in code (instead of trusting the
 * model to derive it) means:
 *
 *   1. The model gets correct answers about closure math, double-track
 *      spacing, footprint feasibility — facts the algorithm knows for
 *      sure.
 *   2. The model spends its tokens on layout creativity, not on
 *      re-deriving KATO geometry.
 *   3. The user can read the brief in the UI and decide if anything
 *      missing should be added by hand.
 *
 * The brief is exposed both as a typed object (for the UI panel) and
 * formatted as Markdown for the model's user-prompt.
 */

import type { CatalogIndex, PieceDefinition } from "@kato-unitrack/catalog";

const N_DOUBLE_TRACK_SPACING_MM = 33;
const HO_DOUBLE_TRACK_SPACING_MM = 40;

export interface CurveInfo {
  code: string;
  abbreviation: string;
  radius_mm: number;
  angle_degrees: number;
  available: number;
  /** Pieces of this code needed to close a 360° loop. */
  neededFor360: number;
  /** True if available ≥ neededFor360. */
  canCloseSolo: boolean;
}

export interface StraightInfo {
  code: string;
  abbreviation: string;
  length_mm: number;
  available: number;
}

export interface TurnoutInfo {
  code: string;
  abbreviation: string;
  radius_mm: number;
  diverge_deg: number;
  hand: "L" | "R" | "Wye";
  available: number;
}

export interface FeasibleShape {
  name: string;
  description: string;
  requires: string;
  canBuild: boolean;
  reason?: string;
}

export interface BoardConstraints {
  width_mm: number;
  height_mm: number;
  /** Maximum curve radius that fits in the smaller axis. */
  maxFittingRadius_mm: number;
}

export interface AIBrief {
  scale: string;
  totalPieces: number;
  snappableCount: number;
  curves: CurveInfo[];
  straights: StraightInfo[];
  turnouts: TurnoutInfo[];
  /** Pairs of curve codes that are exactly one double-track spacing apart. */
  concentricCurvePairs: Array<{ outer: string; inner: string; spacing_mm: number }>;
  feasibleShapes: FeasibleShape[];
  board: BoardConstraints;
}

export function buildAIBrief(
  catalog: CatalogIndex,
  availableInventory: Record<string, number>,
  board: { width: number; height: number },
  scale: string,
): AIBrief {
  const spacing = scale === "HO" ? HO_DOUBLE_TRACK_SPACING_MM : N_DOUBLE_TRACK_SPACING_MM;

  // Filter to only the codes the user actually owns.
  const owned = Object.entries(availableInventory)
    .filter(([code, qty]) => qty > 0 && catalog.byCode.has(code))
    .map(([code, qty]) => ({ piece: catalog.mustGet(code), qty }));

  const curves: CurveInfo[] = owned
    .filter(({ piece }) => piece.type === "curve" && piece.radius_mm && piece.angle_degrees)
    .map(({ piece, qty }) => {
      const needed = Math.ceil(360 / piece.angle_degrees!);
      return {
        code: piece.code,
        abbreviation: piece.abbreviation ?? piece.code,
        radius_mm: piece.radius_mm!,
        angle_degrees: piece.angle_degrees!,
        available: qty,
        neededFor360: needed,
        canCloseSolo: qty >= needed,
      };
    })
    .sort((a, b) => b.radius_mm - a.radius_mm);

  const straights: StraightInfo[] = owned
    .filter(({ piece }) => piece.type === "straight" && piece.length_mm)
    .map(({ piece, qty }) => ({
      code: piece.code,
      abbreviation: piece.abbreviation ?? piece.code,
      length_mm: piece.length_mm!,
      available: qty,
    }))
    .sort((a, b) => b.length_mm - a.length_mm);

  const turnouts: TurnoutInfo[] = owned
    .filter(({ piece }) => piece.type === "turnout" && piece.turnout)
    .map(({ piece, qty }) => ({
      code: piece.code,
      abbreviation: piece.abbreviation ?? piece.code,
      radius_mm: piece.turnout!.radius_mm,
      diverge_deg: piece.turnout!.diverge_deg,
      hand: piece.turnout!.hand,
      available: qty,
    }))
    .sort((a, b) => b.radius_mm - a.radius_mm);

  // Concentric curve pairs for double-oval feasibility.
  const concentricCurvePairs: AIBrief["concentricCurvePairs"] = [];
  for (const outer of curves) {
    const inner = curves.find(
      (c) => Math.abs(outer.radius_mm - c.radius_mm - spacing) < 0.5,
    );
    if (inner) {
      concentricCurvePairs.push({
        outer: outer.code,
        inner: inner.code,
        spacing_mm: spacing,
      });
    }
  }

  // Board constraints.
  const minAxis = Math.min(board.width, board.height);
  const maxFittingRadius_mm = Math.floor(minAxis / 2);

  // Feasibility of common layout primitives.
  const feasibleShapes: FeasibleShape[] = [];

  const fittingCurves = curves.filter((c) => c.radius_mm * 2 <= board.height);
  const ovalCandidate = fittingCurves.find((c) => c.canCloseSolo);
  feasibleShapes.push({
    name: "Óvalo simple",
    description: "8×45° (o 24×15°) curvas en serie + rectas a los lados.",
    requires: "≥1 radio con piezas suficientes para 360°",
    canBuild: !!ovalCandidate,
    reason: ovalCandidate
      ? `Mejor candidato: ${ovalCandidate.abbreviation} (${ovalCandidate.available} disp, necesita ${ovalCandidate.neededFor360}).`
      : "Ningún radio tiene suficientes piezas para cerrar 360° dentro del tablero.",
  });

  const doubleOvalPair = concentricCurvePairs.find((pair) => {
    const outer = curves.find((c) => c.code === pair.outer);
    const inner = curves.find((c) => c.code === pair.inner);
    return (
      outer?.canCloseSolo &&
      inner?.canCloseSolo &&
      (outer?.radius_mm ?? 0) * 2 <= board.height
    );
  });
  feasibleShapes.push({
    name: "Óvalo doble (concéntrico)",
    description: `Dos óvalos a ${spacing} mm de separación radial (estándar KATO).`,
    requires: `dos radios diferenciados en exactamente ${spacing} mm, cada uno con ≥8 piezas`,
    canBuild: !!doubleOvalPair,
    reason: doubleOvalPair
      ? `${doubleOvalPair.outer} (exterior) + ${doubleOvalPair.inner} (interior).`
      : `No tenés dos radios separados ${spacing} mm con stock suficiente.`,
  });

  const sameTurnoutPair =
    turnouts.filter((t) => t.hand === "L").length > 0 &&
    turnouts.filter((t) => t.hand === "R").length > 0;
  feasibleShapes.push({
    name: "Passing siding (crossover)",
    description: "Óvalo doble + 2 turnouts (1L + 1R) que cruzan vías.",
    requires: "óvalo doble factible + 1 turnout L + 1 turnout R del mismo radio",
    canBuild: !!doubleOvalPair && sameTurnoutPair,
    reason: !doubleOvalPair
      ? "Falta el óvalo doble base."
      : !sameTurnoutPair
      ? "Falta al menos 1 turnout L y 1 turnout R."
      : "Tenés los componentes; verificá que los radios de turnout y curvas coincidan.",
  });

  feasibleShapes.push({
    name: "Patio de maniobras",
    description: "N turnouts en serie + rectas de fondo (siding/yard).",
    requires: "≥2 turnouts del mismo hand",
    canBuild: turnouts.filter((t) => t.hand === "L").length >= 2 ||
              turnouts.filter((t) => t.hand === "R").length >= 2,
    reason:
      turnouts.length === 0
        ? "Sin turnouts en inventario."
        : `Tenés ${turnouts.length} turnouts en total.`,
  });

  return {
    scale,
    totalPieces: owned.reduce((n, { qty }) => n + qty, 0),
    snappableCount: owned.filter(({ piece }) => piece.snappable).reduce((n, { qty }) => n + qty, 0),
    curves,
    straights,
    turnouts,
    concentricCurvePairs,
    feasibleShapes,
    board: { width_mm: board.width, height_mm: board.height, maxFittingRadius_mm },
  };
}

/**
 * Render the brief as Markdown for the model's user prompt. The
 * structure deliberately mirrors how a human modeler thinks about a
 * KATO inventory: shapes you can build → curves → straights → turnouts.
 */
export function briefToMarkdown(b: AIBrief): string {
  const lines: string[] = [];
  lines.push(`## Inventario disponible — escala ${b.scale}`);
  lines.push(`Total: ${b.totalPieces} piezas (${b.snappableCount} snappables).`);
  lines.push(`Tablero: ${b.board.width_mm} × ${b.board.height_mm} mm. Radio máximo que entra: ${b.board.maxFittingRadius_mm} mm.`);
  lines.push("");

  lines.push("## Formas que el inventario permite armar (pre-calculado)");
  for (const f of b.feasibleShapes) {
    lines.push(`- ${f.canBuild ? "✅" : "❌"} **${f.name}** — ${f.description}`);
    lines.push(`  Requisito: ${f.requires}. ${f.reason ?? ""}`);
  }
  lines.push("");

  if (b.curves.length > 0) {
    lines.push("## Curvas (radio · ángulo · stock · piezas-para-360°)");
    for (const c of b.curves) {
      const flag = c.canCloseSolo ? "✓" : "✗";
      lines.push(
        `- ${flag} ${c.code} (${c.abbreviation}) R=${c.radius_mm}mm ${c.angle_degrees}° · stock ${c.available} · necesita ${c.neededFor360} para cerrar 360°`,
      );
    }
    lines.push("");
  }
  if (b.concentricCurvePairs.length > 0) {
    lines.push("## Pares concéntricos (double-track compatibles)");
    for (const p of b.concentricCurvePairs) {
      lines.push(`- ${p.outer} (exterior) ↔ ${p.inner} (interior) · separación ${p.spacing_mm} mm`);
    }
    lines.push("");
  }
  if (b.straights.length > 0) {
    lines.push("## Rectas (longitud · stock)");
    for (const s of b.straights) {
      lines.push(`- ${s.code} (${s.abbreviation}) L=${s.length_mm}mm · stock ${s.available}`);
    }
    lines.push("");
  }
  if (b.turnouts.length > 0) {
    lines.push("## Turnouts (radio · ángulo de divergencia · mano · stock)");
    for (const t of b.turnouts) {
      lines.push(
        `- ${t.code} (${t.abbreviation}) R=${t.radius_mm}mm ${t.diverge_deg}° hand=${t.hand} · stock ${t.available}`,
      );
    }
    lines.push("");
  }

  lines.push("## Reglas de geometría que TU propuesta debe respetar");
  lines.push("- Conectores: rectas y curvas tienen A (entrada) y B (salida). Turnouts: A (entrada), B (salida recta), C (salida divergente).");
  lines.push("- Toda pieza tiene cantidad finita en el inventario. NO uses más de lo disponible.");
  lines.push("- Para cerrar un loop, el último `attach` debe dejar el último conector libre coincidiendo con un conector libre del primer piece. Usá `link` para declarar ese cierre.");
  lines.push(`- Espaciado double-track estándar KATO en escala ${b.scale}: ${b.scale === "HO" ? HO_DOUBLE_TRACK_SPACING_MM : N_DOUBLE_TRACK_SPACING_MM} mm.`);
  lines.push("- El motor geométrico **valida y rechaza** cualquier propuesta que no cierre dentro de 0.5 mm o que colisione. No tiene sentido proponer algo que sabés que no cierra.");

  return lines.join("\n");
}
