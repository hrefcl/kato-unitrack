/**
 * Real OpenAI provider — uses Chat Completions with structured output
 * (tool calling) to coerce GPT into emitting a valid LayoutProposal.
 *
 * Contract: same as every AIProvider. The user supplies an API key
 * via setApiKey(); the call returns a list of LayoutProposals which
 * the materializer then turns into Layouts (and the geometry engine
 * validates / rejects). The model never invents coordinates — it only
 * picks pieces from the inventory and chains them via `place` /
 * `attach` / `link` moves.
 *
 * Default model: gpt-4o-mini — cheap, reliable structured output.
 * Caller can override via constructor.
 */

import OpenAI from "openai";
import type { CatalogIndex, PieceDefinition } from "@kato-unitrack/catalog";
import type {
  AIProvider,
  AIProviderInput,
  LayoutProposal,
} from "./types.js";

const DEFAULT_MODEL = "gpt-4o-mini";

// JSON Schema for a LayoutProposal — what we'll ask the model to emit.
// Hand-written to match ProposalMove in types.ts.
const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    rationale: { type: "string" },
    moves: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "place" },
              ref: { type: "string" },
              code: { type: "string" },
            },
            required: ["kind", "ref", "code"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "attach" },
              ref: { type: "string" },
              code: { type: "string" },
              toRef: { type: "string" },
              toConn: { type: "string" },
              conn: { type: "string" },
              mirrored: { type: "boolean" },
            },
            required: ["kind", "ref", "code", "toRef", "toConn", "conn"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "link" },
              from: { type: "string" },
              fromConn: { type: "string" },
              to: { type: "string" },
              toConn: { type: "string" },
            },
            required: ["kind", "from", "fromConn", "to", "toConn"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["name", "rationale", "moves"],
  additionalProperties: false,
} as const;

function pieceContract(p: PieceDefinition): string {
  const conn = p.connections
    .map((c) => `${c.id}@(${c.position_mm[0].toFixed(1)},${c.position_mm[1].toFixed(1)}) ${c.direction_deg}°`)
    .join(", ");
  const meta: string[] = [];
  if (p.length_mm) meta.push(`L=${p.length_mm}mm`);
  if (p.radius_mm) meta.push(`R=${p.radius_mm}mm`);
  if (p.angle_degrees) meta.push(`${p.angle_degrees}°`);
  if (p.turnout) meta.push(`turnout hand=${p.turnout.hand}`);
  return `${p.code} (${p.abbreviation ?? "?"}) ${meta.join(" ")} conns=[${conn}]`;
}

function systemPrompt(): string {
  return `You are an expert KATO UNITRACK model railroad layout designer.

You will be given:
- the user's available inventory (KATO Item # → quantity)
- the board size (mm)
- the scale (N / HO)
- optional intent in natural language

Your job: produce ONE LayoutProposal that uses as many pieces as possible while forming a geometrically valid layout (closed loops where possible, no self-collisions).

A LayoutProposal is a SEQUENCE OF SYMBOLIC MOVES — never world coordinates:

  - place(ref, code): the first piece. Sits at the origin in piece-local coordinates.
  - attach(ref, code, toRef, toConn, conn, mirrored?): the new piece's connector \`conn\` is glued to the existing piece toRef's connector toConn. The geometry engine computes the world transform.
  - link(from, fromConn, to, toConn): connects two existing refs. Used to close a loop (the last piece's free connector mates the first piece's free connector).

CRITICAL RULES:
1. Only use Item # codes present in the inventory list, never invent.
2. Respect connector identities: straights have A and B. Curves have A and B. Turnouts have A (entry), B (straight out), C (diverging out).
3. The conn/toConn names refer to connector IDs in the inventory schema. They are A/B for straights and curves; A/B/C for turnouts.
4. Don't exceed quantities. If inventory has 8 of code X, don't use more than 8.
5. A KATO oval needs 8×R-45° curves (any radius) plus straights. Each 45° curve advances the layout direction by 45° (CCW by default; set mirrored=true for CW).
6. For a closed oval, the LAST move should be a \`link\` between the last piece's free connector and the first piece's free connector.

Output ONLY the structured tool call. Do not write prose outside the tool argument.`;
}

function userPrompt(input: AIProviderInput, catalog: CatalogIndex): string {
  const inventoryLines: string[] = [];
  for (const [code, qty] of Object.entries(input.availableInventory)) {
    const p = catalog.byCode.get(code);
    if (!p) continue;
    if (!p.snappable) continue; // skip accessories
    inventoryLines.push(`  ×${qty}  ${pieceContract(p)}`);
  }
  return `Inventory:
${inventoryLines.join("\n")}

Board: ${input.boardMm.width} × ${input.boardMm.height} mm
Scale: ${input.scale}
${input.userIntent ? `User intent: "${input.userIntent}"` : ""}

Propose ONE layout that uses as many of these pieces as possible.`;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  private apiKey: string | null = null;
  private catalog: CatalogIndex | null = null;
  private readonly model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  setApiKey(key: string | null): void {
    this.apiKey = key && key.length > 0 ? key : null;
  }

  setCatalog(catalog: CatalogIndex): void {
    this.catalog = catalog;
  }

  get available(): boolean {
    return this.apiKey !== null;
  }

  async generateLayoutSuggestion(input: AIProviderInput): Promise<LayoutProposal[]> {
    if (!this.apiKey) throw new Error("[openai] no API key configured");
    if (!this.catalog) throw new Error("[openai] catalog not configured; call setCatalog() first");

    const client = new OpenAI({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(input, this.catalog) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "propose_layout",
            description: "Propose a KATO UNITRACK layout as a symbolic move sequence.",
            parameters: PROPOSAL_SCHEMA as Record<string, unknown>,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "propose_layout" } },
      temperature: 0.7,
    });

    const choice = response.choices[0];
    const tc = choice?.message.tool_calls?.[0];
    if (!tc || tc.function.name !== "propose_layout") {
      throw new Error("[openai] model did not produce a propose_layout tool call");
    }
    let parsed: LayoutProposal;
    try {
      parsed = JSON.parse(tc.function.arguments) as LayoutProposal;
    } catch (e) {
      throw new Error(`[openai] could not parse tool arguments: ${(e as Error).message}`);
    }
    if (!parsed.moves || !Array.isArray(parsed.moves)) {
      throw new Error("[openai] tool call missing moves array");
    }
    return [parsed];
  }
}
