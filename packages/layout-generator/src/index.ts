/**
 * Layout generator entry point.
 *
 * Calling generateLayouts() runs every registered strategy, validates
 * each candidate against the geometry engine, and returns only the
 * candidates that pass. The engine is the final authority — if a
 * strategy returned a layout that didn't validate, we drop it rather
 * than "fixing" the geometry on the strategy's behalf.
 */

import { validate, DEFAULT_TOLERANCES } from "@kato-unitrack/geometry-engine";
import type {
  GeneratedLayout,
  LayoutGeneratorInput,
  LayoutStrategy,
} from "./types.js";
import { OvalDoubleStrategy, OvalSimpleStrategy } from "./oval.js";

export * from "./types.js";
export * from "./oval.js";

export const DEFAULT_STRATEGIES: ReadonlyArray<LayoutStrategy> = [
  new OvalSimpleStrategy(),
  new OvalDoubleStrategy(),
];

export interface GenerateResult {
  readonly layout: GeneratedLayout;
  readonly warnings: readonly string[];
}

export function generateLayouts(
  input: LayoutGeneratorInput,
  strategies: ReadonlyArray<LayoutStrategy> = DEFAULT_STRATEGIES,
): GenerateResult[] {
  const out: GenerateResult[] = [];
  const geom = input.catalog.geometryMap();
  for (const strategy of strategies) {
    for (const cand of strategy.generate(input)) {
      const result = validate(
        { placements: cand.placements, attachments: cand.attachments },
        geom,
        DEFAULT_TOLERANCES,
      );
      if (!result.ok) continue;
      out.push({ layout: cand, warnings: result.warnings });
    }
  }
  return out;
}
