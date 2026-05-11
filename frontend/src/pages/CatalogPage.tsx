import { useMemo, useState } from "react";
import { catalog } from "../catalog";
import { PieceThumb } from "../components/PieceThumb";
import { useApp } from "../store";

export function CatalogPage() {
  const [q, setQ] = useState("");
  const [scale, setScale] = useState<"all" | "N" | "HO" | "Acc">("all");
  const [category, setCategory] = useState<string>("all");
  const invAdd = useApp((s) => s.invAdd);

  const allCategories = useMemo(
    () => [...new Set(catalog.all.map((p) => p.category))].sort(),
    [],
  );

  const filtered = useMemo(() => {
    let list = catalog.all;
    if (q.trim()) list = catalog.search(q.trim());
    if (scale !== "all") list = list.filter((p) => p.scale === scale);
    if (category !== "all") list = list.filter((p) => p.category === category);
    return list.slice(0, 400);
  }, [q, scale, category]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search by code, name, R315-45..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input max-w-[8rem]" value={scale} onChange={(e) => setScale(e.target.value as "all" | "N" | "HO" | "Acc")}>
          <option value="all">All scales</option>
          <option value="N">N</option>
          <option value="HO">HO</option>
          <option value="Acc">Accessory</option>
        </select>
        <select className="input max-w-[14rem]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-zinc-500 text-xs ml-auto">{filtered.length} of {catalog.all.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {filtered.map((p) => (
          <div key={p.code} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <PieceThumb piece={p} size={80} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-amber-400 font-mono">{p.code}</div>
                <div className="text-sm leading-tight truncate" title={p.name}>{p.name}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{p.category}{p.subcategory ? ` · ${p.subcategory}` : ""}</div>
              </div>
            </div>
            <div className="text-[11px] text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
              {p.length_mm !== null && <span>L {p.length_mm}mm</span>}
              {p.radius_mm !== null && <span>R {p.radius_mm}mm</span>}
              {p.angle_degrees !== null && <span>{p.angle_degrees}°</span>}
              {p.price_usd !== null && <span>${p.price_usd}</span>}
              {p.pack.raw && <span>{p.pack.raw}</span>}
            </div>
            <button className="btn text-xs mt-auto" onClick={() => invAdd(p.code, p.pack.quantity ?? 1)}>
              + Add to inventory ({p.pack.quantity ?? 1})
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
