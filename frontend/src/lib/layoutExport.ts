/**
 * Browser-only helpers around the engine's renderLayoutToSvgString.
 *
 * Responsibilities:
 *   - sanitize user-controlled filenames before they hit
 *     `<a download="…">`
 *   - rasterize SVG → PNG via Canvas with explicit pixel-size caps so a
 *     200-piece layout cannot OOM a mobile browser
 *   - trigger file downloads
 *
 * The geometry engine produces the SVG; this module only does the
 * browser plumbing.
 */

import {
  renderLayoutToSvgString,
  type LayoutSvgOptions,
  type PieceGeometry,
} from "@kato-unitrack/geometry-engine";

export type ExportLayoutInput = Parameters<typeof renderLayoutToSvgString>[0];

export interface SvgToPngOptions {
  /** Target width in CSS pixels. Default 2000. Capped by `maxPixels`. */
  widthPx?: number;
  /** Background colour applied to the canvas before drawing. Default #0a0a0a. */
  backgroundColor?: string;
  /** Total pixel-budget for width × height. Default 32_000_000 (~32 MP). */
  maxPixels?: number;
}

const DEFAULT_WIDTH_PX = 2000;
const DEFAULT_MAX_PIXELS = 32_000_000; // ~32 MP — safe on modern mobile
const DEFAULT_BG = "#0a0a0a";

/**
 * Make a user-supplied layout name safe to use as a download filename.
 * Strips path separators, control chars and reserved Windows characters.
 * Preserves the file extension when the input ends with `.ext` so a
 * second sanitize pass cannot eat the extension via the 80-char cap.
 * Result is never empty and never longer than 80 chars total.
 */
export function sanitizeFilename(name: string, fallback = "layout"): string {
  const raw = name ?? "";
  // Split out a trailing extension (≤ 8 chars, alphanumeric) so we can
  // re-attach it after truncation.
  const m = raw.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  const baseRaw = m ? m[1]! : raw;
  const ext = m ? m[2]! : "";
  let base = baseRaw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "_")
    .replace(/[ .]+$/g, "")
    .trim();
  if (base.length === 0) base = fallback;
  const MAX = 80;
  const allowedBase = Math.max(1, MAX - ext.length);
  if (base.length > allowedBase) base = base.slice(0, allowedBase);
  return base + ext;
}

/** Trigger a browser download of arbitrary text content. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Trigger a browser download of a binary dataURL. */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportLayoutSvg(
  layout: ExportLayoutInput,
  geometryMap: ReadonlyMap<string, PieceGeometry>,
  options?: LayoutSvgOptions,
): string {
  return renderLayoutToSvgString(layout, geometryMap, {
    showBoard: true,
    showGrid: false,
    backgroundColor: DEFAULT_BG,
    ...options,
  });
}

/**
 * Rasterize an inline SVG string to a PNG data URL via Canvas.
 *
 * SECURITY: a Canvas becomes "tainted" if it draws an image from a
 * different origin or any external resource that does not return
 * `Access-Control-Allow-Origin: *`. Our SVG is built entirely from
 * inline primitives produced by the geometry engine — no <image>, no
 * url(), no external fonts — so the canvas remains clean and
 * toDataURL() is safe. If a future change introduces external refs,
 * this function will throw a SecurityError on toDataURL and the caller
 * must handle that.
 */
export async function svgStringToPngDataUrl(
  svg: string,
  opts: SvgToPngOptions = {},
): Promise<string> {
  const wantedWidth = Math.max(64, Math.floor(opts.widthPx ?? DEFAULT_WIDTH_PX));
  const maxPixels = Math.max(1_000_000, Math.floor(opts.maxPixels ?? DEFAULT_MAX_PIXELS));
  const bg = opts.backgroundColor ?? DEFAULT_BG;

  // Extract aspect ratio from the SVG viewBox so we know the canvas height.
  const vb = svg.match(/viewBox="([^"]+)"/);
  let aspect = 1; // height/width
  if (vb && vb[1]) {
    const parts = vb[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      aspect = parts[3]! / parts[2]!;
    }
  }
  let widthPx = wantedWidth;
  let heightPx = Math.max(64, Math.round(widthPx * aspect));
  // First-pass aspect-preserving scaling.
  if (widthPx * heightPx > maxPixels) {
    const scale = Math.sqrt(maxPixels / (widthPx * heightPx));
    widthPx = Math.max(64, Math.floor(widthPx * scale));
    heightPx = Math.max(64, Math.floor(heightPx * scale));
  }
  // After the per-axis min-clamp to 64, the product can still exceed
  // `maxPixels` for extreme aspect ratios (e.g. requested widthPx very
  // large with tiny aspect → heightPx clamped up to 64 while widthPx
  // remains huge). Sacrifice aspect on the larger axis to guarantee
  // the budget; the smaller axis keeps the 64-px floor.
  if (widthPx * heightPx > maxPixels) {
    if (widthPx >= heightPx) {
      widthPx = Math.max(64, Math.floor(maxPixels / heightPx));
    } else {
      heightPx = Math.max(64, Math.floor(maxPixels / widthPx));
    }
  }

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable in this browser.");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, widthPx, heightPx);
    }
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load rasterizable SVG into <img>."));
    img.src = src;
  });
}
