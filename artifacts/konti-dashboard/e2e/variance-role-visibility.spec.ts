import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "demo@konti.com";
const ADMIN_PASSWORD = "konti2026";
const CLIENT_EMAIL = "client@konti.com";
const CLIENT_PASSWORD = "konti2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/konti-dashboard/");
  const emailField = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]'));
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|iniciar/i }).click();
  }
}

test.describe("Calculator variance — role-aware gating + i18n", () => {
  test("admin sees invoiced columns + Spanish toggle re-localizes", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/konti-dashboard/calculator?tab=variance");

    const panel = page.getByTestId("variance-report-panel");
    await expect(panel).toBeVisible();

    const totals = page.getByTestId("variance-totals");
    await expect(totals).toBeVisible();

    await expect(page.getByTestId("variance-totals-invoiced")).toBeVisible();
    await expect(panel).toContainText(/Total Invoiced/);
    await expect(page.getByTestId("variance-totals-delta-invoiced")).toBeVisible();
    await expect(page.getByTestId("variance-bucket-materials-invoiced")).toBeVisible();
    await expect(page.getByTestId("variance-bucket-materials-delta-invoiced")).toBeVisible();

    await page.getByTestId("lang-toggle-sidebar").click();

    await expect(page.getByTestId("tab-variance")).toHaveText(/Varianza/);
    await expect(panel).toContainText(/Total Facturado/);
    await expect(panel).toContainText(/Δ vs Facturado/);
  });

  test("client view hides invoiced columns, series, totals, and deltas", async ({ page }) => {
    await login(page, CLIENT_EMAIL, CLIENT_PASSWORD);
    await page.goto("/konti-dashboard/calculator?tab=variance");

    const panel = page.getByTestId("variance-report-panel");
    await expect(panel).toBeVisible();

    const totals = page.getByTestId("variance-totals");
    await expect(totals).toBeVisible();

    await expect(panel).toContainText(/Total Estimated|Total Estimado/);
    await expect(panel).toContainText(/Total Actual|Total Real/);

    await expect(page.getByTestId("variance-totals-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-totals-invoiced-breakdown")).toHaveCount(0);
    await expect(page.getByTestId("variance-totals-delta-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-bucket-materials-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-bucket-materials-delta-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-bucket-labor-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-bucket-subcontractor-invoiced")).toHaveCount(0);
    await expect(page.getByTestId("variance-bucket-unassigned")).toHaveCount(0);
  });
});
