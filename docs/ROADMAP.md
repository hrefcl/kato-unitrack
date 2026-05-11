# Roadmap

## Fase 1 — Catalog (done)

- [x] Parse / AI-extract the KATO US Track Catalog PDF (1–40, 2023 MSRP).
- [x] Normalize into `data/kato_unitrack_catalog.json` (330 pieces).
- [x] Mark every piece `provenance.verified_against_pdf: false` — the PDF
      is the source of truth, the xlsx is a hint until promoted.
- [x] Provide a reproducible `scripts/build-catalog.mjs`.

## Fase 2 — MVP (in progress)

Goal: a real, installable, modular editor with correct geometry.

- [ ] `packages/geometry-engine` — vectors, transforms, snap, closure,
      collisions, exhaustive unit tests.
- [ ] `packages/catalog` — typed loader + index over the JSON.
- [ ] `packages/inventory` — entries, set expansion, available counts.
- [ ] `packages/layout-generator` — strategies: **oval-simple**,
      **oval-double**. Validated by the engine.
- [ ] `packages/storage` — `StorageAdapter` interface +
      `LocalStorageAdapter`.
- [ ] `packages/ai-providers` — `AIProvider` interface + stubs for
      OpenAI / Claude / Kimi.
- [ ] `frontend` — React + Vite + Canvas. Catalog, Inventory, Editor
      (drag + snap + rotate + delete), Generator, Saved layouts.
- [ ] `backend` — Express, serves catalog + stub `/api/layouts`.
- [ ] Docs: ARCHITECTURE, DATA_MODEL, GEOMETRY, ROADMAP, RISKS.

## Fase 3 — Strategy expansion

- [ ] Layout strategies: **figure-8**, **L-layout**, **viaduct loop**,
      **passing siding**, **simple yard**.
- [ ] Curve-radius mixing in a single oval (e.g. R315 + R249 for tight
      transitions on small boards).
- [ ] Multi-board / modular layout chaining.

## Fase 4 — AI providers, real

- [ ] OpenAI adapter: function-calling with `LayoutProposal` JSON schema.
- [ ] Claude adapter: tool use with the same schema.
- [ ] Kimi adapter.
- [ ] User-supplied API key, stored in `StorageAdapter`, never sent
      anywhere except the chosen provider.
- [ ] Hard guarantee: every AI proposal goes through the geometry engine
      and is rejected if it fails validation.

## Fase 5 — Backend + persistence

- [ ] Real `RestStorageAdapter`.
- [ ] User accounts (out of scope for MVP — auth provider TBD).
- [ ] Layout sharing by URL (read-only, signed).

## Post-MVP — explicitly deferred

These are intentionally **not** in scope until the MVP is solid:

- SCARM / AnyRail / XTrkCAD export.
- 3D rendering.
- Train simulation (DCC, physics).
- Live multi-user collaboration.
- Marketplace / community gallery.
- Print-to-paper templates.

The architecture is prepared for them (engine is headless, layouts are
serializable, AI is pluggable) but the code is not.

## Verification milestones

- **PDF parity**: a script that re-parses `data/source/*.pdf` and
  reports any piece in the JSON whose `length_mm` / `radius_mm` /
  `angle_degrees` disagrees with the PDF, then flips
  `provenance.verified_against_pdf` to `true` for matches.
- **Closure benchmark**: every generator output closes to ≤ 0.5 mm; the
  test suite asserts this for 100+ random valid inventories.
- **Determinism**: a fixed seed + fixed inventory + fixed board always
  produces the same layout. No `Math.random()` without an injected RNG.
