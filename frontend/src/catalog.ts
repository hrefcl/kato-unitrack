import { parseCatalog } from "@kato-unitrack/catalog";

/**
 * The catalog is inlined at build time by vite.config.ts via the
 * __KATO_CATALOG__ global. Loading is therefore synchronous and the
 * app works fully offline / without the backend.
 */
export const catalog = parseCatalog(__KATO_CATALOG__ as object);
