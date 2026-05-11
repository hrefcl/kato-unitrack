# Data Model

All units are **millimetres** and **degrees**. Internal angle convention:
0° points +X, counter-clockwise positive. See `GEOMETRY.md` for the why.

## `PieceDefinition`

The thing that lives in `data/kato_unitrack_catalog.json`. One per KATO
catalog row. Read-only at runtime.

```ts
interface PieceDefinition {
  code: string;            // KATO Item #, e.g. "20-000"
  name: string;            // "N Straight Track 248mm"
  scale: "N" | "HO" | "Acc" | string;
  category: string;        // "Straight Track", "Curved Track", ...
  subcategory: string | null;
  type:
    | "straight" | "curve" | "turnout"
    | "double_track" | "viaduct_straight" | "viaduct_double"
    | "slab_track" | "bridge" | "crossing" | "crossover"
    | "adjustment" | "specialty" | "bumper" | "feeder" | "flexible"
    | "joiner" | "pier" | "catenary" | "cable"
    | "turntable" | "roadbed" | "hardware" | "unitram"
    | "set" | "accessory" | "other";
  abbreviation: string | null;        // "S248", "R315-45", "EP718-15L"
  length_mm: number | null;
  length_in: number | null;
  radius_mm: number | null;
  angle_degrees: number | null;
  pack: { quantity: number | null; raw: string | null };
  color: string | null;
  price_usd: number | null;
  description: string | null;
  pdf_page: number | null;

  // Derived geometry — present only when the piece is snappable.
  connections: Connection[];
  arc?: { radius_mm: number; sweep_deg: number; center_mm: [number, number] };
  turnout?: {
    radius_mm: number;
    diverge_deg: number;
    hand: "L" | "R" | "Wye";
    straight_length_mm: number;
    double_track: boolean;
    wye: boolean;
    compact: boolean;
  };
  double_track?: { spacing_mm: number };
  footprint_mm?: { width: number; height: number };
  snappable: boolean;

  // Distinguishes the connector-to-connector rail span from the actual
  // physical footprint. Some pieces (illuminated bumpers, rerailers,
  // certain bridges) have a footprint larger than their rail span —
  // e.g. piece 20-063 has rail_span_mm = 66 but footprint_extent_mm = 95
  // according to the PDF. Until the PDF is reparsed, footprint defaults
  // to rail_span and `footprint_verified_from_pdf` is false.
  dimensions?: {
    rail_span_mm: number;
    footprint_extent_mm: number;
    footprint_verified_from_pdf: boolean;
  };

  // Visual representation of the piece.
  image: {
    kind: "svg_procedural" | "pdf_photo" | "missing";
    notes?: string;
    // svg_procedural: drawn at runtime by geometry-engine.renderPieceSvg().
    // pdf_photo:      path to a cropped PNG under data/images/<code>.png.
    path?: string;
    needs_pdf_extraction?: boolean;
    source_page?: number;
  };

  provenance: {
    source: "xlsx_ai_extracted" | "pdf_verified" | "manual";
    verified_against_pdf: boolean;
  };
}
```

### Image strategy

The catalog ships with **two** visual representations:

1. **Procedural SVG** for the 156 pieces with derived geometry (every
   straight, curve, turnout, double-track). The frontend calls
   `renderPieceSvg(piece)` from `@kato-unitrack/geometry-engine` to draw
   them on demand. These cannot drift from the geometry because they
   *are* the geometry.

2. **PDF photo crop** for the remaining 174 pieces (locos, sets,
   accessories, control gear). These are marked `image.kind: "missing"`
   today; `scripts/extract-pdf-assets.mjs` is the planned (stubbed)
   pipeline that will pull them from `data/source/*.pdf` and write
   `data/images/<code>.png`.

This split is deliberate: a procedural drawing is more truthful than a
photo for track pieces, and a photo is the only sensible representation
for a passenger consist or a power pack.

## `Connection`

A physical connector on a piece, in the piece's **local frame**.

