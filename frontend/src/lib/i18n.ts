/**
 * Lightweight i18n. No external dependency. Spanish first (the project's
 * primary working language). English available as a runtime switch.
 *
 * Strings are looked up by symbolic key; missing keys fall back to the
 * key itself so a missing translation is obvious in the UI rather than
 * silently rendering an empty string.
 *
 * The language preference persists in `localStorage` under
 * `kato-unitrack:lang`. Components subscribe via `useLang()` so a
 * language change re-renders the whole tree.
 */

import { useSyncExternalStore } from "react";

export type Lang = "es" | "en";

const STORAGE_KEY = "kato-unitrack:lang";
const DEFAULT_LANG: Lang = "es";

const dictionaries: Record<Lang, Record<string, string>> = {
  es: {
    // Header / nav
    "app.tag": "Diseñador de maquetas UNITRACK",
    "nav.editor": "Editor",
    "nav.catalog": "Catálogo",
    "nav.inventory": "Inventario",
    "nav.generator": "Generador",
    "nav.layouts": "Maquetas",
    "lang.toggle": "Idioma",

    // Editor — toolbar + empty state
    "editor.namePlaceholder": "Nombre de la maqueta",
    "editor.board": "Tablero (mm)",
    "editor.scale": "Escala",
    "editor.reset": "Reiniciar",
    "editor.save": "Guardar maqueta",
    "editor.savedAlert": "Guardada como",
    "editor.empty.title": "Empezá tu maqueta",
    "editor.empty.body":
      "Tu inventario está vacío. Cargá el set M1 Basic Oval de KATO (8 curvas R315-45 + 4 rectas S248 y algunas piezas extra) para ver un óvalo de ejemplo, o ojeá la pestaña Catálogo para elegir piezas a mano.",
    "editor.empty.cta": "Cargar set M1 + óvalo de ejemplo",
    "editor.empty.loading": "Cargando…",
    "editor.empty.tooSmall":
      "No entra ningún óvalo en un tablero de {w}×{h} mm con el set M1. El óvalo más chico que el generador puede construir necesita al menos {mw}×{mh} mm.",
    "editor.empty.error": "Error inesperado al cargar el set inicial.",

    // Catalog
    "catalog.searchPlaceholder": "Buscar por código, nombre, R315-45…",
    "catalog.allScales": "Todas las escalas",
    "catalog.allCategories": "Todas las categorías",
    "catalog.scale.acc": "Accesorio",
    "catalog.count": "{shown} de {total}",
    "catalog.add": "+ Agregar al inventario ({n})",

    // Inventory
    "inventory.totalPieces": "Total piezas",
    "inventory.setCode": "Código de set (ej. 20-852)",
    "inventory.addSet": "Agregar set",
    "inventory.empty":
      "Tu inventario está vacío. Agregá piezas individuales desde la pestaña Catálogo, o pegá un código de set (ej.",
    "inventory.emptyEnd": ") arriba.",
    "inventory.col.code": "Código",
    "inventory.col.name": "Nombre",
    "inventory.col.owned": "Tenés",
    "inventory.col.used": "En uso",
    "inventory.col.available": "Disponible",

    // Generator
    "generator.intro":
      "Las estrategias del generador (óvalo simple, óvalo doble) leen tu inventario y producen maquetas candidatas. El motor geométrico valida cierre y colisiones antes de devolver. El motor es la autoridad — si dice que no, el candidato se descarta.",
    "generator.run": "Generar maquetas",
    "generator.running": "Generando…",
    "generator.emptyInv": "Tu inventario está vacío.",
    "generator.noResults": 'Todavía no hay propuestas. Pulsá "Generar maquetas".',
    "generator.strategy": "estrategia",
    "generator.piecesUsed": "Piezas usadas",
    "generator.openInEditor": "Abrir en el editor",
    "generator.warnings": "advertencias",

    // Layouts list
    "layouts.empty":
      "No hay maquetas guardadas. Construí una en la pestaña Editor y pulsá Guardar maqueta.",
    "layouts.col.name": "Nombre",
    "layouts.col.scale": "Escala",
    "layouts.col.pieces": "Piezas",
    "layouts.col.updated": "Actualizada",
    "layouts.action.load": "Cargar",
    "layouts.action.duplicate": "Duplicar",
    "layouts.action.exportSvg": "Exportar SVG",
    "layouts.action.exportPng": "Exportar PNG",
    "layouts.action.exportPngBusy": "Exportando…",
    "layouts.action.exportJson": "Exportar JSON",
    "layouts.action.delete": "Eliminar",
    "layouts.pngBusyTitle": "Otra exportación PNG en progreso",
    "layouts.export.failed": "Falló la exportación de {kind}: {error}",

    // CanvasEditor sidebar + status
    "canvas.sidebar.available": "Piezas disponibles",
    "canvas.sidebar.emptyHint":
      "Tu inventario no tiene piezas conectables. Andá a Inventario, agregá algunas, y volvé acá.",
    "canvas.sidebar.picked": "Seleccionada",
    "canvas.sidebar.mirror": "Espejar (M para alternar)",
    "canvas.status.placements": "Piezas colocadas",
    "canvas.status.attachments": "Uniones",
    "canvas.status.geomOk": "Geometría OK",
    "canvas.status.geomErrors": "{n} errores",
    "canvas.status.openEnds": "Extremos abiertos",
    "canvas.status.zoom": "Zoom",
    "canvas.help.kbds":
      "{click} colocar · {wheel} zoom · {alt} panear · {m} espejar · {del} borrar selección · {esc} cancelar",
    "canvas.kbd.click": "Click",
    "canvas.kbd.wheel": "Rueda",
    "canvas.kbd.alt": "Alt+Arrastrar",
    "canvas.kbd.m": "M",
    "canvas.kbd.del": "Supr",
    "canvas.kbd.esc": "Esc",

    // PieceThumb
    "thumb.noPreview": "sin imagen",
    "thumb.noPreviewSub": "(falta recorte del PDF)",
    "thumb.tooltip": "Imagen faltante — ver scripts/extract-pdf-assets.mjs",

    // Inventory IO + Generator IO
    "inventory.export": "Exportar inventario JSON",
    "inventory.import": "Importar inventario JSON",
    "inventory.import.confirm": "Esto va a reemplazar tu inventario actual con el contenido del archivo. ¿Continuar?",
    "inventory.import.invalid": "Archivo inválido:",
    "inventory.import.done": "Inventario importado: {pieces} piezas en {codes} códigos.",
    "inventory.export.note": "Se descarga un .json con tu inventario actual (cantidades owned/used).",
    "generator.activeInventory": "Inventario activo",
    "generator.activeInventory.summary": "{pieces} piezas en {codes} códigos · escala {scale}",
    "generator.importInv": "Cargar otro inventario JSON",
    "generator.importInv.invalid": "El archivo no parece un export de inventario de KATO UNITRACK.",
    "generator.importInv.done": "Inventario importado: {pieces} piezas.",
    "generator.moves": "movimientos",

    // AI panel + brief
    "ai.title": "Generación por IA (experimental)",
    "ai.body":
      "La IA propone una secuencia simbólica (place / attach / link). El motor geométrico la materializa y valida — si no cierra o colisiona, la propuesta se descarta. La IA nunca inventa coordenadas.",
    "ai.provider": "Proveedor",
    "ai.apiKey": "API key",
    "ai.apiKeyPlaceholder": "sk-… (se guarda solo en tu navegador)",
    "ai.prompt": "Describí qué maqueta querés",
    "ai.promptPlaceholder": "ej. óvalo doble con cruzamiento de turnouts",
    "ai.suggest": "Sugerir con IA",
    "ai.suggesting": "Consultando IA…",
    "ai.noProposals": "La IA no devolvió propuestas aplicables.",
    "ai.providerNotReady": "Este proveedor todavía no está implementado. Probá Local auto-build o OpenAI.",
    "ai.materialize": "Materializar y abrir en editor",
    "ai.materializeFailed": "El motor rechazó la propuesta: {reason}",
    "ai.localDemo": "Local auto-build (sin red)",
    "ai.keyMissing": "Falta API key para este proveedor.",
    "ai.model": "Modelo",
    "ai.viewContext": "Ver contexto que se envía al modelo",
    "ai.hideContext": "Ocultar contexto",
    "ai.briefHeading": "Análisis pre-calculado que recibe el modelo",
    "ai.brief.feasible": "Formas factibles según tu inventario",
    "ai.brief.curves": "Curvas (radio · ángulo · stock · necesarias-para-360°)",
    "ai.brief.straights": "Rectas (longitud · stock)",
    "ai.brief.turnouts": "Turnouts (radio · ángulo · mano · stock)",
  },
  en: {
    "app.tag": "UNITRACK Layout Designer",
    "nav.editor": "Editor",
    "nav.catalog": "Catalog",
    "nav.inventory": "Inventory",
    "nav.generator": "Generator",
    "nav.layouts": "Layouts",
    "lang.toggle": "Language",

    "editor.namePlaceholder": "Layout name",
    "editor.board": "Board (mm)",
    "editor.scale": "Scale",
    "editor.reset": "Reset",
    "editor.save": "Save layout",
    "editor.savedAlert": "Saved as",
    "editor.empty.title": "Start your layout",
    "editor.empty.body":
      "Your inventory is empty. Load the KATO M1 Basic Oval Set (8×R315-45 curves + 4×S248 straights and a few extras) to see a complete sample oval, or browse the Catalog tab to pick pieces by hand.",
    "editor.empty.cta": "Load M1 starter set + sample oval",
    "editor.empty.loading": "Loading…",
    "editor.empty.tooSmall":
      "No oval fits a {w}×{h} mm board with the M1 set. The smallest oval the generator can build needs at least {mw}×{mh} mm.",
    "editor.empty.error": "Unexpected error while loading starter set.",

    "catalog.searchPlaceholder": "Search by code, name, R315-45…",
    "catalog.allScales": "All scales",
    "catalog.allCategories": "All categories",
    "catalog.scale.acc": "Accessory",
    "catalog.count": "{shown} of {total}",
    "catalog.add": "+ Add to inventory ({n})",

    "inventory.totalPieces": "Total pieces",
    "inventory.setCode": "Set code (e.g. 20-852)",
    "inventory.addSet": "Add set",
    "inventory.empty":
      "Your inventory is empty. Add individual pieces from the Catalog tab, or paste a set code (e.g.",
    "inventory.emptyEnd": ") above.",
    "inventory.col.code": "Code",
    "inventory.col.name": "Name",
    "inventory.col.owned": "Owned",
    "inventory.col.used": "Used",
    "inventory.col.available": "Available",

    "generator.intro":
      "Generator strategies (simple oval, double oval) are inventory-aware. They produce candidate layouts, then ask the geometry engine to validate closure and collisions before returning. The engine is the authority — if it says no, the candidate is dropped.",
    "generator.run": "Generate layouts",
    "generator.running": "Generating…",
    "generator.emptyInv": "Your inventory is empty.",
    "generator.noResults": 'No proposals yet. Click "Generate layouts".',
    "generator.strategy": "strategy",
    "generator.piecesUsed": "Pieces used",
    "generator.openInEditor": "Open in editor",
    "generator.warnings": "warnings",

    "layouts.empty":
      "No saved layouts. Build one in the Editor tab and click Save layout.",
    "layouts.col.name": "Name",
    "layouts.col.scale": "Scale",
    "layouts.col.pieces": "Pieces",
    "layouts.col.updated": "Updated",
    "layouts.action.load": "Load",
    "layouts.action.duplicate": "Duplicate",
    "layouts.action.exportSvg": "Export SVG",
    "layouts.action.exportPng": "Export PNG",
    "layouts.action.exportPngBusy": "Exporting…",
    "layouts.action.exportJson": "Export JSON",
    "layouts.action.delete": "Delete",
    "layouts.pngBusyTitle": "Another PNG export is in progress",
    "layouts.export.failed": "{kind} export failed: {error}",

    "canvas.sidebar.available": "Available pieces",
    "canvas.sidebar.emptyHint":
      "Your inventory has no snappable pieces. Go to Inventory and add some, then come back here.",
    "canvas.sidebar.picked": "Picked",
    "canvas.sidebar.mirror": "Mirror (press M to toggle)",
    "canvas.status.placements": "Placements",
    "canvas.status.attachments": "Attachments",
    "canvas.status.geomOk": "Geometry OK",
    "canvas.status.geomErrors": "{n} errors",
    "canvas.status.openEnds": "Open ends",
    "canvas.status.zoom": "Zoom",
    "canvas.help.kbds":
      "{click} place · {wheel} zoom · {alt} pan · {m} mirror · {del} remove selection · {esc} cancel",
    "canvas.kbd.click": "Click",
    "canvas.kbd.wheel": "Wheel",
    "canvas.kbd.alt": "Alt+Drag",
    "canvas.kbd.m": "M",
    "canvas.kbd.del": "Del",
    "canvas.kbd.esc": "Esc",

    "thumb.noPreview": "no preview",
    "thumb.noPreviewSub": "(needs PDF crop)",
    "thumb.tooltip": "Image needed — see scripts/extract-pdf-assets.mjs",

    "inventory.export": "Export inventory JSON",
    "inventory.import": "Import inventory JSON",
    "inventory.import.confirm": "This will replace your current inventory with the file's contents. Continue?",
    "inventory.import.invalid": "Invalid file:",
    "inventory.import.done": "Inventory imported: {pieces} pieces across {codes} codes.",
    "inventory.export.note": "Downloads a .json with your current inventory (owned/used counts).",
    "generator.activeInventory": "Active inventory",
    "generator.activeInventory.summary": "{pieces} pieces across {codes} codes · scale {scale}",
    "generator.importInv": "Load another inventory JSON",
    "generator.importInv.invalid": "File does not look like a KATO UNITRACK inventory export.",
    "generator.importInv.done": "Inventory imported: {pieces} pieces.",
    "generator.moves": "moves",

    "ai.title": "AI generation (experimental)",
    "ai.body":
      "The AI returns a symbolic sequence (place / attach / link). The geometry engine materializes and validates — if it doesn't close or collides, the proposal is dropped. The AI never invents coordinates.",
    "ai.provider": "Provider",
    "ai.apiKey": "API key",
    "ai.apiKeyPlaceholder": "sk-… (stored only in your browser)",
    "ai.prompt": "Describe the layout you want",
    "ai.promptPlaceholder": "e.g. double oval with turnout crossover",
    "ai.suggest": "Suggest with AI",
    "ai.suggesting": "Consulting AI…",
    "ai.noProposals": "The AI returned no usable proposal.",
    "ai.providerNotReady": "This provider is not yet implemented. Try Local auto-build or OpenAI.",
    "ai.materialize": "Materialize and open in editor",
    "ai.materializeFailed": "The engine rejected the proposal: {reason}",
    "ai.localDemo": "Local auto-build (no network)",
    "ai.keyMissing": "API key required for this provider.",
    "ai.model": "Model",
    "ai.viewContext": "Show context sent to the model",
    "ai.hideContext": "Hide context",
    "ai.briefHeading": "Pre-computed analysis the model receives",
    "ai.brief.feasible": "Feasible shapes given your inventory",
    "ai.brief.curves": "Curves (radius · angle · stock · needed-for-360°)",
    "ai.brief.straights": "Straights (length · stock)",
    "ai.brief.turnouts": "Turnouts (radius · angle · hand · stock)",
  },
};

// ---- Tiny pub/sub for language changes -------------------------------------
let currentLang: Lang = readInitial();
const listeners = new Set<() => void>();

function readInitial(): Lang {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "es" || stored === "en" ? stored : DEFAULT_LANG;
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Subscribe to language changes; returns the current Lang. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/**
 * Translate a key. Optional `params` are substituted into `{name}`
 * placeholders. A missing key returns the key itself, so an unmapped
 * string is obvious in the UI rather than rendered as empty.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLang] ?? dictionaries[DEFAULT_LANG]!;
  let out = dict[key];
  if (out === undefined) {
    // Fallback to default lang to catch partial translations.
    out = dictionaries[DEFAULT_LANG]![key] ?? key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
