/**
 * Provider registry.
 *
 * Each adapter ships with a stub network implementation. With no API
 * key, every adapter throws a clear "no key configured" error from
 * generateLayoutSuggestion(). Once a key is set the adapter is real.
 *
 * The actual network calls are intentionally minimal — the goal of
 * this MVP is to nail the *contract* (symbolic LayoutProposal) so that
 * provider implementations can be swapped without touching the rest of
 * the app.
 */

import type { CatalogIndex } from "@kato-unitrack/catalog";
import {
  addPiece,
  emptyInventory,
  type Inventory,
} from "@kato-unitrack/inventory";
import { generateLayouts } from "@kato-unitrack/layout-generator";
import type { AIProvider, AIProviderInput, LayoutProposal } from "./types.js";
import { proposalFromLayout } from "./proposalFromLayout.js";
import { OpenAIProvider as RealOpenAIProvider } from "./openai.js";

abstract class StubProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly displayName: string;
  protected apiKey: string | null = null;

  setApiKey(key: string | null): void {
    this.apiKey = key && key.length > 0 ? key : null;
  }

  get available(): boolean {
    return this.apiKey !== null;
  }

  async generateLayoutSuggestion(_input: AIProviderInput): Promise<LayoutProposal[]> {
    if (!this.apiKey) {
      throw new Error(`[ai-providers] ${this.id} has no API key configured`);
    }
    // Each provider would translate AIProviderInput into a system prompt +
    // function-calling schema for LayoutProposal here. We ship the
    // interface, not a fragile prompt; that lands in Fase 4 (see
    // docs/ROADMAP.md) so we can tune one model at a time.
    throw new Error(
      `[ai-providers] ${this.id}: network call not implemented in MVP. ` +
      `See docs/ROADMAP.md Fase 4 for the planned tool-use schema.`,
    );
  }
}

// Re-export the real OpenAI implementation under the name the rest of
// the app already imports. The provider lives in its own file so we
// don't drag the OpenAI SDK type imports into every consumer.
export { RealOpenAIProvider as OpenAIProvider };

export class ClaudeProvider extends StubProvider {
  readonly id = "claude";
  readonly displayName = "Anthropic Claude";
}
export class KimiProvider extends StubProvider {
  readonly id = "kimi";
  readonly displayName = "Moonshot Kimi";
}

/**
 * Local "auto-build" provider — no network involved. Drives the
 * deterministic layout-generator with the user's inventory, ranks the
 * candidates by piece count DESC (so the most-pieces-used appear
 * first, satisfying "maximizá el uso del inventario"), and converts
 * each to a symbolic LayoutProposal that the materializer can replay.
 *
 * Requires the caller to inject a CatalogIndex via setCatalog() before
 * the first call — the provider doesn't ship the catalog itself so the
 * dependency graph stays one-way (frontend ↑ ai-providers ↑ catalog).
 */
export class LocalDemoProvider implements AIProvider {
  readonly id = "local-demo";
  readonly displayName = "Local auto-build (sin red)";
  readonly available = true;
  private catalog: CatalogIndex | null = null;

  setCatalog(catalog: CatalogIndex): void {
    this.catalog = catalog;
  }

  async generateLayoutSuggestion(input: AIProviderInput): Promise<LayoutProposal[]> {
    if (!this.catalog) {
      throw new Error(
        "[local-demo] catalog not configured — call setCatalog(catalogIndex) first",
      );
    }
    // Build a synthetic inventory the layout-generator can consume.
    let inv: Inventory = emptyInventory(input.scale);
    for (const [code, qty] of Object.entries(input.availableInventory)) {
      if (qty > 0 && this.catalog.byCode.has(code)) {
        inv = addPiece(inv, code, qty);
      }
    }

    const results = generateLayouts({
      catalog: this.catalog,
      inventory: inv,
      board_mm: input.boardMm,
      scale: input.scale,
      preferences: { maxResults: 8 },
    });

    if (results.length === 0) return [];

    // Convert each generator output into a symbolic LayoutProposal.
    // Rank: total pieces used DESC, then strategy name for determinism.
    const proposals = results.map(({ layout }) => {
      const pieceCount = layout.placements.length;
      const usage = layout.inventory_usage ?? {};
      const usageStr = Object.entries(usage)
        .map(([k, v]) => `${v}×${k}`)
        .join(", ");
      const rationale =
        `Auto-build: ${pieceCount} piezas` +
        (usageStr ? ` (${usageStr})` : "") +
        (input.userIntent ? `. Intento del usuario: "${input.userIntent}".` : "");
      return {
        proposal: proposalFromLayout(layout, rationale),
        pieces: pieceCount,
        strategy: layout.strategy,
      };
    });
    proposals.sort((a, b) => {
      if (b.pieces !== a.pieces) return b.pieces - a.pieces;
      return a.strategy.localeCompare(b.strategy);
    });

    return proposals
      .slice(0, input.maxProposals ?? 3)
      .map((p) => p.proposal);
  }
}

export const PROVIDERS: ReadonlyMap<string, AIProvider> = new Map<string, AIProvider>([
  ["local-demo", new LocalDemoProvider()],
  ["openai", new RealOpenAIProvider()],
  ["claude", new ClaudeProvider()],
  ["kimi", new KimiProvider()],
]);
