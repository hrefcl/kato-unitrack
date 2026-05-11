# Geometry

This document is the contract between the geometry engine and everything
else. If something here is wrong, the engine is wrong; if the engine
disagrees with this document, this document wins and the engine gets a
PR.

## Coordinate system

- 2D Cartesian, millimetres.
- +X points right, +Y points up. (Canvas Y is flipped at render time —
  the engine never thinks in screen pixels.)
- Angles in degrees, 0° = +X, CCW positive.
- Pieces live in a **local frame**: their `Connection.position_mm` is
  relative to the piece origin (usually connector A).

## Pieces in their local frame

### Straight `length_mm = L`

```
A (0, 0)  ────────────────────  B (L, 0)
direction 180°                  direction 0°
```

### Curve `radius_mm = R`, `angle_degrees = α` (left curve, default)

The curve enters at the origin going +X and sweeps **counter-clockwise**
by α. Centre at (0, R). End point:

```
B = ( R · sin(α),  R · (1 − cos(α)) )
end direction = α
```

KATO curves are symmetric; the renderer mirrors them across Y=0 when the
`Placement.mirrored` flag is set, producing a right-hand curve with end
point `( R·sin(α), −R·(1−cos(α)) )` and end direction `−α`.

### Turnout (KATO #4 / #6 etc.)

Three connectors:

- A at origin, direction 180° — facing point.
- B at `(straight_length_mm, 0)`, direction 0° — straight branch out.
- C on the diverging branch, computed from `radius_mm` and `diverge_deg`:
  - `Cx = R · sin(δ)`
  - `Cy = ± R · (1 − cos(δ))`     (sign by hand: L = +, R = −)
  - `direction = ± δ`

For a Wye both branches diverge — modelled as two turnouts back-to-back
in code; the catalog flags `turnout.wye = true`.

### Double track

Two parallel rails 33 mm apart (UNITRACK PC double-track spec).
Connectors named `A1/B1` (rail 1) and `A2/B2` (rail 2). A double-track
attachment links **both** rail pairs simultaneously — the geometry engine
enforces this so you cannot half-connect a double-track piece.

## Placement → world

A `Placement` carries `position_mm = (Tx, Ty)`, `rotation_deg = θ`,
`mirrored ∈ {true,false}`. The world transform is:

```
M = T(Tx, Ty) · R(θ) · S(1, mirrored ? −1 : 1)
```

For a local point `p = (px, py)`:

```
p_world = M · p
        = ( Tx + px·cos(θ) − sy·py·sin(θ),
            Ty + px·sin(θ) + sy·py·cos(θ) )
   where sy = mirrored ? −1 : 1
```

For a local direction `δ_local` in degrees:

```
δ_world = mirrored ? (θ − δ_local) : (θ + δ_local)   (mod 360)
```

## Snap

When the user drags piece P over a free connector `c_target` (in world
space) on the current layout, the engine offers a snapped placement:

1. Pick the candidate connector `c_p` on P (the closest unattached one,
   or A if P is being placed for the first time).
2. Solve for `(Tx, Ty, θ, mirrored)` such that:
   - world position of `c_p` equals world position of `c_target`,
   - world direction of `c_p` equals world direction of `c_target` + 180°.
3. Return the resulting `Placement`.

Concretely, with `c_target` at world `(tx, ty)` and direction `δ_t`:

```
θ = (δ_t + 180°) − δ_local(c_p)         (no mirror)
Tx = tx − ( c_p.x · cos(θ) − sy · c_p.y · sin(θ) )
Ty = ty − ( c_p.x · sin(θ) + sy · c_p.y · cos(θ) )
```

If P is a curve and the user wanted a right-hand bend, the engine tries
`mirrored = true` and re-solves; the variant that keeps the rest of P
inside the board (and doesn't collide) wins. Both variants are real;
neither is "the default" — KATO curves are physically symmetric.

## Tolerances

- `SNAP_DISTANCE_MM = 0.5` — two world connectors agree if their
  positions are within 0.5 mm.
- `SNAP_ANGLE_DEG = 0.25` — two world directions are opposite if
  `|wrap(δ_a − δ_b − 180°)| < 0.25°`.
- `CLOSURE_DISTANCE_MM = 0.5` — a loop is considered closed if the gap
  between the first and last free connector is ≤ 0.5 mm.

These are tighter than KATO's real mechanical tolerance (~1–2 mm in
practice). We bias toward strictness so the layout is mathematically
clean; the renderer can still draw small UniJoiner inserts to absorb the
remaining slack.

## Loop closure detection

Build the connector graph: nodes are `(placementId, connectionId)`,
edges are attachments. A closed loop is a cycle in this graph in which
every node has degree 2 (i.e. each placement is fully connected).
The engine reports:

- `closedLoops: Placement[][]` — connected components that form a cycle.
- `openEnds: { placementId, connectionId, world_position }[]` — unmatched
  connectors. A "good" oval has zero open ends.

## Collision check (MVP)

For MVP, collisions are checked at the level of **piece footprints**
(`PieceDefinition.footprint_mm`) projected to world AABBs after
`Placement` transform. Two pieces collide if their AABBs overlap AND
they are not directly attached. This is permissive (false negatives) but
fast and sufficient to reject the obvious overlaps the generator might
propose.

Post-MVP: replace AABB with oriented-rectangle / curved-strip
intersection for accuracy.

## Why the engine never trusts the UI

UI gestures suffer from rounding, retina scaling, and the user's mouse.
The engine recomputes everything from `Placement` records, which are
exact rationals expressed as floats. As long as the persisted layout
stores `Placement` (not pixel coords), reopening a saved layout produces
byte-identical world coordinates.
