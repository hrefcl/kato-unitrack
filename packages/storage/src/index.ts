/**
 * StorageAdapter — abstraction over where the user's data lives.
 *
 * MVP ships LocalStorageAdapter (browser) and InMemoryAdapter (tests).
 * Post-MVP can drop in RestStorageAdapter / IndexedDBAdapter without
 * touching anything in the frontend that consumes this interface.
 */

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export class InMemoryAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async list(prefix?: string): Promise<string[]> {
    return [...this.store.keys()].filter((k) => !prefix || k.startsWith(prefix));
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly namespace = "kato-unitrack:") {}
  async get<T>(key: string): Promise<T | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(this.namespace + key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(this.namespace + key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(this.namespace + key);
  }
  async list(prefix?: string): Promise<string[]> {
    if (typeof localStorage === "undefined") return [];
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(this.namespace)) continue;
      const sub = k.substring(this.namespace.length);
      if (!prefix || sub.startsWith(prefix)) out.push(sub);
    }
    return out;
  }
}

/** Conventional keys used by the frontend. Documented here, not hardcoded
 * across pages, so anyone wiring a different adapter can audit them. */
export const KEYS = {
  inventory: "inventory:current",
  layouts: (id: string) => `layout:${id}`,
  layoutsList: "layout:",
  apiKey: (provider: string) => `ai:${provider}:key`,
  activeProvider: "ai:active",
} as const;
