import { describe, it, expect } from "vitest";
import { findSnapCandidate, tryAttach, canAttachWorld } from "../src/snap.js";
import type { Layout, PieceGeometry, Placement } from "../src/types.js";

const straight248: PieceGeometry = {
  code: "20-000",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [248, 0], direction_deg: 0 },
  ],
  footprint_mm: { width: 248, height: 25 },
};

const pieces = new Map<string, PieceGeometry>([[straight248.code, straight248]]);

describe("snap", () => {
  it("snaps a new straight to the open end of an existing straight", () => {
    const first: Placement = {
      id: "p1",
      code: straight248.code,
      position_mm: [0, 0],
      rotation_deg: 0,
      mirrored: false,
    };
    const layout: Layout = { placements: [first], attachments: [] };
    // Mouse near B of p1 (at world ~(248, 0)).
    const snap = findSnapCandidate(layout, pieces, straight248, { x: 250, y: 1 }, {
      placementId: "p2",
    });
    expect(snap).not.toBeNull();
    expect(snap!.placement.position_mm[0]).toBeCloseTo(248, 9);
    expect(snap!.placement.rotation_deg).toBeCloseTo(0, 9);
  });

  it("refuses a far-away hover", () => {
    const first: Placement = {
      id: "p1", code: straight248.code, position_mm: [0, 0], rotation_deg: 0, mirrored: false,
    };
    const snap = findSnapCandidate(
      { placements: [first], attachments: [] },
      pieces,
      straight248,
      { x: 9999, y: 9999 },
      { placementId: "p2", searchRadiusMm: 80 },
    );
    expect(snap).toBeNull();
  });
});

describe("tryAttach", () => {
  it("accepts a valid attachment", () => {
    const a: Placement = {
      id: "p1", code: straight248.code, position_mm: [0, 0], rotation_deg: 0, mirrored: false,
    };
    const b: Placement = {
      id: "p2", code: straight248.code, position_mm: [248, 0], rotation_deg: 0, mirrored: false,
    };
    const layout: Layout = { placements: [a, b], attachments: [] };
    const r = tryAttach(layout, pieces,
      { placementId: "p1", connectionId: "B" },
      { placementId: "p2", connectionId: "A" });
    expect(r.ok).toBe(true);
  });

  it("rejects a misaligned attachment with a useful reason", () => {
    const a: Placement = {
      id: "p1", code: straight248.code, position_mm: [0, 0], rotation_deg: 0, mirrored: false,
    };
    const b: Placement = {
      id: "p2", code: straight248.code, position_mm: [300, 0], rotation_deg: 0, mirrored: false,
    };
    const layout: Layout = { placements: [a, b], attachments: [] };
    const r = tryAttach(layout, pieces,
      { placementId: "p1", connectionId: "B" },
      { placementId: "p2", connectionId: "A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/distance/);
  });
});

describe("canAttachWorld", () => {
  it("checks both distance and direction", () => {
    expect(canAttachWorld({ position: [0, 0], direction: 0 }, { position: [0, 0], direction: 180 }).ok).toBe(true);
    expect(canAttachWorld({ position: [0, 0], direction: 0 }, { position: [1, 0], direction: 180 }).ok).toBe(false);
    expect(canAttachWorld({ position: [0, 0], direction: 0 }, { position: [0, 0], direction: 90 }).ok).toBe(false);
  });
});
