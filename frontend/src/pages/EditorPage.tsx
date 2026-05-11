import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { CanvasEditor } from "../components/CanvasEditor";
import { catalog } from "../catalog";
import { generateLayouts } from "@kato-unitrack/layout-generator";

export function EditorPage() {
  const wl = useApp((s) => s.workingLayout);
  const inv = useApp((s) => s.inventory);
  const setName = useApp((s) => s.layoutSetName);
  const setBoard = useApp((s) => s.layoutSetBoard);
  const setScale = useApp((s) => s.layoutSetScale);
  const reset = useApp((s) => s.layoutReset);
  const save = useApp((s) => s.saveCurrent);
  const invAddSet = useApp((s) => s.invAddSet);
  const invReplace = useApp((s) => s.invReplace);
  const layoutLoadFromGenerator = useApp((s) => s.layoutLoadFromGenerator);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous busy flag — `busy` state cannot guard a second click
  // that fires before React commits the render, because the second
  // handler's closure still sees `busy === false`. A ref is read/written
  // synchronously and closes the race window.
  const busyRef = useRef(false);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // React 18 StrictMode runs effect cleanup once between simulated
    // unmount and remount. We must reassert `mounted = true` on every
    // mount, otherwise the post-strict-cleanup state has mounted=false
    // forever and safeSet() would silently swallow every legitimate
    // setBusy / setError after the first render.
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingTimeout.current !== null) {
        clearTimeout(pendingTimeout.current);
        pendingTimeout.current = null;
      }
    };
  }, []);

  // First-run gating: only show the CTA when the canvas has no pieces
  // AND the inventory has no *snappable* track. Owning only accessories
  // (joiners, power packs, sets that didn't decompose) should still
  // surface the starter CTA, since the editor cannot use them.
  const hasOwnedSnappableTrack = useMemo(
    () =>
      Object.values(inv.entries).some(
        (e) => e.owned > 0 && catalog.byCode.get(e.code)?.snappable,
      ),
    [inv],
  );
  const showStarterCTA = wl.placements.length === 0 && !hasOwnedSnappableTrack;

  // Minimum board the generator can actually produce an oval on with the
  // pieces M1 ships: a single S248 per side plus two R315-45 semicircles.
  //   width  = L_straight + 2·R = 248 + 2·315 = 878 mm
  //   height = 2·R              = 2·315       = 630 mm
  // This is the engine's truth; the PDF's larger 1337×677 footprint is
  // for the catalog photo arrangement, which the generator never recreates.
  const M1_OVAL_MIN_BOARD_MM = { width: 878, height: 630 } as const;

  // Robust error-to-string. Catches `throw "literal"`, `throw null`,
  // `throw { message: 123 }`, etc., without itself throwing.
  const errorToString = (e: unknown): string => {
    if (e instanceof Error && typeof e.message === "string") return e.message;
    if (e && typeof e === "object" && "message" in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
    }
    try {
      return String(e);
    } catch {
      return "Unexpected error while loading starter set.";
    }
  };

  const safeSet = <T,>(setter: (v: T) => void, value: T): void => {
    if (mounted.current) setter(value);
  };

  const handleLoadStarter = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    // Defer the synchronous work one tick so React commits the "Loading…"
    // render before the generator blocks the main thread.
    pendingTimeout.current = setTimeout(() => {
      pendingTimeout.current = null;
      // Snapshot inventory BEFORE adding the set so we can roll back if
      // the generator refuses to produce a layout (e.g. board too small).
      const inventoryBefore = useApp.getState().inventory;
      try {
        invAddSet("20-852", 1);
        const updatedInventory = useApp.getState().inventory;
        const results = generateLayouts({
          catalog,
          inventory: updatedInventory,
          board_mm: wl.board_mm,
          scale: wl.scale,
          preferences: { maxResults: 1 },
        });
        if (results.length === 0) {
          // Atomically restore the prior inventory through the store
          // action — never bypass the store with setState.
          invReplace(inventoryBefore);
          safeSet(setError,
            `No oval fits a ${wl.board_mm.width}×${wl.board_mm.height} mm board with the M1 set. The smallest oval the generator can build needs at least ${M1_OVAL_MIN_BOARD_MM.width}×${M1_OVAL_MIN_BOARD_MM.height} mm.`,
          );
          return;
        }
        const first = results[0]!.layout;
        layoutLoadFromGenerator(
          [...first.placements],
          [...first.attachments],
          { ...first.board_mm },
          first.name,
          first.strategy,
        );
      } catch (err) {
        invReplace(inventoryBefore);
        safeSet(setError, errorToString(err));
      } finally {
        busyRef.current = false;
        safeSet(setBusy, false);
      }
    }, 0);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
        <input
          className="input max-w-[16rem]"
          value={wl.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Layout name"
        />
        <label className="text-xs text-zinc-500 flex items-center gap-1">
          Board (mm)
          <input
            type="number"
            className="input w-24"
            value={wl.board_mm.width}
            onChange={(e) => setBoard({ width: Number(e.target.value), height: wl.board_mm.height })}
          />
          ×
          <input
            type="number"
            className="input w-24"
            value={wl.board_mm.height}
            onChange={(e) => setBoard({ width: wl.board_mm.width, height: Number(e.target.value) })}
          />
        </label>
        <select
          className="input max-w-[6rem]"
          value={wl.scale}
          onChange={(e) => setScale(e.target.value as "N" | "HO")}
        >
          <option value="N">N</option>
          <option value="HO">HO</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={reset}>Reset</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const id = save();
              alert(`Saved as ${id}`);
            }}
          >
            Save layout
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <CanvasEditor />

        {showStarterCTA && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm z-10">
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg shadow-2xl max-w-md text-center">
              <h2 className="text-xl font-bold mb-2">Start your layout</h2>
              <p className="text-zinc-400 mb-6">
                Your inventory is empty. Load the KATO M1 Basic Oval Set (8&times;R315-45 curves + 4&times;S248 straights and a few extras) to see a complete sample oval, or browse the <span className="text-amber-400">Catálogo</span> tab to pick pieces by hand.
              </p>
              <button
                className="btn btn-primary w-full"
                disabled={busy}
                onClick={handleLoadStarter}
              >
                {busy ? "Loading…" : "Load M1 starter set + sample oval"}
              </button>
              {error && (
                <div className="mt-4 text-rose-300 text-xs text-left">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
