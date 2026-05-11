import { useApp } from "../store";

export function LayoutsPage() {
  const saved = useApp((s) => s.savedLayouts);
  const load = useApp((s) => s.loadSaved);
  const del = useApp((s) => s.deleteSaved);

  if (saved.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        No saved layouts. Build one in the <span className="text-amber-400">Editor</span> tab and
        click <span className="text-amber-400">Save layout</span>.
      </div>
    );
  }

  return (
    <div className="p-4">
      <table className="w-full text-sm">
        <thead className="text-zinc-500 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left py-1.5">Name</th>
            <th className="text-left py-1.5">Scale</th>
            <th className="text-left py-1.5">Pieces</th>
            <th className="text-left py-1.5">Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {saved.map((l) => (
            <tr key={l.id} className="border-t border-zinc-800/70">
              <td className="py-1.5">{l.name}</td>
              <td className="py-1.5">{l.scale}</td>
              <td className="py-1.5">{l.placements.length}</td>
              <td className="py-1.5 text-zinc-500">{new Date(l.updated_at).toLocaleString()}</td>
              <td className="py-1.5 text-right space-x-2">
                <button className="btn text-xs" onClick={() => load(l.id)}>Load</button>
                <button
                  className="btn text-xs"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(l, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${l.name}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export JSON
                </button>
                <button className="btn text-xs" onClick={() => del(l.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
