import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  emptyInventory,
  addPiece,
  removePiece,
  markUsed,
  freeUsed,
  addSet,
  type Inventory,
} from "@kato-unitrack/inventory";
import type {
  Attachment,
  Placement,
} from "@kato-unitrack/geometry-engine";
import { catalog } from "./catalog";

export interface SavedLayout {
  id: string;
  name: string;
  scale: "N" | "HO";
  board_mm: { width: number; height: number };
  placements: Placement[];
  attachments: Attachment[];
  generated_by?: string;
  created_at: string;
  updated_at: string;
}

interface AppState {
  inventory: Inventory;
  workingLayout: {
    name: string;
    placements: Placement[];
    attachments: Attachment[];
    board_mm: { width: number; height: number };
    scale: "N" | "HO";
    /** Strategy name if this layout came from the generator. */
    generated_by?: string;
  };
  savedLayouts: SavedLayout[];

  // Inventory ops
  invAdd: (code: string, qty: number) => void;
  invRemove: (code: string, qty: number) => void;
  invMarkUsed: (code: string, qty: number) => void;
  invFreeUsed: (code: string, qty: number) => void;
  invAddSet: (code: string, qty: number) => string | null;
  /** Replace the entire inventory atomically. Used for rollback. */
  invReplace: (inv: Inventory) => void;

  // Layout ops
  layoutSetName: (name: string) => void;
  layoutSetBoard: (board_mm: { width: number; height: number }) => void;
  layoutSetScale: (scale: "N" | "HO") => void;
  layoutAddPlacement: (p: Placement) => void;
  layoutAddAttachment: (a: Attachment) => void;
  layoutRemovePlacement: (id: string) => void;
  layoutReset: () => void;
  layoutLoadFromGenerator: (placements: Placement[], attachments: Attachment[], board: { width: number; height: number }, name: string, generated_by?: string) => void;

  // Persistence
  saveCurrent: () => string;
  loadSaved: (id: string) => void;
  deleteSaved: (id: string) => void;
}

const blankLayout = (): AppState["workingLayout"] => ({
  name: "Untitled",
  placements: [],
  attachments: [],
  board_mm: { width: 1500, height: 800 },
  scale: "N",
});

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      inventory: emptyInventory("N"),
      workingLayout: blankLayout(),
      savedLayouts: [],

      invAdd: (code, qty) => set((s) => ({ inventory: addPiece(s.inventory, code, qty) })),
      invRemove: (code, qty) => set((s) => ({ inventory: removePiece(s.inventory, code, qty) })),
      invMarkUsed: (code, qty) => set((s) => ({ inventory: markUsed(s.inventory, code, qty) })),
      invFreeUsed: (code, qty) => set((s) => ({ inventory: freeUsed(s.inventory, code, qty) })),
      invAddSet: (code, qty) => {
        const r = addSet(get().inventory, catalog, code, qty);
        set({ inventory: r.inventory });
        return r.warning ?? null;
      },
      invReplace: (inv) => set({ inventory: inv }),

      layoutSetName: (name) =>
        set((s) => ({ workingLayout: { ...s.workingLayout, name } })),
      layoutSetBoard: (board_mm) =>
        set((s) => ({ workingLayout: { ...s.workingLayout, board_mm } })),
      layoutSetScale: (scale) =>
        set((s) => ({ workingLayout: { ...s.workingLayout, scale } })),
      layoutAddPlacement: (p) =>
        set((s) => ({
          workingLayout: { ...s.workingLayout, placements: [...s.workingLayout.placements, p] },
        })),
      layoutAddAttachment: (a) =>
        set((s) => ({
          workingLayout: { ...s.workingLayout, attachments: [...s.workingLayout.attachments, a] },
        })),
      layoutRemovePlacement: (id) =>
        set((s) => ({
          workingLayout: {
            ...s.workingLayout,
            placements: s.workingLayout.placements.filter((p) => p.id !== id),
            attachments: s.workingLayout.attachments.filter(
              (a) => a.a.placementId !== id && a.b.placementId !== id,
            ),
          },
        })),
      layoutReset: () =>
        set((s) => {
          // Free inventory previously consumed by the current layout so
          // resetting genuinely returns pieces to "available".
          let inv = s.inventory;
          const tally: Record<string, number> = {};
          for (const p of s.workingLayout.placements) {
            tally[p.code] = (tally[p.code] ?? 0) + 1;
          }
          for (const [code, qty] of Object.entries(tally)) {
            inv = freeUsed(inv, code, qty);
          }
          return { inventory: inv, workingLayout: blankLayout() };
        }),
      layoutLoadFromGenerator: (placements, attachments, board, name, generated_by) =>
        set((s) => {
          // 1. Free whatever the current layout was consuming.
          let inv = s.inventory;
          const prev: Record<string, number> = {};
          for (const p of s.workingLayout.placements) {
            prev[p.code] = (prev[p.code] ?? 0) + 1;
          }
          for (const [code, qty] of Object.entries(prev)) {
            inv = freeUsed(inv, code, qty);
          }
          // 2. Mark the new layout's pieces as used so the inventory
          //    "available" counter matches what the canvas now shows.
          const next: Record<string, number> = {};
          for (const p of placements) {
            next[p.code] = (next[p.code] ?? 0) + 1;
          }
          for (const [code, qty] of Object.entries(next)) {
            inv = markUsed(inv, code, qty);
          }
          return {
            inventory: inv,
            workingLayout: {
              ...s.workingLayout,
              placements,
              attachments,
              board_mm: board,
              name,
              ...(generated_by ? { generated_by } : {}),
            },
          };
        }),

      saveCurrent: () => {
        const wl = get().workingLayout;
        const id = `L-${Date.now().toString(36)}`;
        const now = new Date().toISOString();
        const saved: SavedLayout = {
          id,
          name: wl.name || "Untitled",
          scale: wl.scale,
          board_mm: wl.board_mm,
          placements: wl.placements,
          attachments: wl.attachments,
          ...(wl.generated_by ? { generated_by: wl.generated_by } : {}),
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ savedLayouts: [...s.savedLayouts, saved] }));
        return id;
      },
      loadSaved: (id) => {
        const layout = get().savedLayouts.find((l) => l.id === id);
        if (!layout) return;
        set((s) => {
          // Same free-old/mark-new pattern as layoutLoadFromGenerator,
          // so loading a saved layout keeps inventory in sync.
          let inv = s.inventory;
          const prev: Record<string, number> = {};
          for (const p of s.workingLayout.placements) {
            prev[p.code] = (prev[p.code] ?? 0) + 1;
          }
          for (const [code, qty] of Object.entries(prev)) {
            inv = freeUsed(inv, code, qty);
          }
          const next: Record<string, number> = {};
          for (const p of layout.placements) {
            next[p.code] = (next[p.code] ?? 0) + 1;
          }
          for (const [code, qty] of Object.entries(next)) {
            inv = markUsed(inv, code, qty);
          }
          return {
            inventory: inv,
            workingLayout: {
              name: layout.name,
              placements: layout.placements,
              attachments: layout.attachments,
              board_mm: layout.board_mm,
              scale: layout.scale,
              ...(layout.generated_by ? { generated_by: layout.generated_by } : {}),
            },
          };
        });
      },
      deleteSaved: (id) =>
        set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.id !== id) })),
    }),
    {
      name: "kato-unitrack",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
