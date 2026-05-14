import { test, expect } from "@playwright/test";

/**
 * End-to-end Playwright test for the calculator's smart CSV column
 * mapping flow (Task #112).
 *
 * Demo flow per the task spec:
 *   1. Log in as demo@konti.com / konti2026.
 *   2. Open /konti-dashboard/calculator?tab=imports.
 *   3. Paste a CSV whose headers do NOT match the canonical schema
 *      (Spanish synonyms: Producto / Categoria / Unidad / Costo).
 *   4. Open the column-mapping dialog and confirm the auto-detect.
 *   5. Verify the imported rows appear in the materials list.
 *   6. Verify the mapping is remembered on the project (server-backed,
 *      not localStorage) by reopening the dialog after a hard reload.
 *
 * Prerequisite to run locally:
 *   pnpm exec playwright install chromium
 *
 * The dev server (konti-dashboard) and api-server workflows must both
 * be up before running:
 *   E2E_BASE_URL="http://localhost:$PORT" pnpm exec playwright test
 */

const DEMO_EMAIL = "demo@konti.com";
const DEMO_PASSWORD = "konti2026";

const MISMATCHED_MATERIALS_CSV = [
  "Producto,Categoria,Unidad,Costo",
  "2x4 Lumber,Wood,ea,5.00",
  ",MissingItem,ea,3.00",
  "Concrete,Masonry,bag,12.50",
].join("\n");

test.describe("Calculator CSV column mapping", () => {
  test("mismatched-header import maps, imports, and remembers mapping", async ({ page }) => {
    // 1. Log in.
    await page.goto("/konti-dashboard/");
    const emailField = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]'));
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(DEMO_EMAIL);
      await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
      await page.getByRole("button", { name: /sign in|log in|iniciar/i }).click();
    }

    // 2. Open the imports tab.
    await page.goto("/konti-dashboard/calculator?tab=imports");
    const matSection = page.getByTestId("import-materials");
    await expect(matSection).toBeVisible();

    // 3. Paste a CSV with Spanish (mismatched) headers.
    const textarea = matSection.getByTestId("import-materials-textarea");
    await textarea.fill(MISMATCHED_MATERIALS_CSV);

    // 4. Open the mapping dialog and confirm.
    await matSection.getByTestId("import-materials-map-btn").click();
    const dialog = page.getByTestId("import-materials-mapping-dialog");
    await expect(dialog).toBeVisible();
    // Auto-detect should fully map the 4 required columns from the synonyms.
    await expect(dialog.getByTestId("mapping-missing-warning")).toHaveCount(0);
    await dialog.getByTestId("mapping-confirm").click();

    // 5. Result line shows imported + skipped counts.
    const result = matSection.getByTestId("import-materials-result");
    await expect(result).toContainText(/Imported 2 material/i);
    await expect(result).toContainText(/1 skipped/i);

    // Skipped collapsible panel renders below result with row-level reasons.
    const skipped = matSection.getByTestId("import-materials-skipped");
    await expect(skipped).toBeVisible();
    await skipped.getByTestId("import-materials-skipped-toggle").click();
    await expect(skipped.getByTestId("import-materials-skipped-list")).toContainText(/Row 3/i);

    // 6. Reload and reopen the dialog — server-backed mapping memory
    //    means the dropdowns are pre-filled even though localStorage was
    //    not used.
    await page.reload();
    await page.goto("/konti-dashboard/calculator?tab=imports");
    await matSection.getByTestId("import-materials-textarea").fill(MISMATCHED_MATERIALS_CSV);
    await matSection.getByTestId("import-materials-map-btn").click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("mapping-select-item")).toHaveValue("Producto");
    await expect(dialog.getByTestId("mapping-select-base_price")).toHaveValue("Costo");
  });
});
