import { useMemo, useState } from "react";
import { useApp } from "../store";
import { catalog } from "../catalog";
import { PieceThumb } from "../components/PieceThumb";
import { INVENTORY_SEED } from "../data/inventorySeed";
import { t, useLang } from "../lib/i18n";

export function InventoryPage() {
  useLang();
  const inv = useApp((s) => s.inventory);
  const invAdd = useApp((s) => s.invAdd);
  const invRemove = useApp((s) => s.invRemove);
  const invAddSet = useApp((s) => s.invAddSet);
  const restoreSeed = useApp((s) => s.restoreSeededInventory);
  const [setCode, setSetCode] = useState("20-852");
  const [warning, setWarning] = useState<string | null>(null);

  const seedPieceCount = useMemo(
    () => INVENTORY_SEED.pieces.reduce((n, p) => n + p.qty, 0),
    [],
  );

  const rows = useMemo(() => {
    return Object.values(inv.entries)
      .filter((e) => e.owned > 0)
      .map((e) => ({ entry: e, piece: catalog.byCode.get(e.code) }))
      .filter((r) => r.piece)
      .sort((a, b) => a.piece!.category.localeCompare(b.piece!.category));
  }, [inv]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        <div className="text-sm text-zinc-300">
          {t("inventory.totalPieces")}:{" "}
          <span className="text-amber-400 font-medium">
            {rows.reduce((n, r) => n + r.entry.owned, 0)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn text-xs"
            data-testid="restore-seed"
            onClick={() => {
              const ok = window.confirm(
                t("inventory.restoreSeed.confirm", { n: seedPieceCount }),
              );
              if (!ok) return;
              restoreSeed();
              setWarning(t("inventory.restoreSeed.done"));
            }}
          >
            {t("inventory.restoreSeed")}
          </button>
          <input
            className="input max-w-[12rem]"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            placeholder={t("inventory.setCode")}
          />
          <button
            className="btn btn-primary"
            onClick={() => setWarning(invAddSet(setCode, 1))}
          >
            {t("inventory.addSet")}
          </button>
        </div>
      </div>
      {warning && (
        <div className="bg-amber-950/50 border-b border-amber-900 text-amber-300 px-4 py-2 text-xs">
          {warning}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        {rows.length === 0 ? (
          <div className="text-zinc-500 text-sm">
            {t("inventory.empty")} <span className="text-amber-400 font-mono">20-852</span>
            {t("inventory.emptyEnd")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left pl-2 py-1.5">{t("inventory.col.code")}</th>
                <th className="text-left py-1.5">{t("inventory.col.name")}</th>
                <th className="text-right py-1.5">{t("inventory.col.owned")}</th>
                <th className="text-right py-1.5">{t("inventory.col.used")}</th>
                <th className="text-right py-1.5 pr-2">{t("inventory.col.available")}</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, piece }) => (
                <tr key={entry.code} className="border-t border-zinc-800/70 hover:bg-zinc-900/50">
                  <td className="pl-2 py-1.5 font-mono text-amber-400 text-xs align-middle">
                    <div className="flex items-center gap-2">
                      <PieceThumb piece={piece!} size={36} />
                      {entry.code}
                    </div>
                  </td>
                  <td className="py-1.5">{piece!.name}</td>
                  <td className="py-1.5 text-right">{entry.owned}</td>
                  <td className="py-1.5 text-right">{entry.used}</td>
                  <td className="py-1.5 text-right pr-2 text-amber-300">{Math.max(0, entry.owned - entry.used)}</td>
                  <td className="py-1.5 text-right pr-2 space-x-1">
                    <button className="btn text-xs" onClick={() => invAdd(entry.code, 1)}>+1</button>
                    <button className="btn text-xs" onClick={() => invRemove(entry.code, 1)}>−1</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
