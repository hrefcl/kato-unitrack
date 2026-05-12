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
- un brief estructurado del inventario + formas factibles ya pre-calculadas por el motor
- el tamaño del tablero, la escala, y opcionalmente la intención del usuario

Producís UN LayoutProposal (una secuencia de movimientos simbólicos — NUNCA coordenadas):

  - place(ref, code): primera pieza, queda en el origen.
  - attach(ref, code, toRef, toConn, conn, mirrored?): pega \`conn\` de la nueva pieza a \`toConn\` de toRef.
  - link(from, fromConn, to, toConn): liga dos refs YA COLOCADOS (para cerrar loops sin colocar nueva pieza).

## MATEMÁTICA DE CIERRE (CRÍTICA)

Cada conexión \`attach\` hace AVANZAR la "dirección de la vía" desde el conector
saliente toConn:

  - rectas (S###): mantienen la dirección — 0° de cambio
  - curvas (R###-α): cambian la dirección α° (sumar α si no \`mirrored\`, restar α si \`mirrored\`)
  - turnouts (EP*): rama B mantiene 0°, rama C cambia el ángulo de divergencia

Para que un loop cierre, la SUMA de los cambios direccionales del chain TIENE
que ser un múltiplo de 360°. Si no es 360° exacto, el motor rechaza con error
"connector distance X mm > 0.5 mm".

Ejemplos numéricos:
  - Óvalo simple con R-45° curvas: necesitas 8 curvas (8 × 45° = 360°) + rectas.
  - Óvalo con R-15° curvas: 24 (24 × 15° = 360°). Si solo tenés 2 en stock, NO podés cerrar un óvalo solo con esas.
  - Mezcla: 4 × 45° (=180°) + 12 × 15° (=180°) también suma 360° pero más complejo.

## EJEMPLO CONCRETO de un óvalo cerrado válido (FEW-SHOT)

Inventario: 20-110 (R282-45) ×8, 20-000 (S248) ×2.
Solución que el motor acepta:

\`\`\`
{
  "name": "Óvalo R282 + 1 recta por lado",
  "rationale": "8 curvas R282-45 cierran 360° (8×45). Una S248 en cada extremo recto.",
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

Nótese: 10 \`attach\` + 1 \`link\` final. La cadena de curvas suma 8 × 45° = 360°. Las rectas no aportan dirección. El \`link\` une el último conector libre con el primero — y MATEMÁTICAMENTE coinciden porque el chain cerró 360°.

## REGLAS CRÍTICAS

1. Usá SOLO códigos KATO del brief, NUNCA inventes.
2. NO excedas las cantidades del brief.
3. Para un loop cerrado: la suma de los cambios direccionales DEBE ser exactamente 360° (o 0°, o -360°). Si no podés cerrar exacto, NO uses \`link\` — devolvé un layout abierto (yard).
4. Para una maqueta ABIERTA tipo yard: omitir el \`link\` final está OK; el motor permite extremos abiertos.
5. Cada \`attach\` debe referenciar refs que YA existen en moves anteriores.
6. El motor valida con tolerancia 0.5 mm. Cualquier propuesta no-exacta es rechazada.

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

    const messages: { role: "system" | "user" | "assistant" | "tool"; content: string; name?: string; tool_call_id?: string; tool_calls?: unknown[] }[] = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userPrompt(input, this.catalog) },
    ];

    const tool = {
      type: "function" as const,
      function: {
        name: "propose_layout",
        description: "Propose a KATO UNITRACK layout as a symbolic move sequence.",
        parameters: PROPOSAL_SCHEMA as Record<string, unknown>,
      },
    };

    // Up to 3 attempts. Each round, if the engine rejects the proposal,
    // we pass the error back to the model and ask for a correction.
    const MAX_ATTEMPTS = 3;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await client.chat.completions.create({
        model: this.model,
        messages: messages as never,
        tools: [tool],
        tool_choice: { type: "function", function: { name: "propose_layout" } },
        temperature: 0.3, // Lower → more deterministic, fewer geometry hallucinations
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

      // Try to materialize + validate against the engine. If the engine
      // accepts → return. If it rejects → feed the error back and let
      // the model fix it.
      const ok = this.validatePreflight(parsed);
      if (ok.ok) return [parsed];

      lastError = ok.reason;
      if (attempt < MAX_ATTEMPTS) {
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: tc.id,
              type: "function",
              function: tc.function,
            },
          ],
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `El motor geométrico rechazó la propuesta. Error: "${ok.reason}". Razón posible: la suma de los cambios direccionales no llega exactamente a 360° (o 0°), o un \`link\` une dos conectores que no coinciden en el mundo. Corregí el movimiento problemático. Si no podés cerrar el loop con las piezas disponibles, devolvé un layout abierto (sin \`link\` final) en vez de uno inválido.`,
        });
      }
    }

    // After MAX_ATTEMPTS the model couldn't produce a valid proposal.
    // Surface the last error so the user can see what's wrong.
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
