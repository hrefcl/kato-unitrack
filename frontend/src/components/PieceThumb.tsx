import { useMemo } from "react";
import type { PieceDefinition } from "@kato-unitrack/catalog";
import { renderPieceSvg } from "@kato-unitrack/geometry-engine";
import { t, useLang } from "../lib/i18n";

interface Props {
  piece: PieceDefinition;
  size?: number;
  className?: string;
}

/**
 * Renders a piece. For snappable pieces we generate the SVG from
 * geometry. For non-snappable pieces (sets, accessories, locos) we
 * show a placeholder card until `scripts/extract-pdf-assets.mjs`
 * lands.
 */
export function PieceThumb({ piece, size = 88, className }: Props) {
  useLang();
  const svg = useMemo(() => {
    if (!piece.snappable) return null;
    return renderPieceSvg(piece as never, {
      tieColor: "#cbd5e1",
      railColor: "#fbbf24",
    });
  }, [piece]);

  if (svg) {
    return (
      <div
        className={`bg-zinc-950 border border-zinc-800 rounded ${className ?? ""}`}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div
      className={`bg-zinc-900 border border-dashed border-zinc-700 rounded flex items-center justify-center text-zinc-600 text-[10px] text-center px-1 ${className ?? ""}`}
      style={{ width: size, height: size }}
      title={t("thumb.tooltip")}
    >
      {t("thumb.noPreview")}<br />{t("thumb.noPreviewSub")}
    </div>
  );
}
