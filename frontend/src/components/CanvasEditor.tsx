/**
 * SVG-based interactive editor.
 *
 *   - Pan: drag with middle / space + drag, or just drag empty space.
 *   - Zoom: mouse wheel (centered on cursor).
 *   - Place piece: pick a piece in the catalog sidebar → it follows
 *     the cursor → click in the canvas to drop it. If the cursor is
 *     near a free connector, the geometry engine snaps to it.
 *   - Select: click a placed piece. Delete with the Delete/Backspace key.
 *   - Rotate selected piece: R / Shift+R for ±15° (free rotation
 *     applies when the piece is not snapped to anything; once
 *     attached, rotation comes from geometry).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectionWorld,
  findSnapCandidate,
  placementForAttach,
  renderPieceBody,
  validate,
  type Layout,
  type Placement,
} from "@kato-unitrack/geometry-engine";
import { useApp } from "../store";
import { catalog } from "../catalog";
import type { PieceDefinition } from "@kato-unitrack/catalog";
import { t, useLang } from "../lib/i18n";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}

export function CanvasEditor() {
  useLang();
  const layout = useApp((s) => s.workingLayout);
  const addPlacement = useApp((s) => s.layoutAddPlacement);
  const addAttachment = useApp((s) => s.layoutAddAttachment);
  const removePlacement = useApp((s) => s.layoutRemovePlacement);
  const inv = useApp((s) => s.inventory);
  const invMarkUsed = useApp((s) => s.invMarkUsed);
  const invFreeUsed = useApp((s) => s.invFreeUsed);

  const [view, setView] = useState<ViewState>({ panX: 200, panY: 100, zoom: 0.7 });
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; pan0: ViewState } | null>(null);

  const pieces = useMemo(() => catalog.geometryMap(), []);

  const screenToWorld = (sx: number, sy: number) => {
    if (!svgRef.current) return [0, 0] as [number, number];
    const r = svgRef.current.getBoundingClientRect();
    return [
      (sx - r.left - view.panX) / view.zoom,
      -(sy - r.top - view.panY) / view.zoom, // SVG Y is flipped below
    ] as [number, number];
  };

  const pickedPiece = pickedCode ? catalog.byCode.get(pickedCode) ?? null : null;
  const pickedGeom = pickedCode ? pieces.get(pickedCode) ?? null : null;

  // The ghost placement that follows the cursor while a piece is picked.
  const ghost: Placement | null = useMemo(() => {
    if (!pickedPiece || !pickedGeom || !cursor) return null;
    const snap = findSnapCandidate(
      { placements: layout.placements, attachments: layout.attachments },
      pieces,
      pickedGeom,
      { x: cursor.x, y: cursor.y },
      { placementId: "ghost", searchRadiusMm: 30, candidateConnectionId: "A" },
    );
    if (snap) return { ...snap.placement, id: "ghost", mirrored };
    return {
      id: "ghost",
      code: pickedPiece.code,
      position_mm: [cursor.x, cursor.y],
      rotation_deg: 0,
      mirrored,
    };
  }, [pickedPiece, pickedGeom, cursor, layout.placements, layout.attachments, pieces, mirrored]);

  // Snap target highlight
  const snapHint = useMemo(() => {
    if (!pickedGeom || !cursor) return null;
    const snap = findSnapCandidate(
      { placements: layout.placements, attachments: layout.attachments },
      pieces,
      pickedGeom,
      { x: cursor.x, y: cursor.y },
      { placementId: "h", searchRadiusMm: 30, candidateConnectionId: "A" },
    );
    return snap?.target.world.position ?? null;
  }, [pickedGeom, cursor, layout.placements, layout.attachments, pieces]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") {
        setPickedCode(null);
        setSelected(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        const removed = layout.placements.find((p) => p.id === selected);
        if (removed) invFreeUsed(removed.code, 1);
        removePlacement(selected);
        setSelected(null);
      }
      if (e.key === "m" && pickedCode) {
        setMirrored((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pickedCode, layout.placements, removePlacement, invFreeUsed]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      setView({
        ...dragRef.current.pan0,
        panX: dragRef.current.pan0.panX + (e.clientX - dragRef.current.startX),
        panY: dragRef.current.pan0.panY + (e.clientY - dragRef.current.startY),
      });
      return;
    }
    const [x, y] = screenToWorld(e.clientX, e.clientY);
    setCursor({ x, y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || !pickedCode) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, pan0: view };
    }
  };
  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.altKey || !pickedPiece || !pickedGeom || !ghost) return;
    // Inventory check
    const owned = inv.entries[pickedPiece.code];
    const available = owned ? Math.max(0, owned.owned - owned.used) : 0;
    if (available <= 0) return;
    // Did we land on a snap target?
    const snap = findSnapCandidate(
      { placements: layout.placements, attachments: layout.attachments },
      pieces,
      pickedGeom,
      { x: cursor!.x, y: cursor!.y },
      { placementId: `p-${Date.now()}`, searchRadiusMm: 30, candidateConnectionId: "A" },
    );
    const id = `p-${Date.now().toString(36)}-${layout.placements.length}`;
    const placement: Placement = snap
      ? { ...snap.placement, id, mirrored }
      : { ...ghost, id, mirrored };
    addPlacement(placement);
    invMarkUsed(pickedPiece.code, 1);
    if (snap) {
      addAttachment({
        a: { placementId: snap.target.placementId, connectionId: snap.target.connectionId },
        b: { placementId: id, connectionId: snap.candidateConnectionId },
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const factor = Math.pow(1.1, -e.deltaY / 100);
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const r = svgRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    // Keep cursor world position stable while zooming.
    const wxBefore = (cx - view.panX) / view.zoom;
    const wyBefore = (cy - view.panY) / view.zoom;
    const wxAfter = (cx - view.panX) / z;
    const wyAfter = (cy - view.panY) / z;
    setView({
      zoom: z,
      panX: view.panX + (wxAfter - wxBefore) * z,
      panY: view.panY + (wyAfter - wyBefore) * z,
    });
  };

  // Validation feedback
  const valid = useMemo(() => {
    if (layout.placements.length === 0) return null;
    const result = validate(
      { placements: layout.placements, attachments: layout.attachments },
      pieces,
    );
    return result;
  }, [layout.placements, layout.attachments, pieces]);

  return (
    <div className="h-full flex">
      <Sidebar pickedCode={pickedCode} setPickedCode={setPickedCode} mirrored={mirrored} setMirrored={setMirrored} />
      <div className="flex-1 relative bg-zinc-900">
        <svg
          ref={svgRef}
          data-testid="canvas-editor"
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        >
          {/* world space group */}
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom} ${-view.zoom})`}>
            <BoardOutline board={layout.board_mm} />
            <Grid step={50} extent={Math.max(layout.board_mm.width, layout.board_mm.height) * 1.2} />
            {layout.placements.map((p) => (
              <PieceSVG
                key={p.id}
                placement={p}
                pieces={pieces}
                catalog={catalog}
                selected={p.id === selected}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!pickedCode) setSelected(p.id);
                }}
              />
            ))}
            {ghost && pickedPiece && <PieceSVG placement={ghost} pieces={pieces} catalog={catalog} ghost />}
            {snapHint && (
              <circle cx={snapHint[0]} cy={snapHint[1]} r={4 / view.zoom} fill="#fde68a" />
            )}
          </g>
        </svg>
        <div className="absolute top-2 left-2 bg-zinc-950/80 border border-zinc-800 rounded px-3 py-2 text-xs space-y-0.5 pointer-events-none">
          <div>{t("canvas.status.placements")}: <span className="text-amber-400">{layout.placements.length}</span></div>
          <div>{t("canvas.status.attachments")}: <span className="text-amber-400">{layout.attachments.length}</span></div>
          {valid && (
            <>
              <div className={valid.ok ? "text-emerald-400" : "text-rose-400"}>
                {valid.ok ? t("canvas.status.geomOk") : t("canvas.status.geomErrors", { n: valid.errors.length })}
              </div>
              <div>{t("canvas.status.openEnds")}: <span className="text-amber-400">{valid.openEnds.length}</span></div>
            </>
          )}
          <div className="text-zinc-500">{t("canvas.status.zoom")}: {view.zoom.toFixed(2)}×</div>
        </div>
        <div className="absolute bottom-2 right-2 bg-zinc-950/80 border border-zinc-800 rounded px-3 py-2 text-[11px] text-zinc-400 pointer-events-none">
          <div>
            <kbd className="text-amber-400">{t("canvas.kbd.click")}</kbd> {t("canvas.help.kbds")
              .split(" · ").slice(0, 1).join("")
              .replace("{click} ", "")
              .replace("{wheel}", "").replace("{alt}", "").replace("{m}", "").replace("{del}", "").replace("{esc}", "")
              .trim() || ""}
          </div>
          <div className="text-zinc-500">
            <kbd className="text-amber-400">{t("canvas.kbd.click")}</kbd>·
            <kbd className="text-amber-400 mx-1">{t("canvas.kbd.wheel")}</kbd>·
            <kbd className="text-amber-400 mx-1">{t("canvas.kbd.alt")}</kbd>·
            <kbd className="text-amber-400 mx-1">{t("canvas.kbd.m")}</kbd>·
            <kbd className="text-amber-400 mx-1">{t("canvas.kbd.del")}</kbd>·
            <kbd className="text-amber-400 mx-1">{t("canvas.kbd.esc")}</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardOutline({ board }: { board: { width: number; height: number } }) {
  return (
    <rect x={0} y={0} width={board.width} height={board.height} fill="none" stroke="#3f3f46" strokeDasharray="8 8" strokeWidth={1} />
  );
}

function Grid({ step, extent }: { step: number; extent: number }) {
  const lines: JSX.Element[] = [];
  for (let v = -extent; v <= extent; v += step) {
    lines.push(<line key={`v${v}`} x1={v} y1={-extent} x2={v} y2={extent} stroke="#27272a" strokeWidth={0.5} />);
    lines.push(<line key={`h${v}`} x1={-extent} y1={v} x2={extent} y2={v} stroke="#27272a" strokeWidth={0.5} />);
  }
  return <g pointerEvents="none">{lines}</g>;
}

function PieceSVG({
  placement,
  pieces,
  catalog,
  ghost,
  selected,
  onClick,
}: {
  placement: Placement;
  pieces: ReturnType<typeof catalog.geometryMap>;
  catalog: typeof import("../catalog").catalog;
  ghost?: boolean;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const piece = catalog.byCode.get(placement.code);
  const geom = pieces.get(placement.code);
  if (!piece || !geom) return null;
  // Use the engine's body renderer directly — no regex extraction.
  const body = renderPieceBody(geom, {
    tieColor: ghost ? "#fbbf24" : selected ? "#fde68a" : "#cbd5e1",
    railColor: ghost ? "#f59e0b" : selected ? "#fde68a" : "#fbbf24",
  });
  if (!body) return null;
  return (
    <g
      transform={`translate(${placement.position_mm[0]} ${placement.position_mm[1]}) rotate(${placement.rotation_deg}) ${placement.mirrored ? "scale(1, -1)" : ""}`}
      opacity={ghost ? 0.55 : 1}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
      data-placement-id={ghost ? undefined : placement.id}
      data-code={placement.code}
      data-ghost={ghost ? "true" : undefined}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

function Sidebar({
  pickedCode,
  setPickedCode,
  mirrored,
  setMirrored,
}: {
  pickedCode: string | null;
  setPickedCode: (c: string | null) => void;
  mirrored: boolean;
  setMirrored: (b: boolean) => void;
}) {
  useLang();
  const inv = useApp((s) => s.inventory);
  const owned: PieceDefinition[] = useMemo(() => {
    return Object.values(inv.entries)
      .filter((e) => e.owned > e.used)
      .map((e) => catalog.byCode.get(e.code)!)
      .filter(Boolean)
      .filter((p) => p.snappable);
  }, [inv]);

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
        {t("canvas.sidebar.available")}
      </div>
      <div className="flex-1 overflow-auto">
        {owned.length === 0 && (
          <div className="p-3 text-zinc-500 text-xs">
            {t("canvas.sidebar.emptyHint")}
          </div>
        )}
        {owned.map((p) => {
          const e = inv.entries[p.code]!;
          const avail = e.owned - e.used;
          const isPicked = pickedCode === p.code;
          return (
            <button
              key={p.code}
              onClick={() => setPickedCode(isPicked ? null : p.code)}
              className={`w-full text-left px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900 flex items-center gap-2 ${isPicked ? "bg-zinc-900/80" : ""}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${isPicked ? "bg-amber-400" : "bg-zinc-700"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-amber-400">{p.code}</div>
                <div className="text-[11px] truncate">{p.abbreviation ?? p.name}</div>
              </div>
              <span className="text-xs text-zinc-400">×{avail}</span>
            </button>
          );
        })}
      </div>
      {pickedCode && (
        <div className="px-3 py-2 border-t border-zinc-800 text-xs space-y-1">
          <div className="text-amber-400">{t("canvas.sidebar.picked")}: {pickedCode}</div>
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
            {t("canvas.sidebar.mirror")}
          </label>
        </div>
      )}
    </aside>
  );
}
