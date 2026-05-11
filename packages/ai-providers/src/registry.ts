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

import type { AIProvider, AIProviderInput, LayoutProposal } from "./types.js";

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

export class OpenAIProvider extends StubProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
}
export class ClaudeProvider extends StubProvider {
  readonly id = "claude";
  readonly displayName = "Anthropic Claude";
}
export class KimiProvider extends StubProvider {
  readonly id = "kimi";
  readonly displayName = "Moonshot Kimi";
}

/** A no-op provider that returns hand-coded proposals for offline demos. */
export class LocalDemoProvider implements AIProvider {
  readonly id = "local-demo";
  readonly displayName = "Local demo (no network)";
  readonly available = true;

  async generateLayoutSuggestion(input: AIProviderInput): Promise<LayoutProposal[]> {
    // Suggest a simple oval if the user has the right pieces. This is
    // illustrative; the real proposal engine is the layout-generator.
    const has = (code: string, n: number) => (input.availableInventory[code] ?? 0) >= n;
    const out: LayoutProposal[] = [];
    if (has("20-120", 8) && has("20-000", 2)) {
      out.push({
        name: "Classic R315-45 oval",
        rationale: "You have ≥8 R315-45 curves and ≥2 S248 straights, enough to close a basic oval.",
        moves: [
          { kind: "place", ref: "s0", code: "20-000" },
          { kind: "attach", ref: "c0", code: "20-120", toRef: "s0", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c1", code: "20-120", toRef: "c0", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c2", code: "20-120", toRef: "c1", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c3", code: "20-120", toRef: "c2", toConn: "B", conn: "A" },
          { kind: "attach", ref: "s1", code: "20-000", toRef: "c3", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c4", code: "20-120", toRef: "s1", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c5", code: "20-120", toRef: "c4", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c6", code: "20-120", toRef: "c5", toConn: "B", conn: "A" },
          { kind: "attach", ref: "c7", code: "20-120", toRef: "c6", toConn: "B", conn: "A" },
        ],
      });
    }
    return out.slice(0, input.maxProposals ?? 3);
  }
}

export const PROVIDERS: ReadonlyMap<string, AIProvider> = new Map([
  ["local-demo", new LocalDemoProvider()],
  ["openai", new OpenAIProvider()],
  ["claude", new ClaudeProvider()],
  ["kimi", new KimiProvider()],
]);
