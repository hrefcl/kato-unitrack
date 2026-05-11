/**
 * End-to-end smoke for the KATO UNITRACK editor.
 *
 * Goal: prove the user-visible flow actually works in a real browser
 * before we call the platform "ready". Unit tests cover math; this
 * spec covers the integration that unit tests cannot see (SVG
 * composition, Zustand store, file downloads).
 */

import { expect, test } from "@playwright/test";

test.describe("KATO UNITRACK editor smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Ensure a clean slate even if a previous human session left state
    // behind in this browser context.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await expect(page.locator('[data-testid="canvas-editor"]')).toBeVisible();
  });

  test("first-run CTA loads the M1 starter set + sample oval", async ({ page }) => {
    // Default route is /editor; the CTA is the empty-state card.
    await expect(page.getByRole("button", { name: /Load M1 starter set/i })).toBeVisible();
    await page.getByRole("button", { name: /Load M1 starter set/i }).click();

    // The first placement <g> with data-placement-id should appear.
    await expect(page.locator("[data-placement-id]").first()).toBeVisible({ timeout: 8_000 });

    // M1 produces an oval with 8 R315-45 curves and ≥ 2 S248 straights.
    // We bound the count generously to avoid coupling to the generator's
    // exact straight-count choice for a given board.
    const placements = await page.locator("[data-placement-id]").count();
    expect(placements).toBeGreaterThanOrEqual(8);
    expect(placements).toBeLessThanOrEqual(40);

    // CTA card hides once the layout is populated.
    await expect(page.getByRole("button", { name: /Load M1 starter set/i })).toBeHidden();
  });

  test("inventory reflects the loaded layout (used > 0)", async ({ page }) => {
    await page.getByRole("button", { name: /Load M1 starter set/i }).click();
    await expect(page.locator("[data-placement-id]").first()).toBeVisible();

    await page.locator('[data-testid="nav-inventory"]').click();

    // At least one inventory row exists.
    const rowCount = await page.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);

    // At least one piece has used > 0 — we do not hard-code a code,
    // so future changes to set decomposition don't break this assertion.
    const usedCells = await page.locator("tbody tr td:nth-child(4)").allTextContents();
    const someUsed = usedCells.some((t) => Number(t.trim()) > 0);
    expect(someUsed).toBe(true);
  });

  test("save → /layouts shows the row → Export SVG triggers a download", async ({ page }) => {
    await page.getByRole("button", { name: /Load M1 starter set/i }).click();
    await expect(page.locator("[data-placement-id]").first()).toBeVisible();

    // The Save button uses window.alert; swallow it silently.
    page.on("dialog", (d) => {
      void d.accept();
    });
    await page.getByRole("button", { name: /^Save layout$/i }).click();

    await page.locator('[data-testid="nav-layouts"]').click();

    // A saved row exists. We assert on DOM, not on the dialog, so the
    // check is independent of the alert/toast UI choice.
    await expect(page.locator("tbody tr").first()).toBeVisible();

    // Export SVG triggers a file download.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Export SVG$/i }).first().click(),
    ]);
    expect(download.suggestedFilename().toLowerCase().endsWith(".svg")).toBe(true);
  });
});
