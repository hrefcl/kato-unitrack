import type { Attachment, Placement } from "@kato-unitrack/geometry-engine";
import type { CatalogIndex } from "@kato-unitrack/catalog";
import type { Inventory } from "@kato-unitrack/inventory";

export interface GeneratedLayout {
  readonly strategy: string;
  readonly name: string;
  readonly placements: readonly Placement[];
  readonly attachments: readonly Attachment[];
  readonly board_mm: { readonly width: number; readonly height: number };
  readonly inventory_usage: Readonly<Record<string, number>>;
  readonly notes: string;
}

export interface LayoutGeneratorInput {
  readonly catalog: CatalogIndex;
  readonly inventory: Inventory;
  readonly board_mm: { readonly width: number; readonly height: number };
  readonly scale: "N" | "HO" | string;
  readonly preferences?: {
    readonly preferRadiiMm?: readonly number[];
    readonly maxResults?: number;
  };
}

export interface LayoutStrategy {
  readonly name: string;
  describe(): string;
  generate(input: LayoutGeneratorInput): GeneratedLayout[];
}
