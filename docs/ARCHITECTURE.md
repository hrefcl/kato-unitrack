# Architecture

## Principles

1. **Geometry is the authority.** The geometry engine is the only module
   allowed to assert that a layout is valid. AI suggestions and UI gestures
   go through it. Period.
2. **The catalog is immutable per release.** It is generated from the
   reference PDF, committed to the repo, and not edited from the runtime.
3. **Modules are layered, not tangled.** A package only depends on packages
   below it in the layering diagram. No back-edges, no surprises.
4. **No framework lock-in in the engine layer.** `geometry-engine`,
   `catalog`, `inventory`, `layout-generator`, `ai-providers` and `storage`
   are pure TypeScript. They have zero React/Vue imports. They could run in
   a Node script, a CLI, a worker, or a different UI framework tomorrow.
5. **Storage is pluggable.** localStorage today, REST/IndexedDB/Postgres
   later. The frontend talks to a `StorageAdapter`, never to a concrete
   backend.

## Layering

```
┌──────────────────────────────────────────────────────────────┐
│ UI layer       │  frontend (React)                            │
│                │  backend (Express, optional)                 │
├──────────────────────────────────────────────────────────────┤
│ Orchestration  │  layout-generator                            │
│ layer          │  ai-providers                                │
├──────────────────────────────────────────────────────────────┤
│ Domain layer   │  catalog       inventory       storage       │
├──────────────────────────────────────────────────────────────┤
│ Foundation     │  geometry-engine                             │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
                  data/kato_unitrack_catalog.json
                  data/source/us_unitrack_1-40_20251028.pdf
                                (truth, read-only)
```

A package may depend only on packages strictly below it. Crossing this
ordering is a code review reject.

## Why these modules?

### `geometry-engine`
Pure math. `Vec2`, `Mat3`, `Transform`, `placePiece`, `snap`,
`detectClosedLoop`, `boundingBox`, `collide`. Zero domain knowledge of
KATO — it works with `Connection` points and `PieceGeometry` shapes that
any catalog could produce. This is what makes the engine reusable for
Märklin C, Peco Setrack, anything similar in the future.

### `catalog`
Loads `data/kato_unitrack_catalog.json`, indexes it by code/category/scale,
and exposes a typed `PieceDefinition`. Has the only KATO-specific code on
the foundation/domain side.

### `inventory`
A pure value object that holds `{ code → { owned, used } }`, knows how to
expand a set (e.g. M1 master set) into its constituent pieces, and answers
"what do I have available right now?".

### `layout-generator`
Given an inventory and a board size, builds candidate layouts. Each
candidate is a `Layout` whose `Placement[]` is validated by the geometry
engine (closure tolerance ≤ 0.5 mm, no collisions, continuous path). MVP
ships **oval** and **double oval**; the architecture supports figure-8,
yards, etc. as further strategies.

### `ai-providers`
An `AIProvider` interface. Implementations: `OpenAIProvider`,
`ClaudeProvider`, `KimiProvider`. The contract is
`generateLayoutSuggestion(input) → LayoutProposal[]`. A proposal is a
**hint** — it never lands in the editor without going through the
geometry-engine's validator and snapping pass.

### `storage`
`StorageAdapter` interface with `LocalStorageAdapter` for MVP. Future
adapters: `RestStorageAdapter`, `IndexedDBStorageAdapter`. Persists
`Inventory` and saved `Layout[]`.

### `frontend`
React + Vite + Tailwind + Zustand. HTML5 Canvas for the editor. Renders
catalog data, drag-drop into the canvas, calls the geometry engine on
every move for snap + collision feedback.

### `backend`
Minimal Express. Serves `/api/catalog` from the committed JSON and stubs
`/api/layouts` for future cloud sync. The frontend works without the
backend (catalog can be served as a static asset).

## The geometry-engine boundary

This is the most important rule in the project:

> Nothing outside `geometry-engine` is allowed to compute world-space
> coordinates for a placed piece, decide whether two connectors are
> compatible, or declare a layout valid.

Concretely:

- The canvas calls `engine.snap(piece, hoverPoint)` to get a candidate
  `Placement` — it does not "round to the nearest grid" itself.
- The layout generator calls `engine.validate(layout)` before returning a
  candidate to the user — it does not trust its own coordinate math.
- The AI provider returns symbolic moves (`"connect 20-000 to 20-120 at C"`)
  and the engine materializes them into placements. If the materialization
  fails, the proposal is rejected.

## Frontend ↔ engine flow

```
User drags piece P from catalog
       │
       ▼
Canvas computes mouse → world coords (only translation/zoom, no geometry)
       │
       ▼
engine.findSnapCandidate(layout, P, world)  ── returns Placement | null
       │
       ▼
Canvas renders P at the snapped Placement, highlights connector
       │
       ▼
On drop: engine.tryAttach(layout, P, snap) → new Layout | RejectionReason
       │
       ▼
Zustand store updates layout, persistence service writes to StorageAdapter
```

## Future-proofing notes

- The `PieceDefinition.provenance.verified_against_pdf` field lets us
  promote pieces from "AI-extracted" to "human-verified" without changing
  any other code.
- `AIProvider` is intentionally narrow. Adding Kimi/Gemini/local Ollama is
  a matter of one new file in `packages/ai-providers/src/providers/`.
- `LayoutStrategy` is an interface in `layout-generator`. Oval and double
  oval are two implementations; figure-8 is a third. The generator chooses
  among them based on inventory + board.
- Nothing in the foundation layer knows about React. We could ship a
  Tauri/Electron desktop or a CLI without rewriting the engine.
