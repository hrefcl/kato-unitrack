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
import type { CatalogIndex } from "@kato-unitrack/catalog";
import type {
  AIProvider,
  AIProviderInput,
  LayoutProposal,
} from "./types.js";
import { buildAIBrief, briefToMarkdown } from "./brief.js";

const DEFAULT_MODEL = "gpt-4o-mini";

/** Models the user can pick in the UI dropdown. */
export const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (rápido, económico)" },
  { id: "gpt-4o", label: "GPT-4o (preciso, costo medio)" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "o1-mini", label: "o1 mini (razonamiento)" },
  { id: "o3-mini", label: "o3 mini (razonamiento)" },
] as const;

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

function systemPrompt(): string {
  return `Eres un experto diseñador de maquetas KATO UNITRACK.

Recibís:
- un **brief estructurado** del inventario y formas factibles (pre-calculado por el motor)
- el tamaño del tablero
- la escala (N o HO)
- opcionalmente una intención del usuario en lenguaje natural

Tu trabajo: producir UN LayoutProposal que use la mayor cantidad de piezas posible formando una maqueta válida (loops cerrados cuando se pueda, sin auto-colisiones).

Un LayoutProposal es una SECUENCIA DE MOVIMIENTOS SIMBÓLICOS — nunca coordenadas:

  - place(ref, code): primera pieza, queda en el origen.
  - attach(ref, code, toRef, toConn, conn, mirrored?): la conexión \`conn\` de la pieza nueva se pega a \`toConn\` de la pieza existente \`toRef\`. El motor geométrico calcula la transformación.
  - link(from, fromConn, to, toConn): liga dos refs ya colocadas. Se usa para cerrar el loop (último conector libre con el primero).

REGLAS CRÍTICAS:
1. Usá SOLO códigos KATO presentes en el brief — nunca inventes.
2. Respetá los conectores: rectas y curvas tienen A y B. Turnouts tienen A (entrada), B (salida recta), C (salida divergente).
3. NO excedas las cantidades del brief.
4. El brief ya te dice qué formas son factibles y cuáles no. Empezá por la forma de la lista que esté marcada ✅ y que maximice piezas usadas.
5. Para cerrar un óvalo, el ÚLTIMO move debería ser un \`link\` entre el conector libre de la última pieza y el conector libre de la primera.
6. El motor valida con tolerancia 0.5 mm. Si tu propuesta no cierra exactamente, el motor la rechaza.

Salida: SOLO la llamada estructurada de la tool \`propose_layout\`. No escribas prosa fuera del argumento.`;
}

function userPrompt(input: AIProviderInput, catalog: CatalogIndex): string {
  const brief = buildAIBrief(
    catalog,
    input.availableInventory,
    input.boardMm,
    input.scale,
  );
  return `${briefToMarkdown(brief)}

${input.userIntent ? `## Intención del usuario\n"${input.userIntent}"\n` : ""}
## Tarea
Proponé UN layout que use la mayor cantidad de piezas posible respetando el brief.`;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  private apiKey: string | null = null;
  private catalog: CatalogIndex | null = null;
  private model: string = DEFAULT_MODEL;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  setApiKey(key: string | null): void {
    this.apiKey = key && key.length > 0 ? key : null;
  }

  setCatalog(catalog: CatalogIndex): void {
    this.catalog = catalog;
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  /** Expose the brief for the UI's "Ver contexto enviado" panel. */
  buildBrief(input: AIProviderInput) {
    if (!this.catalog) return null;
    return buildAIBrief(this.catalog, input.availableInventory, input.boardMm, input.scale);
  }

  /** Expose the prompt strings the model will see. */
  buildPromptPreview(input: AIProviderInput): { system: string; user: string } | null {
    if (!this.catalog) return null;
    return { system: systemPrompt(), user: userPrompt(input, this.catalog) };
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
