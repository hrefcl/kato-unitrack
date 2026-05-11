import { describe, it, expect } from "vitest";
import { InMemoryAdapter, KEYS } from "../src/index.js";

describe("InMemoryAdapter", () => {
  it("round-trips JSON-serializable values", async () => {
    const a = new InMemoryAdapter();
    await a.set(KEYS.inventory, { entries: { "20-000": { code: "20-000", owned: 4, used: 0 } } });
    const got = await a.get<{ entries: Record<string, { owned: number }> }>(KEYS.inventory);
    expect(got?.entries["20-000"]?.owned).toBe(4);
  });

  it("lists by prefix", async () => {
    const a = new InMemoryAdapter();
    await a.set("layout:a", 1);
    await a.set("layout:b", 1);
    await a.set("other", 1);
    const keys = await a.list("layout:");
    expect(keys.sort()).toEqual(["layout:a", "layout:b"]);
  });

  it("delete removes the key", async () => {
    const a = new InMemoryAdapter();
    await a.set("x", 1);
    await a.delete("x");
    expect(await a.get("x")).toBeNull();
  });
});