```ts
interface Connection {
  id: string;                       // "A", "B", "C", "A1", "B1", ...
  position_mm: [number, number];    // local mm
  direction_deg: number;            // direction track exits the piece here
  track?: number;                   // 1 or 2 for double-track pieces
}
```

`direction_deg` is the direction **away from the piece**. Two connectors
match when their world directions differ by 180° (within tolerance).

## `Placement`

A piece placed in world space.

```ts
interface Placement {
  id: string;                       // uuid-ish, unique within a Layout
  code: string;                     // PieceDefinition.code
  position_mm: [number, number];    // world translation of the piece origin
  rotation_deg: number;             // world rotation of the piece, CCW
  mirrored: boolean;                // KATO curves are symmetric — mirrored = right-hand
}
```

The geometry engine derives world-space connector positions from
`Placement + PieceDefinition`. A `Placement` never stores connector
coordinates — the engine recomputes them on demand. This way a renamed or
recomputed connector never invalidates saved layouts.

## `Attachment`

Records that two connectors are physically joined.

```ts
interface Attachment {
  a: { placementId: string; connectionId: string };
  b: { placementId: string; connectionId: string };
}
```

A valid `Attachment` satisfies:

1. World positions of the two connectors agree within `SNAP_DISTANCE_MM`
   (default 0.5 mm).
2. World directions of the two connectors are opposite within
   `SNAP_ANGLE_DEG` (default 0.25°).
3. The piece types are connectable (e.g. a UNITRAM connector cannot mate a
   bridge connector — enforced by an optional `compatibilityClass` on the
   `Connection`; default class matches anything).

## `Layout`

The thing the user designs and saves.

```ts
interface Layout {
  id: string;
  name: string;
  scale: "N" | "HO";
  created_at: string;               // ISO
  updated_at: string;
  board_mm: { width: number; height: number };
  placements: Placement[];
  attachments: Attachment[];
  metadata?: {
    description?: string;
    tags?: string[];
    generated_by?: "user" | "layout-generator" | string;  // strategy name
    inventory_snapshot?: Inventory;
  };
}
```

A layout is well-formed when:

- Every connector referenced in `attachments` exists in the corresponding
  placement.
- The geometry engine's `validate(layout)` returns `{ ok: true }`.

## `Inventory`

The user's stock.

```ts
interface InventoryEntry {
  code: string;                     // PieceDefinition.code
  owned: number;
  used: number;                     // how many are currently placed in a layout
  added_from_sets?: string[];       // PieceDefinition.code of sets that contributed
}

interface Inventory {
  entries: Record<string, InventoryEntry>;   // keyed by piece code
  scale: "N" | "HO";
}
```

`inventory.available(code) = max(0, owned − used)`. Adding a set expands
into entries via the set's `contents` table (defined in
`packages/catalog/src/sets.ts` and seeded from the catalog's
`description` text + future PDF re-parse).

## `LayoutProposal` (AI output)

What an `AIProvider` returns. Symbolic, not coordinate-based.

```ts
interface LayoutProposal {
  name: string;
  rationale: string;                // free-form
  moves: Array<
    | { kind: "place"; code: string; ref?: string }                      // first piece, free placement
    | { kind: "attach"; code: string; toRef: string; toConn: string; conn: string }
  >;
}
```

The geometry engine materializes a `LayoutProposal` into a `Layout` by
sequentially attaching pieces. Any failed attachment rejects the proposal.

## `LayoutStrategy` (generator input)

```ts
interface LayoutStrategy {
  name: string;                     // "oval-simple", "oval-double", ...
  describe(): string;
  generate(input: LayoutGeneratorInput): Layout[];
}

interface LayoutGeneratorInput {
  catalog: CatalogIndex;
  inventory: Inventory;
  board_mm: { width: number; height: number };
  scale: "N" | "HO";
  preferences?: {
    prefer_curves?: number[];       // radii in mm
    max_results?: number;
  };
}
```
