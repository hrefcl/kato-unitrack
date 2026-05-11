# KATO UNITRACK Layout Designer

Open-source platform to design KATO UNITRACK model railroad layouts. Real
millimetre-accurate geometry, inventory-aware layout generation, pluggable AI
providers — and the geometry engine is always the final authority.

> KATO and UNITRACK are trademarks of KATO Precision Railroad Models. This is
> an unofficial fan project, not affiliated with KATO.

---

## Status

**Fase 1 — Catalog ingestion**: ✅ 330 pieces (224 N + 61 HO + 45 accessories)
generated from the reference PDF, 156 of which carry derived geometry
(`connections[]`, footprint, arc data) ready for the geometry engine.

**Fase 2 — Platform MVP**: 🚧 in progress.

The PDF (`data/source/us_unitrack_1-40_20251028.pdf`) is the **absolute source
of truth**. The xlsx in the same folder is an AI-assisted extraction; every
piece in `data/kato_unitrack_catalog.json` is flagged
`provenance.verified_against_pdf: false` until a human or a future
`verify-against-pdf` script promotes it.

---

## Architecture in one glance

```
catalog (JSON, immutable per release)
    │
    ▼
packages/catalog ──► packages/inventory ──► packages/layout-generator
                                                       │
                                                       ▼
                                            packages/geometry-engine
                                                  (the authority)
                                                       ▲
                                                       │
                              packages/ai-providers ───┘   (suggestions only,
                                                            never authoritative)

packages/storage  ──── used by frontend + backend (localStorage today, swap later)

frontend (React + Vite + Canvas)  ──── consumes every package
backend  (Node + Express, minimal) ──── serves the catalog and stub APIs
```

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, layering, why
  geometry is isolated.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — `Piece`, `Connection`,
  `Placement`, `Layout`, `Inventory` shapes.
- [`docs/GEOMETRY.md`](docs/GEOMETRY.md) — coordinate system, matrices, arcs,
  snapping math, loop closure.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — MVP scope and post-MVP queue.
- [`docs/RISKS.md`](docs/RISKS.md) — known technical risks and mitigations.

---

## Install

```bash
git clone https://github.com/hrefcl/kato-unitrack.git
cd kato-unitrack
npm install
```

Requires Node ≥ 20.

## Rebuild the catalog from the source xlsx

```bash
npm run build:catalog
```

Reads `kato_unitrack_catalogo_completo_v2.xlsx` (next to this repo or in
`data/source/`) and writes `data/kato_unitrack_catalog.json`. Idempotent.

## Run the frontend

```bash
npm run dev
```

Vite dev server on `http://localhost:5173`.

## Run the backend (optional)

```bash
npm run dev:backend
```

Express on `http://localhost:5174`. Serves the catalog JSON and stub layout
endpoints; the frontend works without it (localStorage fallback).

## Test

```bash
npm test
```

Vitest covers the geometry engine, layout generator, inventory and catalog
packages.

---

## Layout

```
.
├── data/
│   ├── kato_unitrack_catalog.json       # generated, the runtime catalog
│   └── source/
│       ├── us_unitrack_1-40_20251028.pdf  # ← source of truth
│       └── kato_unitrack_catalogo_completo_v2.xlsx
├── docs/                                # architecture + math + roadmap
├── scripts/
│   └── build-catalog.mjs                # xlsx → JSON normalizer
├── packages/
│   ├── geometry-engine/                 # pure TS math, no UI
│   ├── catalog/                         # loads + indexes the JSON
│   ├── inventory/                       # user-owned stock + set expansion
│   ├── layout-generator/                # ovals, double ovals, future shapes
│   ├── ai-providers/                    # AIProvider interface + adapters
│   └── storage/                         # StorageAdapter (localStorage MVP)
├── frontend/                            # React + Vite + Canvas
└── backend/                             # Express, minimal
```

---

## Contributing

This project is intentionally modular and intentionally honest about its
limits. The geometry engine is the boundary between "suggestion" and "truth":
contributions that bypass it (e.g. a layout generator that hand-tweaks
coordinates without going through `Placement` + validation) will not be
merged.

PRs welcome for: new layout shapes, additional AI provider adapters,
PDF re-parse verification, accessibility, i18n.

## License

MIT. See [LICENSE](LICENSE).
