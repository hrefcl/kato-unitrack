/**
 * Vector and angle math. Pure functions, no allocation beyond return tuples.
 */

import type { Vec2 } from "./types.js";

export const v2 = (x: number, y: number): Vec2 => [x, y];
export const v2add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const v2sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const v2scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const v2dist = (a: Vec2, b: Vec2): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

/**
 * Wrap an angle in degrees into the (−180, 180] range. Useful when
 * comparing two world directions whose textual values might differ by
 * 360° but are physically identical.
 */
export function wrap180(deg: number): number {
  const r = ((deg + 180) % 360 + 360) % 360 - 180;
  // Map −180 exactly to +180 so the range is half-open in a stable way.
  return r === -180 ? 180 : r;
}

/** Smallest signed difference a − b, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  return wrap180(a - b);
}

/** True if two world directions are opposite within tolDeg. */
export function oppositeDir(a: number, b: number, tolDeg: number): boolean {
  return Math.abs(wrap180(a - b - 180)) <= tolDeg;
}
