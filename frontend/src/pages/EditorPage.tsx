import { useApp } from "../store";
import { CanvasEditor } from "../components/CanvasEditor";

export function EditorPage() {
  const wl = useApp((s) => s.workingLayout);
  const setName = useApp((s) => s.layoutSetName);
  const setBoard = useApp((s) => s.layoutSetBoard);
  const setScale = useApp((s) => s.layoutSetScale);
  const reset = useApp((s) => s.layoutReset);
  const save = useApp((s) => s.saveCurrent);

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
      <div className="flex-1 min-h-0">
        <CanvasEditor />
      </div>
    </div>
  );
}
