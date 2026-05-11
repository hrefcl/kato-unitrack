# Technical Risks

Things that can bite us, in rough priority order.

## R-01 — Catalog data is AI-extracted, not PDF-verified

**Risk**: every piece in `data/kato_unitrack_catalog.json` was extracted by
AI from the source PDF. Lengths, radii, angles, set contents and prices
may contain transcription errors. A wrong radius silently breaks every
generated layout that uses that piece.

**Mitigation today**:

- `provenance.verified_against_pdf` is `false` on every piece. Code that
  cares can refuse to act on unverified pieces.
- Both xlsx extractions are committed in `data/source/` for diff.
- The PDF itself is committed in `data/source/`.

**Mitigation roadmap**:

- `scripts/verify-against-pdf.mjs` re-parses the PDF tables and reports
  mismatches.
- Community PR template for marking a piece "verified" with reviewer
  initials.

## R-02 — KATO turnout geometry is documented inconsistently in the source

**Risk**: the source spreadsheets give a radius **or** a divergence
angle, but not always both. We currently encode known KATO turnouts in
`TURNOUT_FIXTURES` inside `scripts/build-catalog.mjs`. An unknown
turnout will land in the catalog as `snappable: false` rather than
silently get a wrong angle.

**Mitigation roadmap**:

- Extend `TURNOUT_FIXTURES` per piece as new ones appear.
- Cite the PDF page next to each fixture entry.

## R-03 — Floating-point drift in long curve chains

**Risk**: a closed oval is 8 × R-curves chained head-to-tail. Each step
applies a rotation by α (e.g. 45°) to the placement frame. Naive float
math accumulates error and the loop never closes exactly.

**Mitigation**:

- The geometry engine stores `Placement` as `(Tx, Ty, θ, mirrored)`,
  never as composed transform matrices. Closure tolerance is 0.5 mm.
- Loop generators compute target endpoints **symbolically** (R, α, count)
  rather than by walking the chain. The chain is then validated.
- Snap tolerance is wider than the typical accumulated error (0.5 mm vs
  ~0.001 mm per joint), so the engine doesn't reject legitimate loops.

## R-04 — Layout generator combinatorial explosion

**Risk**: brute-forcing "which pieces from inventory I can chain into an
oval" is exponential. A naive search dies on a real inventory of 60+
pieces.

**Mitigation**:

- Strategy-first design. `oval-simple` and `oval-double` don't search;
  they compute the required piece counts from the geometry (oval needs
  exactly 8 × R-α curves + N × straights to span the board), then check
  inventory. Cost is O(catalog size), not O(2^inventory).
- Future free-form search (figure-8 with constraints) will use
  beam search with the geometry engine as the validator.

## R-05 — AI providers smuggle invalid geometry past the engine

**Risk**: a sloppy provider implementation returns raw coordinates
instead of symbolic moves. If `frontend` accepts that and renders it,
the "AI proposal" becomes truth without going through validation.

**Mitigation**:

- `LayoutProposal.moves` is strictly symbolic (`place` / `attach`).
  There is no `setCoordinates` move. The materializer in the engine is
  the only thing that writes `Placement` records.
- The `frontend` accepts `LayoutProposal` only, never `Layout`, from
  AI code paths.

## R-06 — Canvas performance with 200+ pieces

**Risk**: re-rendering every piece on every mouse move tanks frame
rate. KATO layouts can hit 200+ pieces in serious modular setups.

**Mitigation roadmap**:

- Two-layer canvas: static layout layer + interactive overlay layer.
- Spatial index (uniform grid) for hit-testing and snap candidate
  search. The geometry engine already exposes a bounding box per
  placement; the index is built outside it.

## R-07 — KATO and UNITRACK trademarks

**Risk**: someone interprets this project as a KATO product or claims
trademark dilution.

**Mitigation**:

- README and LICENSE clearly disclaim affiliation.
- No KATO logos / artwork are shipped. The catalog contains numeric
  metadata and product names (factual, not creative content).
- No SKUs / pricing are presented as if they came from KATO — the JSON
  cites the PDF.

## R-08 — Localization

**Risk**: the project is bilingual today (English headers in v2,
Spanish descriptions from v1). The UI is currently English-only.

**Mitigation roadmap**:

- Keep both `description` (en) and `description_es` (es) in the JSON.
- Use a simple i18n key map in the frontend, not a heavy framework.
