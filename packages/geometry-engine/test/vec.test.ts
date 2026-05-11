import { describe, it, expect } from "vitest";
import { wrap180, angleDiff, oppositeDir, v2dist } from "../src/vec.js";

describe("wrap180", () => {
  it("collapses 360° drift", () => {
    expect(wrap180(0)).toBe(0);
    expect(wrap180(90)).toBe(90);
    expect(wrap180(450)).toBe(90);
    expect(wrap180(-270)).toBe(90);
  });
  it("maps -180 to +180 for stable half-open range", () => {
    expect(wrap180(-180)).toBe(180);
    expect(wrap180(180)).toBe(180);
  });
});

describe("angleDiff", () => {
  it("returns the shortest signed delta", () => {
    expect(angleDiff(10, 0)).toBe(10);
    expect(angleDiff(0, 10)).toBe(-10);
    expect(angleDiff(170, -170)).toBe(-20);
  });
});

describe("oppositeDir", () => {
  it("matches connectors with opposite directions", () => {
    expect(oppositeDir(0, 180, 0.25)).toBe(true);
    expect(oppositeDir(45, -135, 0.25)).toBe(true);
    expect(oppositeDir(0, 0, 0.25)).toBe(false);
    expect(oppositeDir(0, 179.9, 0.25)).toBe(true);
    expect(oppositeDir(0, 179, 0.25)).toBe(false);
  });
});

describe("v2dist", () => {
  it("is Euclidean", () => {
    expect(v2dist([0, 0], [3, 4])).toBe(5);
    expect(v2dist([1, 1], [1, 1])).toBe(0);
  });
});
