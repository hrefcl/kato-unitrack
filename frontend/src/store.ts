import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  emptyInventory,
  addPiece,
  removePiece,
  markUsed,
  freeUsed,
  addSet,
  available,
  type Inventory,
} from "@kato-unitrack/inventory";
import type {
  Attachment,
  Placement,
} from "@kato-unitrack/geometry-engine";
import { catalog } from "./catalog";
import { INVENTORY_SEED } from "./data/inventorySeed";

/**
 * Build the inventory the store starts with for a brand-new installation
 * (no localStorage persistence yet). Seeds from data/inventory_seed.json
 * so a fresh clone or a freshly-cleared browser still has something
 * worth opening. Codes not present in the catalog are skipped silently
 * — the seed file documents intentional omissions in `unmapped`.
 */
function buildSeededInventory(): Inventory {
  let inv = emptyInventory(INVENTORY_SEED.scale);
  for (const item of INVENTORY_SEED.pieces) {
    if (!catalog.byCode.has(item.code)) continue;
    inv = addPiece(inv, item.code, item.qty, INVENTORY_SEED.source);
  }
  return inv;
}

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
  /** Clone a saved layout (new id, name+" (copy)"). Inventory untouched. */
  duplicateSaved: (id: string) => string | null;

  /** Edit a single placement (move / rotate / mirror). Updates inventory if code changes. */
  layoutUpdatePlacement: (id: string, patch: Partial<Placement>) => void;
  /** Duplicate the currently selected placement with a small offset. */
  layoutDuplicatePlacement: (id: string) => string | null;

  /** Restore inventory from the seed (drops user changes to inventory only). */
  restoreSeededInventory: () => void;
}

// 2 m × 1.2 m matches the real surface Francisco is building on at
// home. Wide enough for an R718 outer / R481 inner double oval with
// straight extensions; tall enough that a single R315 oval has air
// around it for scenery edits.
const DEFAULT_BOARD_MM = { width: 2000, height: 1200 };

const blankLayout = (): AppState["workingLayout"] => ({
  name: "Untitled",
  placements: [],
  attachments: [],
  board_mm: { ...DEFAULT_BOARD_MM },
  scale: "N",
});

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      inventory: buildSeededInventory(),
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
      duplicateSaved: (id) => {
        const src = get().savedLayouts.find((l) => l.id === id);
        if (!src) return null;
        // id = timestamp + 4-char random suffix to avoid same-ms collisions
        // when the user spams Duplicate.
        const newId = `L-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        const copy: SavedLayout = {
          id: newId,
          name: `${src.name} (copy)`,
          scale: src.scale,
          board_mm: { ...src.board_mm },
          // Deep-clone placements/attachments so future edits to the
          // copy don't mutate the original arrays.
          placements: src.placements.map((p) => ({
            ...p,
            position_mm: [p.position_mm[0], p.position_mm[1]] as [number, number],
          })),
          attachments: src.attachments.map((a) => ({
            a: { ...a.a },
            b: { ...a.b },
          })),
          ...(src.generated_by ? { generated_by: src.generated_by } : {}),
          created_at: now,
          updated_at: now,
        };
        // Inventory is intentionally not touched: the saved layouts
        // are snapshots; only the workingLayout reserves inventory.
        set((s) => ({ savedLayouts: [...s.savedLayouts, copy] }));
        return newId;
      },

      layoutUpdatePlacement: (id, patch) =>
        set((s) => ({
          workingLayout: {
            ...s.workingLayout,
            placements: s.workingLayout.placements.map((p) =>
              p.id === id ? ({ ...p, ...patch } as Placement) : p,
            ),
          },
        })),

      layoutDuplicatePlacement: (id) => {
        const src = get().workingLayout.placements.find((p) => p.id === id);
        if (!src) return null;
        const avail = available(get().inventory, src.code);
        if (avail <= 0) return null;
        const newId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        const dup: Placement = {
          ...src,
          id: newId,
          // Offset slightly so the duplicate is visible on the canvas.
          position_mm: [src.position_mm[0] + 30, src.position_mm[1] + 30],
        };
        set((s) => ({
          workingLayout: {
            ...s.workingLayout,
            placements: [...s.workingLayout.placements, dup],
          },
          inventory: markUsed(s.inventory, src.code, 1),
        }));
        return newId;
      },

      restoreSeededInventory: () =>
        set((s) => {
          // Free anything currently consumed by the working layout first
          // so the seed lands on a clean ledger.
          let inv = buildSeededInventory();
          for (const p of s.workingLayout.placements) {
            inv = markUsed(inv, p.code, 1);
          }
          return { inventory: inv };
        }),
    }),
    {
      name: "kato-unitrack",
      storage: createJSONStorage(() => localStorage),
      // The PM explicitly wants the seed as THE base inventory. Earlier
      // attempts (v2) tried to be polite and only seeded when the
      // existing inventory looked empty, but users who'd played with
      // the M1 starter ended up stuck in a hybrid state that hid the
      // real default. v3 is intentionally aggressive: every old store
      // (< 3) is restored to the seed at boot. Saved layouts are
      // preserved; only `inventory` and a blank board are reset.
      version: 3,
      migrate: (persistedState, oldVersion) => {
        const s = persistedState as Partial<AppState> & {
          workingLayout?: AppState["workingLayout"];
        };
        if (oldVersion < 3) {
          s.inventory = buildSeededInventory();
          if (s.workingLayout && s.workingLayout.placements.length === 0) {
            s.workingLayout = {
              ...s.workingLayout,
              board_mm: { ...DEFAULT_BOARD_MM },
            };
          }
        }
        return s as AppState;
      },
    },
  ),
);
