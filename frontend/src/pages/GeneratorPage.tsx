import { useMemo, useState } from "react";
import { useApp } from "../store";
import { catalog } from "../catalog";
import { generateLayouts } from "@kato-unitrack/layout-generator";
import { t, useLang } from "../lib/i18n";

export function GeneratorPage() {
  useLang();
  const inv = useApp((s) => s.inventory);
  const scale = useApp((s) => s.workingLayout.scale);
  const board = useApp((s) => s.workingLayout.board_mm);
  const setBoard = useApp((s) => s.layoutSetBoard);
  const loadGen = useApp((s) => s.layoutLoadFromGenerator);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReturnType<typeof generateLayouts>>([]);

  const run = () => {
    setRunning(true);
    try {
      const r = generateLayouts({
        catalog,
        inventory: inv,
        board_mm: board,
        scale,
        preferences: { maxResults: 6 },
      });
      setResults(r);
    } finally {
      setRunning(false);
    }
  };

  const hasAnyTrack = useMemo(
    () => Object.values(inv.entries).some((e) => e.owned - e.used > 0),
    [inv],
  );

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400">{t("generator.intro")}</div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-xs text-zinc-500 flex items-center gap-1">
            {t("editor.board")}
            <input
              className="input w-24"
              type="number"
              value={board.width}
              onChange={(e) => setBoard({ width: Number(e.target.value), height: board.height })}
            />
            ×
            <input
              className="input w-24"
              type="number"
              value={board.height}
              onChange={(e) => setBoard({ width: board.width, height: Number(e.target.value) })}
            />
          </label>
          <button className="btn btn-primary" disabled={running || !hasAnyTrack} onClick={run}>
            {running ? t("generator.running") : t("generator.run")}
          </button>
          {!hasAnyTrack && <span className="text-rose-400 text-xs">{t("generator.emptyInv")}</span>}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="text-zinc-500 text-sm">{t("generator.noResults")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((r, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-amber-400 text-sm font-medium">{r.layout.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {t("generator.strategy")}: {r.layout.strategy}
                  </div>
                </div>
                <button
                  className="btn btn-primary text-xs"
                  onClick={() => {
                    loadGen(
                      r.layout.placements as never,
                      r.layout.attachments as never,
                      r.layout.board_mm,
                      r.layout.name,
                      r.layout.strategy,
                    );
                  }}
                >
                  {t("generator.openInEditor")}
                </button>
              </div>
              <div className="text-xs text-zinc-300 mt-2">{r.layout.notes}</div>
              <div className="text-[11px] text-zinc-500 mt-2">
                {t("generator.piecesUsed")}:{" "}
                {Object.entries(r.layout.inventory_usage)
                  .map(([k, v]) => `${k}×${v}`)
                  .join(", ")}
              </div>
              {r.warnings.length > 0 && (
                <div className="text-[11px] text-amber-300 mt-2">
                  {r.warnings.length} {t("generator.warnings")}:{" "}
                  {r.warnings.slice(0, 3).join("; ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
