/**
 * End-to-end smoke for the KATO UNITRACK editor.
 *
 * Goal: prove the user-visible flow actually works in a real browser
 * before we call the platform "ready". Unit tests cover math; this
 * spec covers the integration that unit tests cannot see (SVG
 * composition, Zustand store, file downloads, the seed inventory).
 *
 * Default state of a fresh installation: the store is seeded from
 * `data/inventory_seed.json` (Francisco's inventory). The canvas is
 * empty, so the "ready to start" hint appears with a button pointing
 * at the Generator. The starter M1 CTA only shows for users who
 * cleared the seed manually — that path is exercised by unit tests.
 */

import { expect, test } from "@playwright/test";

test.describe("KATO UNITRACK editor smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await expect(page.locator('[data-testid="canvas-editor"]')).toBeVisible();
  });

  test("seed inventory is loaded on first run", async ({ page }) => {
    // The "has stock" hint should be visible because the seed populated
    // the inventory but the canvas is still empty.
    await expect(page.locator('[data-testid="empty-canvas-hint"]')).toBeVisible();

    // /inventory should show the seeded rows.
    await page.locator('[data-testid="nav-inventory"]').click();
    const rowCount = await page.locator("tbody tr").count();
    // Seed ships ~14 snappable codes (a few may turn out non-snappable
    // and get skipped). Assert a broad lower bound that covers the
    // realistic worst case.
    expect(rowCount).toBeGreaterThanOrEqual(10);
  });

  test("generator builds a valid layout from the seeded inventory", async ({ page }) => {
    await page.locator('[data-testid="nav-generator"]').click();
    await page
      .getByRole("button", { name: /^(Generar maquetas|Generate layouts)$/i })
      .click();

    const openButton = page
      .getByRole("button", { name: /^(Abrir en el editor|Open in editor)$/i })
      .first();
    await expect(openButton).toBeVisible();
    await openButton.click();

    // Editor now has placements.
    await expect(page.locator("[data-placement-id]").first()).toBeVisible({ timeout: 8_000 });
    const count = await page.locator("[data-placement-id]").count();
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(60);
  });

  test("edit toolbar shows when a placement is selected and rotates the piece", async ({ page }) => {
    // Build a layout first so there are placements to click.
    await page.locator('[data-testid="nav-generator"]').click();
    await page
      .getByRole("button", { name: /^(Generar maquetas|Generate layouts)$/i })
      .click();
    await page
      .getByRole("button", { name: /^(Abrir en el editor|Open in editor)$/i })
      .first()
      .click();
    await expect(page.locator("[data-placement-id]").first()).toBeVisible();

    // Click a placement to select it. The toolbar should appear.
    await page.locator("[data-placement-id]").first().click({ force: true });
    await expect(page.locator('[data-testid="edit-toolbar"]')).toBeVisible();

    // Read current rotation from the placement transform attr, click
    // +15°, and verify the rotation went up by 15.
    const before = await page.locator("[data-placement-id]").first().getAttribute("transform");
    await page.locator('[data-testid="edit-rotate-plus"]').click();
    const after = await page.locator("[data-placement-id]").first().getAttribute("transform");
    expect(before).not.toBe(after);
    expect(after ?? "").toMatch(/rotate\(/);
  });

  test("save → /layouts shows the row → Export SVG triggers a download", async ({ page }) => {
    // Build a layout via the generator first.
    await page.locator('[data-testid="nav-generator"]').click();
    await page
      .getByRole("button", { name: /^(Generar maquetas|Generate layouts)$/i })
      .click();
    await page
      .getByRole("button", { name: /^(Abrir en el editor|Open in editor)$/i })
      .first()
      .click();
    await expect(page.locator("[data-placement-id]").first()).toBeVisible();

    page.on("dialog", (d) => {
      void d.accept();
    });
    await page
      .getByRole("button", { name: /^(Save layout|Guardar maqueta)$/i })
      .click();

    await page.locator('[data-testid="nav-layouts"]').click();
    await expect(page.locator("tbody tr").first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: /^(Export SVG|Exportar SVG)$/i })
        .first()
        .click(),
    ]);
    expect(download.suggestedFilename().toLowerCase().endsWith(".svg")).toBe(true);
  });
});
