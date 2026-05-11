/**
 * The runtime shape of one row in data/kato_unitrack_catalog.json.
 *
 * This is a wider type than @kato-unitrack/geometry-engine's
 * PieceGeometry — it includes catalog metadata (price, description,
 * scale) the engine does not care about.
 */

import type { Connection } from "@kato-unitrack/geometry-engine";

export type Scale = "N" | "HO" | "Acc";

export type PieceType =
  | "straight" | "curve" | "turnout"
  | "double_track" | "viaduct_straight" | "viaduct_double"
  | "slab_track" | "bridge" | "crossing" | "crossover"
  | "adjustment" | "specialty" | "bumper" | "feeder" | "flexible"
  | "joiner" | "pier" | "catenary" | "cable"
  | "turntable" | "roadbed" | "hardware" | "unitram"
  | "set" | "accessory" | "other";

export interface PieceDefinition {
  readonly code: string;
  readonly name: string;
  readonly scale: Scale | string;
  readonly category: string;
  readonly subcategory: string | null;
  readonly type: PieceType | string;
  readonly abbreviation: string | null;
  readonly length_mm: number | null;
  readonly length_in: number | null;
  readonly radius_mm: number | null;
  readonly angle_degrees: number | null;
  readonly pack: { readonly quantity: number | null; readonly raw: string | null };
  readonly color: string | null;
  readonly price_usd: number | null;
  readonly description: string | null;
  readonly description_es?: string | null;
  readonly pdf_page: number | null;

  readonly connections: readonly Connection[];
  readonly arc?: { readonly radius_mm: number; readonly sweep_deg: number; readonly center_mm: readonly [number, number] };
  readonly turnout?: {
    readonly radius_mm: number;
    readonly diverge_deg: number;
    readonly hand: "L" | "R" | "Wye";
    readonly straight_length_mm: number;
    readonly double_track: boolean;
    readonly wye: boolean;
    readonly compact: boolean;
  };
  readonly double_track?: { readonly spacing_mm: number };
  readonly footprint_mm?: { readonly width: number; readonly height: number };
  readonly snappable: boolean;

  readonly tie_type?: string | null;
  readonly superelevated?: boolean | null;
  readonly turnout_control?: string | null;
  readonly pier_height_mm?: number | null;
  readonly set_dimension?: string | null;
  readonly set_contents_summary?: string | null;

  readonly dimensions?: {
    readonly rail_span_mm: number;
    readonly footprint_extent_mm: number;
    readonly footprint_verified_from_pdf: boolean;
  };

  readonly image: {
    readonly kind: "svg_procedural" | "pdf_photo" | "missing";
    readonly notes?: string;
    readonly path?: string;
    readonly needs_pdf_extraction?: boolean;
    readonly source_page?: number | null;
  };

  readonly provenance: {
    readonly source: "xlsx_ai_extracted" | "pdf_verified" | "manual";
    readonly verified_against_pdf: boolean;
  };
}

export interface CatalogFile {
  readonly schema_version: number;
  readonly source_of_truth: { readonly authoritative: string; readonly note: string };
  readonly source: unknown;
  readonly generated_at: string;
  readonly stats: { readonly total: number; readonly snappable: number; readonly by_category: Record<string, number>; readonly by_scale: Record<string, number> };
  readonly pieces: readonly PieceDefinition[];
}
