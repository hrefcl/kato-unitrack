import { useState } from "react";
import { useApp } from "../store";
import { catalog } from "../catalog";
import {
  downloadDataUrl,
  downloadText,
  exportLayoutSvg,
  sanitizeFilename,
  svgStringToPngDataUrl,
} from "../lib/layoutExport";
import { t, useLang } from "../lib/i18n";

export function LayoutsPage() {
  useLang();
  const saved = useApp((s) => s.savedLayouts);
  const load = useApp((s) => s.loadSaved);
  const del = useApp((s) => s.deleteSaved);
  const duplicate = useApp((s) => s.duplicateSaved);

  const [busyPng, setBusyPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExportSvg = (layoutId: string) => {
    const l = saved.find((s) => s.id === layoutId);
    if (!l) return;
    try {
      const svg = exportLayoutSvg(
        { placements: l.placements, board_mm: l.board_mm },
        catalog.geometryMap(),
      );
      downloadText(`${sanitizeFilename(l.name)}.svg`, svg, "image/svg+xml");
    } catch (err) {
      setError(t("layouts.export.failed", { kind: "SVG", error: (err as Error).message ?? String(err) }));
    }
  };

  const handleExportPng = async (layoutId: string) => {
    if (busyPng) return;
    const l = saved.find((s) => s.id === layoutId);
    if (!l) return;
    setBusyPng(layoutId);
    setError(null);
    try {
      const svg = exportLayoutSvg(
        { placements: l.placements, board_mm: l.board_mm },
        catalog.geometryMap(),
      );
      const dataUrl = await svgStringToPngDataUrl(svg, { widthPx: 2000 });
      downloadDataUrl(`${sanitizeFilename(l.name)}.png`, dataUrl);
    } catch (err) {
      setError(t("layouts.export.failed", { kind: "PNG", error: (err as Error).message ?? String(err) }));
    } finally {
      setBusyPng(null);
    }
  };

  const handleExportJson = (l: typeof saved[number]) => {
    downloadText(
      `${sanitizeFilename(l.name)}.json`,
      JSON.stringify(l, null, 2),
      "application/json",
    );
  };

  if (saved.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        {t("layouts.empty")}
      </div>
    );
  }

  const ordered = [...saved].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <div className="p-4">
      {error && (
        <div className="mb-3 text-rose-300 text-xs bg-rose-950/40 border border-rose-900 rounded px-3 py-2">
          {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-zinc-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left py-1.5">{t("layouts.col.name")}</th>
            <th className="text-left py-1.5">{t("layouts.col.scale")}</th>
            <th className="text-left py-1.5">{t("layouts.col.pieces")}</th>
            <th className="text-left py-1.5">{t("layouts.col.updated")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((l) => (
            <tr key={l.id} className="border-t border-zinc-800/70">
              <td className="py-1.5">
                {l.name}
                {l.generated_by && (
                  <span className="ml-2 text-[10px] text-zinc-500">[{l.generated_by}]</span>
                )}
              </td>
              <td className="py-1.5">{l.scale}</td>
              <td className="py-1.5">{l.placements.length}</td>
              <td className="py-1.5 text-zinc-500">
                {new Date(l.updated_at).toLocaleString()}
              </td>
              <td className="py-1.5 text-right space-x-2">
                <button className="btn text-xs" onClick={() => load(l.id)}>{t("layouts.action.load")}</button>
                <button className="btn text-xs" onClick={() => duplicate(l.id)}>{t("layouts.action.duplicate")}</button>
                <button className="btn text-xs" onClick={() => handleExportSvg(l.id)}>
                  {t("layouts.action.exportSvg")}
                </button>
                <button
                  className="btn text-xs"
                  disabled={busyPng !== null}
                  title={busyPng !== null && busyPng !== l.id ? t("layouts.pngBusyTitle") : undefined}
                  onClick={() => handleExportPng(l.id)}
                >
                  {busyPng === l.id ? t("layouts.action.exportPngBusy") : t("layouts.action.exportPng")}
                </button>
                <button className="btn text-xs" onClick={() => handleExportJson(l)}>
                  {t("layouts.action.exportJson")}
                </button>
                <button className="btn text-xs" onClick={() => del(l.id)}>{t("layouts.action.delete")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
