/**
 * Core geometric types. All coordinates are millimetres, all angles are
 * degrees with 0° = +X and CCW positive. See docs/GEOMETRY.md.
 */

export type Vec2 = readonly [number, number];

export interface Connection {
  readonly id: string;
  readonly position_mm: Vec2;
  /** Direction track exits the piece at this connector. */
  readonly direction_deg: number;
  /** 1 or 2 for double-track pieces; undefined for single-track. */
  readonly track?: number;
  /** Compatibility class — only same-class connectors may attach. */
  readonly compatibilityClass?: string;
}

export interface PieceGeometry {
  readonly code: string;
  readonly connections: readonly Connection[];
  readonly footprint_mm?: { readonly width: number; readonly height: number };
  readonly arc?: {
    readonly radius_mm: number;
    readonly sweep_deg: number;
    readonly center_mm: Vec2;
  };
  /** Marks pieces with no derivable geometry (accessories, sets, etc.). */
  readonly snappable?: boolean;
}

export interface Placement {
  readonly id: string;
  readonly code: string;
  readonly position_mm: Vec2;
  readonly rotation_deg: number;
  readonly mirrored: boolean;
}

export interface Attachment {
  readonly a: { readonly placementId: string; readonly connectionId: string };
  readonly b: { readonly placementId: string; readonly connectionId: string };
}

export interface Layout {
  readonly placements: readonly Placement[];
  readonly attachments: readonly Attachment[];
}

export interface ConnectionWorld {
  readonly position: Vec2;
  readonly direction: number;
}

export interface OpenEnd {
  readonly placementId: string;
  readonly connectionId: string;
  readonly world: ConnectionWorld;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly openEnds: readonly OpenEnd[];
}

export interface Tolerances {
  /** Max world distance between mating connectors. Default 0.5 mm. */
  readonly snapDistanceMm: number;
  /** Max angular error between opposing connector directions. Default 0.25°. */
  readonly snapAngleDeg: number;
  /** Closure threshold for "ring detected". Default 0.5 mm. */
  readonly closureDistanceMm: number;
}

export const DEFAULT_TOLERANCES: Tolerances = {
  snapDistanceMm: 0.5,
  snapAngleDeg: 0.25,
  closureDistanceMm: 0.5,
};
