import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useApp } from "../store";
import { CanvasEditor } from "../components/CanvasEditor";
import { catalog } from "../catalog";
import { generateLayouts } from "@kato-unitrack/layout-generator";
import { t, useLang } from "../lib/i18n";

export function EditorPage() {
  useLang(); // re-render on language change
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

  const busyRef = useRef(false);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingTimeout.current !== null) {
        clearTimeout(pendingTimeout.current);
        pendingTimeout.current = null;
      }
    };
  }, []);

  const snappableCount = useMemo(
    () =>
      Object.values(inv.entries).reduce(
        (n, e) =>
          e.owned > 0 && catalog.byCode.get(e.code)?.snappable ? n + e.owned : n,
        0,
      ),
    [inv],
  );
  const hasOwnedSnappableTrack = snappableCount > 0;
  const canvasEmpty = wl.placements.length === 0;
  const showStarterCTA = canvasEmpty && !hasOwnedSnappableTrack;
  const showHasStockHint = canvasEmpty && hasOwnedSnappableTrack;

  const M1_OVAL_MIN_BOARD_MM = { width: 878, height: 630 } as const;

  const errorToString = (e: unknown): string => {
    if (e instanceof Error && typeof e.message === "string") return e.message;
    if (e && typeof e === "object" && "message" in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
    }
    try {
      return String(e);
    } catch {
      return t("editor.empty.error");
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
    pendingTimeout.current = setTimeout(() => {
      pendingTimeout.current = null;
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
          invReplace(inventoryBefore);
          safeSet(
            setError,
            t("editor.empty.tooSmall", {
              w: wl.board_mm.width,
              h: wl.board_mm.height,
              mw: M1_OVAL_MIN_BOARD_MM.width,
              mh: M1_OVAL_MIN_BOARD_MM.height,
            }),
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
          placeholder={t("editor.namePlaceholder")}
        />
        <label className="text-xs text-zinc-500 flex items-center gap-1">
          {t("editor.board")}
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
          aria-label={t("editor.scale")}
        >
          <option value="N">N</option>
          <option value="HO">HO</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={reset}>{t("editor.reset")}</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const id = save();
              alert(`${t("editor.savedAlert")} ${id}`);
            }}
          >
            {t("editor.save")}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <CanvasEditor />

        {showStarterCTA && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm z-10">
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg shadow-2xl max-w-md text-center">
              <h2 className="text-xl font-bold mb-2">{t("editor.empty.title")}</h2>
              <p className="text-zinc-400 mb-6">{t("editor.empty.body")}</p>
              <button
                className="btn btn-primary w-full"
                disabled={busy}
                data-testid="cta-load-starter"
                onClick={handleLoadStarter}
              >
                {busy ? t("editor.empty.loading") : t("editor.empty.cta")}
              </button>
              {error && (
                <div className="mt-4 text-rose-300 text-xs text-left">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {showHasStockHint && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
            data-testid="empty-canvas-hint"
          >
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg shadow-2xl px-5 py-3 max-w-md flex items-center gap-4">
              <div className="text-left">
                <div className="text-sm font-medium text-amber-400">
                  {t("editor.empty.hasStock.title")}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {t("editor.empty.hasStock.body", { n: snappableCount })}
                </div>
              </div>
              <NavLink
                to="/generator"
                data-testid="cta-open-generator"
                className="btn btn-primary text-xs whitespace-nowrap"
              >
                {t("editor.empty.hasStock.cta")}
              </NavLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
