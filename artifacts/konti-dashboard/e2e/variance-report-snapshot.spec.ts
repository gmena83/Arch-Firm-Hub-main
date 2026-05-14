import { test, expect, type Page } from "@playwright/test";

/**
 * Visual smoke test for the Variance tab on `/calculator?tab=variance`.
 *
 * Task #137 reshaped the panel into a 3-column-per-bucket layout with 3 bar
 * series (Estimated / Invoiced / Actual), 2 delta pills, a 5-stat totals
 * strip, and a new "Unassigned" bucket card. Backend numbers are unit-tested
 * in `estimating.test.ts`; this test guards the *rendered* layout so a future
 * refactor can't silently regress the chart, the bilingual labels, or the
 * unassigned bucket card for proj-1.
 */

const ADMIN_EMAIL = "demo@konti.com";
const ADMIN_PASSWORD = "konti2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/konti-dashboard/");
  const emailField = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]'));
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|iniciar/i }).click();
  }
}

test.describe("Variance report — visual snapshot", () => {
  test("admin sees full bilingual layout with chart, unassigned bucket, and invoiced row", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/konti-dashboard/calculator?tab=variance");

    const panel = page.getByTestId("variance-report-panel");
    await expect(panel).toBeVisible();

    // Pin the project to proj-1 so the unassigned-bucket assertion is
    // deterministic — proj-1's seed includes design-phase invoices that
    // roll up into the "unassigned" bucket.
    const projectPicker = page.getByTestId("variance-project");
    await expect(projectPicker).toBeVisible();
    await projectPicker.selectOption("proj-1");

    // 1) English heading: "Estimated vs Invoiced vs Actual".
    await expect(panel.getByRole("heading", { name: "Estimated vs Invoiced vs Actual" })).toBeVisible();

    // 2) Chart legend has all 3 series (Estimated / Invoiced / Actual).
    //    Recharts renders the legend with `class="recharts-legend-item-text"`
    //    per series; scope to the panel and assert the trio is present.
    const legendItems = panel.locator(".recharts-legend-item-text");
    await expect(legendItems).toHaveCount(3);
    await expect(legendItems.nth(0)).toHaveText("Estimated");
    await expect(legendItems.nth(1)).toHaveText("Invoiced");
    await expect(legendItems.nth(2)).toHaveText("Actual");

    // 3) At least one bucket card shows an "Invoiced" row with a non-zero
    //    amount. Walk every bucket card's invoiced row (one per M/L/S +
    //    unassigned) and assert at least one is > $0 — proj-1's seed
    //    invoices roll up into the unassigned bucket.
    //    NB: explicitly exclude `-delta-invoiced` testids (the Δ-vs-Invoiced
    //    pill) so a non-zero delta can't satisfy the non-zero invoiced check.
    const invoicedCells = page.locator(
      '[data-testid^="variance-bucket-"][data-testid$="-invoiced"]:not([data-testid*="-delta-"])',
    );
    const cellCount = await invoicedCells.count();
    expect(cellCount).toBeGreaterThan(0);
    let nonZeroFound = false;
    for (let i = 0; i < cellCount; i++) {
      const testId = (await invoicedCells.nth(i).getAttribute("data-testid")) ?? "";
      // Defensive: only count rows whose testid matches the exact
      // "variance-bucket-{key}-invoiced" pattern — no extra segments.
      if (!/^variance-bucket-[a-z]+-invoiced$/.test(testId)) continue;
      const text = (await invoicedCells.nth(i).textContent()) ?? "";
      const amount = Number(text.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(amount) && amount > 0) {
        nonZeroFound = true;
        break;
      }
    }
    expect(nonZeroFound).toBe(true);

    // 4) The "Unassigned" bucket card appears for proj-1 (design-phase
    //    invoices have no M/L/S scope, so they surface here).
    await expect(page.getByTestId("variance-bucket-unassigned")).toBeVisible();

    // 5) Flip language toggle and re-assert the Spanish equivalent renders
    //    everywhere (heading, chart legend, bucket invoiced row).
    await page.getByTestId("lang-toggle-sidebar").click();

    await expect(panel.getByRole("heading", { name: "Estimado vs Facturado vs Real" })).toBeVisible();

    const legendEs = panel.locator(".recharts-legend-item-text");
    await expect(legendEs).toHaveCount(3);
    await expect(legendEs.nth(0)).toHaveText("Estimado");
    await expect(legendEs.nth(1)).toHaveText("Facturado");
    await expect(legendEs.nth(2)).toHaveText("Real");

    // The materials bucket still renders an invoiced row after the toggle
    // (the row's label flips to "Facturado", but the testid is stable).
    await expect(page.getByTestId("variance-bucket-materials-invoiced")).toBeVisible();
    await expect(page.getByTestId("variance-bucket-unassigned")).toBeVisible();
  });
});
