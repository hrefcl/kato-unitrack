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
import { validate } from "@kato-unitrack/geometry-engine";
import type {
  AIProvider,
  AIProviderInput,
  LayoutProposal,
} from "./types.js";
import { buildAIBrief, briefToMarkdown } from "./brief.js";
import { materializeProposal } from "./materialize.js";

/**
 * Default model — the most capable in the frontier tier. The user
 * explicitly asked for "highest-end available, models below produce
 * worse results", so the list below is sorted by descending capacity:
 * pick anything lower only if you need cheaper / faster.
 */
const DEFAULT_MODEL = "gpt-5.5-pro";

export const OPENAI_MODELS = [
  // Frontier — recommended for layout design.
  { id: "gpt-5.5-pro", label: "GPT-5.5 Pro (frontier, máxima precisión)" },
  { id: "gpt-5.5",     label: "GPT-5.5 (frontier)" },
  { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { id: "gpt-5.4",     label: "GPT-5.4 (más económico)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini (rápido)" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano (más barato)" },
  // Previous-gen reasoning.
  { id: "gpt-5",       label: "GPT-5 (razonamiento)" },
  { id: "gpt-5-mini",  label: "GPT-5 mini" },
  { id: "gpt-5-nano",  label: "GPT-5 nano (alta volumen)" },
  // Older non-reasoning fallback.
  { id: "gpt-4.1",     label: "GPT-4.1 (no-razonamiento, fallback)" },
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
  return `Eres un diseñador EXPERTO Y AMBICIOSO de maquetas KATO UNITRACK.

Recibís: brief estructurado del inventario, tablero, escala, intención del usuario.

Producís UN LayoutProposal — secuencia de movimientos simbólicos (NUNCA coordenadas):

  - place(ref, code): primera pieza, queda en el origen.
  - attach(ref, code, toRef, toConn, conn, mirrored?): pega \`conn\` de la nueva pieza a \`toConn\` de toRef.
  - link(from, fromConn, to, toConn): liga dos refs YA COLOCADOS (cerrar loops sin colocar nueva pieza).

## OBJETIVO PRINCIPAL: USÁ TODO

Tu propuesta DEBE usar **al menos el 80%** de las piezas snappable del inventario. Un óvalo simple de 12 piezas cuando hay 49 disponibles es una propuesta MEDIOCRE. El usuario quiere una maqueta REAL que aproveche todo lo que tiene.

Después de armar la forma base (óvalo, óvalo doble, lo que sea), MIRÁ qué te quedó:
  - ¿Sobran turnouts? → agregá un **passing siding** (crossover entre dos vías) o un **siding** (vía muerta lateral con 1 turnout)
  - ¿Sobran curvas R-15°? → no podés cerrar otro loop con tan pocas, pero sí pueden ser parte de un **branch line** (vía secundaria que entra al óvalo via turnout)
  - ¿Sobran rectas? → extendé las rectas del óvalo (más S248 por lado) o usalas en un **yard** (vías paralelas para estacionar trenes)

NO devuelvas la primera forma válida. Llegá hasta donde la geometría te permita.

## MATEMÁTICA DE CIERRE (CRÍTICA)

  - rectas (S###): 0° de cambio direccional.
  - curvas (R###-α): suman α° (o restan si mirrored=true).
  - turnouts (EP*): rama B = 0°, rama C = ±diverge_deg según hand.

Para un loop cerrado: suma de cambios direccionales = múltiplo de 360°.

  - 8 × 45° = 360° ✓ (óvalo con R-45)
  - 24 × 15° = 360° ✓ (óvalo con R-15, pero necesitás 24 piezas)
  - 4 × 45° + 12 × 15° = 360° ✓ (loop mixto)

Si no podés cerrar exacto con las piezas disponibles, NO uses \`link\` — devolvé el layout abierto. El motor acepta extremos abiertos para yards y branches.

## EJEMPLO 1: óvalo simple cerrado (FEW-SHOT)

Inventario mínimo: 20-110 (R282-45)×8, 20-000 (S248)×2.

\`\`\`
{
  "name": "Óvalo R282 + 1 recta por lado",
  "rationale": "8 curvas R282-45 = 360°. Una S248 en cada extremo recto.",
  "moves": [
    { "kind": "place",  "ref": "s1", "code": "20-000" },
    { "kind": "attach", "ref": "c1", "code": "20-110", "toRef": "s1", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c2", "code": "20-110", "toRef": "c1", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c3", "code": "20-110", "toRef": "c2", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c4", "code": "20-110", "toRef": "c3", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "s2", "code": "20-000", "toRef": "c4", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c5", "code": "20-110", "toRef": "s2", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c6", "code": "20-110", "toRef": "c5", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c7", "code": "20-110", "toRef": "c6", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c8", "code": "20-110", "toRef": "c7", "toConn": "B", "conn": "A" },
    { "kind": "link",   "from": "c8", "fromConn": "B", "to": "s1", "toConn": "A" }
  ]
}
\`\`\`

## EJEMPLO 2: óvalo + siding lateral (FEW-SHOT más ambicioso)

Inventario: 20-110×8, 20-000×4, 20-220 (EP481-L turnout)×1.

Idea: reemplazá una recta del óvalo por un turnout. La rama B sigue con el óvalo;
la rama C arranca una vía muerta lateral.

\`\`\`
{
  "name": "Óvalo R282 con siding lateral",
  "rationale": "Reemplazo la recta inferior por un turnout izquierdo. La rama recta (B) continúa el óvalo. La rama divergente (C) forma una vía muerta de 2 rectas.",
  "moves": [
    { "kind": "place",  "ref": "s1", "code": "20-000" },
    { "kind": "attach", "ref": "c1", "code": "20-110", "toRef": "s1", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c2", "code": "20-110", "toRef": "c1", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c3", "code": "20-110", "toRef": "c2", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c4", "code": "20-110", "toRef": "c3", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "tn", "code": "20-220", "toRef": "c4", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c5", "code": "20-110", "toRef": "tn", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c6", "code": "20-110", "toRef": "c5", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c7", "code": "20-110", "toRef": "c6", "toConn": "B", "conn": "A" },
    { "kind": "attach", "ref": "c8", "code": "20-110", "toRef": "c7", "toConn": "B", "conn": "A" },
    { "kind": "link",   "from": "c8", "fromConn": "B", "to": "s1", "toConn": "A" },
    { "kind": "attach", "ref": "sd1", "code": "20-000", "toRef": "tn", "toConn": "C", "conn": "A" },
    { "kind": "attach", "ref": "sd2", "code": "20-000", "toRef": "sd1", "toConn": "B", "conn": "A" }
  ]
}
\`\`\`

Nota: el óvalo cierra (link de c8 a s1). DESPUÉS del link viene la vía muerta usando la rama C del turnout: 2 rectas que terminan abiertas. El motor acepta extremos abiertos en partes ramificadas.

## CATÁLOGO de add-ons que podés combinar

| add-on | costo | descripción |
|---|---|---|
| Extender recta del óvalo | +1 recta por lado | la maqueta crece a lo ancho |
| Siding (vía muerta) | 1 turnout + 1-3 rectas | colateral del óvalo |
| Passing siding | 2 turnouts (1L + 1R) + 1-2 rectas en el medio | crossover entre dos vías o entre óvalo y siding |
| Yard (2 vías muertas paralelas) | 2 turnouts mismo hand + rectas | estacionamiento |
| Branch line | 1 turnout + curvas + rectas hacia otra dirección | salida del óvalo principal |

## REGLAS CRÍTICAS

1. Usá SOLO códigos del brief — nunca inventes.
2. NO excedas las cantidades del brief.
3. Maximizá uso: ≥80% de las piezas snappable.
4. Para loop cerrado: suma direccional = múltiplo de 360°. Si no, layout abierto.
5. Cada \`attach\` referencia refs YA emitidos.
6. Tras el primer loop (link), seguí agregando ramas/sidings/yards a las salidas C de turnouts. El layout puede tener AMBOS loop cerrado Y ramas abiertas.
7. Tolerancia del motor: 0.5 mm. Cualquier rechazo te devuelve a corregir.

Salida: SOLO la tool \`propose_layout\`. Sin prosa.`;
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

    // Frontier models (gpt-5.x, o1/o3) require the new Responses API.
    // Older 4.x chat models still use chat.completions. We route based
    // on the model name prefix.
    const isResponsesApi = /^(gpt-5|o[13])/.test(this.model);

    const sys = systemPrompt();
    const usr = userPrompt(input, this.catalog);

    // Up to 3 attempts. Each round, if the engine rejects the proposal,
    // we pass the error back to the model and ask for a correction.
    const MAX_ATTEMPTS = 3;
    let lastError: string | null = null;

    // For the Responses API we keep `previousResponseId` so the model
    // sees its own prior tool call + our feedback as conversation.
    let previousResponseId: string | null = null;
    // For chat.completions we accumulate messages by hand.
    const chatMessages: Array<Record<string, unknown>> = [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let parsed: LayoutProposal;
      let toolCallId: string | undefined;
      let toolFunction: { name: string; arguments: string } | undefined;

      if (isResponsesApi) {
        // ---- Responses API path ---------------------------------------------
        const input1 =
          attempt === 1
            ? [
                { role: "system" as const, content: sys },
                { role: "user" as const, content: usr },
              ]
            : [
                {
                  role: "user" as const,
                  content:
                    `El motor geométrico rechazó la propuesta anterior. Error: "${lastError}". ` +
                    `Posible causa: la suma de cambios direccionales no llega exactamente a 360°, o un \`link\` une dos conectores que no coinciden en el mundo. ` +
                    `Corregí el movimiento problemático. Si no podés cerrar el loop con las piezas disponibles, devolvé un layout abierto (sin \`link\` final).`,
                },
              ];
        const opts: Record<string, unknown> = {
          model: this.model,
          input: input1,
          tools: [
            {
              type: "function",
              name: "propose_layout",
              description: "Propose a KATO UNITRACK layout as a symbolic move sequence.",
              parameters: PROPOSAL_SCHEMA as Record<string, unknown>,
            },
          ],
          tool_choice: { type: "function", name: "propose_layout" },
        };
        if (previousResponseId) opts.previous_response_id = previousResponseId;
        const resp = await (client as unknown as {
          responses: { create: (o: Record<string, unknown>) => Promise<unknown> };
        }).responses.create(opts);
        const r = resp as {
          id: string;
          output?: Array<{
            type: string;
            name?: string;
            arguments?: string;
            call_id?: string;
          }>;
        };
        previousResponseId = r.id;
        // Find the function-call output item.
        const call = r.output?.find(
          (o) => o.type === "function_call" && o.name === "propose_layout",
        );
        if (!call || !call.arguments) {
          throw new Error("[openai] responses API did not produce a propose_layout call");
        }
        toolCallId = call.call_id;
        toolFunction = { name: call.name ?? "propose_layout", arguments: call.arguments };
      } else {
        // ---- chat.completions path (for gpt-4.1 fallback) -------------------
        const resp = await client.chat.completions.create({
          model: this.model,
          messages: chatMessages as never,
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
          temperature: 0.3,
        });
        const tc = resp.choices[0]?.message.tool_calls?.[0];
        // The v6 SDK distinguishes function tool calls from custom ones.
        // Narrow by checking `type` before reading `.function`.
        if (!tc || tc.type !== "function" || tc.function.name !== "propose_layout") {
          throw new Error("[openai] model did not produce a propose_layout tool call");
        }
        toolCallId = tc.id;
        toolFunction = tc.function;
      }

      if (!toolFunction) {
        throw new Error("[openai] tool call missing function payload");
      }
      try {
        parsed = JSON.parse(toolFunction.arguments) as LayoutProposal;
      } catch (e) {
        throw new Error(`[openai] could not parse tool arguments: ${(e as Error).message}`);
      }
      if (!parsed.moves || !Array.isArray(parsed.moves)) {
        throw new Error("[openai] tool call missing moves array");
      }

      const ok = this.validatePreflight(parsed);
      if (ok.ok) return [parsed];
      lastError = ok.reason;

      if (attempt < MAX_ATTEMPTS && !isResponsesApi) {
        // Feed the error back into chat.completions for the next attempt.
        chatMessages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            { id: toolCallId, type: "function", function: toolFunction },
          ],
        });
        chatMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content:
            `El motor geométrico rechazó la propuesta. Error: "${ok.reason}". ` +
            `Razón posible: la suma de cambios direccionales no llega a 360°, o un \`link\` une dos conectores que no coinciden en el mundo. ` +
            `Corregí el movimiento problemático.`,
        });
      }
    }

    throw new Error(
      `[openai] el modelo no produjo una propuesta válida tras ${MAX_ATTEMPTS} intentos. Último error del motor: ${lastError ?? "desconocido"}.`,
    );
  }

  /**
   * Pre-flight: materialize the proposal and run the geometry engine.
   * Returns ok=true iff the layout closes within tolerance and has no
   * geometry errors. Open ends are allowed (yards / sidings).
   */
  private validatePreflight(proposal: LayoutProposal): { ok: true } | { ok: false; reason: string } {
    if (!this.catalog) return { ok: false, reason: "catalog not configured" };
    const mat = materializeProposal(proposal, this.catalog);
    if (!mat.ok) return { ok: false, reason: `materialize: ${mat.reason}` };
    const v = validate(mat.layout, this.catalog.geometryMap());
    if (!v.ok) return { ok: false, reason: v.errors.join("; ") };
    return { ok: true };
  }
}
