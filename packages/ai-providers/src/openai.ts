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
