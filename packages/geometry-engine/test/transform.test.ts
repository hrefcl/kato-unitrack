import { describe, it, expect } from "vitest";
import {
  localToWorldPoint,
  localToWorldDir,
  connectionWorld,
  placementForAttach,
} from "../src/transform.js";
import type { PieceGeometry, Placement } from "../src/types.js";

const straight248: PieceGeometry = {
  code: "20-000",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [248, 0], direction_deg: 0 },
  ],
  footprint_mm: { width: 248, height: 25 },
};

const curveR315A45: PieceGeometry = {
  code: "20-120",
  connections: [
    { id: "A", position_mm: [0, 0], direction_deg: 180 },
    { id: "B", position_mm: [315 * Math.sin((45 * Math.PI) / 180), 315 * (1 - Math.cos((45 * Math.PI) / 180))], direction_deg: 45 },
  ],
};

describe("transform", () => {
  it("identity placement keeps local coords", () => {
    const p: Placement = { id: "1", code: "20-000", position_mm: [0, 0], rotation_deg: 0, mirrored: false };
    expect(localToWorldPoint([100, 0], p)).toEqual([100, 0]);
    expect(localToWorldDir(0, p)).toBe(0);
  });

  it("rotates 90° CCW", () => {
    const p: Placement = { id: "1", code: "20-000", position_mm: [0, 0], rotation_deg: 90, mirrored: false };
    const [x, y] = localToWorldPoint([100, 0], p);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(100, 9);
    expect(localToWorldDir(0, p)).toBe(90);
  });

  it("translates after rotation", () => {
    const p: Placement = { id: "1", code: "20-000", position_mm: [50, 10], rotation_deg: 180, mirrored: false };
    const [x, y] = localToWorldPoint([100, 0], p);
    expect(x).toBeCloseTo(-50, 9);
    expect(y).toBeCloseTo(10, 9);
  });

  it("mirrored placement flips the local Y axis", () => {
    const p: Placement = { id: "1", code: "20-120", position_mm: [0, 0], rotation_deg: 0, mirrored: true };
    const w = connectionWorld(curveR315A45, curveR315A45.connections[1]!, p);
    // mirrored curve endpoint Y should be negative of unmirrored
    expect(w.position[1]).toBeCloseTo(-315 * (1 - Math.cos((45 * Math.PI) / 180)), 9);
    expect(w.direction).toBeCloseTo(-45, 9);
  });
});

describe("placementForAttach", () => {
  it("solves a head-to-head straight chain", () => {
    // Target: a connector at world (248, 0) facing +X (dir 0).
    // Attaching the A-end of another straight should put that straight at (248,0)
    // with rotation 0 so that A points -X and B points +X at (496, 0).
    const target = { position: [248, 0] as [number, number], direction: 0 };
    const p = placementForAttach(straight248, "A", target, { mirrored: false, placementId: "p2" });
    expect(p.position_mm[0]).toBeCloseTo(248, 9);
    expect(p.position_mm[1]).toBeCloseTo(0, 9);
    expect(p.rotation_deg).toBeCloseTo(0, 9);
    const wB = connectionWorld(straight248, straight248.connections[1]!, p);
    expect(wB.position[0]).toBeCloseTo(496, 9);
    expect(wB.position[1]).toBeCloseTo(0, 9);
  });

  it("solves attaching to a rotated target", () => {
    // Target: connector at (100, 100) facing +Y (dir 90).
    const target = { position: [100, 100] as [number, number], direction: 90 };
    const p = placementForAttach(straight248, "A", target, { mirrored: false, placementId: "p" });
    const wA = connectionWorld(straight248, straight248.connections[0]!, p);
    expect(wA.position[0]).toBeCloseTo(100, 9);
    expect(wA.position[1]).toBeCloseTo(100, 9);
    // Direction at A should be opposite of target → 90 + 180 = -90
    expect(wA.direction).toBeCloseTo(-90, 9);
    const wB = connectionWorld(straight248, straight248.connections[1]!, p);
    expect(wB.position[0]).toBeCloseTo(100, 9);
    expect(wB.position[1]).toBeCloseTo(100 + 248, 9);
  });
});
