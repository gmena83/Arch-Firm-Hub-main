import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import {
  EXTRA_MATERIALS,
  LABOR_RATES,
  PROJECT_CONTRACTOR_ESTIMATE,
  PROJECT_RECEIPTS,
  PROJECT_REPORT_TEMPLATE,
  applyEstimatingSnapshot,
  persistEstimatingState,
  flushEstimatingPersistence,
} from "../estimating";
import {
  loadEstimatingSnapshotFromDb,
  __resetEstimatingTablesForTest,
} from "../../lib/estimating-store";

type LoginResponse = { token: string; user: { id: string; role: string } };

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await fn(baseUrl); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function login(baseUrl: string, email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "konti2026" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

function snapshotState() {
  return {
    extra: EXTRA_MATERIALS.length,
    labor: LABOR_RATES.length,
    laborRates: LABOR_RATES.map((r) => ({ trade: r.trade, hourlyRate: r.hourlyRate, source: r.source })),
    receipts: { ...PROJECT_RECEIPTS },
    template: { ...PROJECT_REPORT_TEMPLATE },
    estimates: { ...PROJECT_CONTRACTOR_ESTIMATE },
  };
}
async function restoreState(snap: ReturnType<typeof snapshotState>) {
  EXTRA_MATERIALS.splice(snap.extra);
  LABOR_RATES.splice(0, LABOR_RATES.length);
  for (const r of snap.laborRates) {
    LABOR_RATES.push({ trade: r.trade, tradeEs: r.trade, unit: "hour", hourlyRate: r.hourlyRate, source: r.source as "seed" | "import" | "receipts", updatedAt: "2026-01-01T00:00:00Z" });
  }
  for (const k of Object.keys(PROJECT_RECEIPTS)) delete PROJECT_RECEIPTS[k];
  for (const k of Object.keys(PROJECT_REPORT_TEMPLATE)) delete PROJECT_REPORT_TEMPLATE[k];
  for (const k of Object.keys(PROJECT_CONTRACTOR_ESTIMATE)) delete PROJECT_CONTRACTOR_ESTIMATE[k];
  Object.assign(PROJECT_RECEIPTS, snap.receipts);
  Object.assign(PROJECT_REPORT_TEMPLATE, snap.template);
  Object.assign(PROJECT_CONTRACTOR_ESTIMATE, snap.estimates);
  // Keep the DB aligned with the restored in-memory state so other
  // tests in the same process don't see leftover mutations.
  await persistEstimatingState();
}

test("estimating end-to-end: import → contractor estimate → receipts → variance report", async () => {
  const snap = snapshotState();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // 1. Import materials via CSV
      const csv = "item,item_es,category,unit,base_price\nGreen Roof Membrane,Membrana Verde,finishes,sqft,18.50\n,,,,";
      const importRes = await fetch(`${baseUrl}/api/estimating/materials/import`, { method: "POST", headers: auth, body: JSON.stringify({ csv }) });
      assert.equal(importRes.status, 200);
      const imp = (await importRes.json()) as { imported: number; skipped: number };
      assert.equal(imp.imported, 1);
      assert.equal(imp.skipped, 1);

      // 2. Import labor rates
      const labRes = await fetch(`${baseUrl}/api/estimating/labor-rates/import`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ rates: [{ trade: "Carpenter", hourly_rate: 42 }, { trade: "Specialty Welder", hourly_rate: 60 }] }),
      });
      assert.equal(labRes.status, 200);
      const labBody = (await labRes.json()) as { imported: number; rates: Array<{ trade: string; hourlyRate: number }> };
      assert.equal(labBody.imported, 2);
      const carp = labBody.rates.find((r) => r.trade === "Carpenter");
      assert.equal(carp?.hourlyRate, 42);

      // 3. Create contractor estimate for proj-1
      const estRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ squareMeters: 180, projectType: "residencial", scope: ["pool", "solar"] }),
      });
      assert.equal(estRes.status, 200);
      const est = (await estRes.json()) as { lines: Array<{ category: string; lineTotal: number; quantity: number; unitPrice: number }>; grandTotal: number };
      assert.ok(est.lines.length >= 5);
      assert.ok(est.grandTotal > 0);
      assert.ok(est.lines.some((l) => l.category === "subcontractor"), "should include subcontractor for pool/solar");

      // 4. Upload receipts → labor baseline refresh
      const recRes = await fetch(`${baseUrl}/api/projects/proj-1/receipts`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ receipts: [
          { vendor: "Ferretería PR", date: "2026-04-10", trade: "Carpenter", amount: 800, hours: 20 },
          { vendor: "Home Depot", date: "2026-04-12", trade: "Carpenter", amount: 880, hours: 22 },
          { vendor: "Ferretería PR", date: "2026-04-15", trade: "Carpenter", amount: 900, hours: 20 },
        ] }),
      });
      assert.equal(recRes.status, 200);
      const recBody = (await recRes.json()) as { receipts: unknown[]; updatedTrades: string[]; rates: Array<{ trade: string; hourlyRate: number; source: string }> };
      assert.equal(recBody.receipts.length, 3);
      const carpAfter = recBody.rates.find((r) => r.trade === "Carpenter");
      assert.equal(carpAfter?.source, "receipts");
      // H-1 — compute the expected value from the receipts above rather than
      // hardcoding 41.61. If the seed labor rates change OR the receipts in
      // this test change, the assertion stays correct without manual update.
      const expectedHourly = (800 + 880 + 900) / (20 + 22 + 20);
      assert.ok(
        carpAfter && Math.abs(carpAfter.hourlyRate - expectedHourly) < 0.05,
        `expected ~${expectedHourly.toFixed(2)} got ${carpAfter?.hourlyRate}`,
      );

      // 5. Report template
      const tplRes = await fetch(`${baseUrl}/api/projects/proj-1/report-template`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ name: "KONTi Standard v2", columns: ["Category", "Item", "Qty", "Total"], headerLines: ["KONTi", "Casa Solar Rincón"], footer: "© KONTi 2026 Confidential" }),
      });
      assert.equal(tplRes.status, 200);

      // 5b. Report template is retrievable for the PDF/report rendering pipeline
      const tplGet = await fetch(`${baseUrl}/api/projects/proj-1/report-template`, { headers: auth });
      assert.equal(tplGet.status, 200);
      const tplBody = (await tplGet.json()) as { name: string; footer: string; headerLines: string[]; columns: string[] };
      assert.equal(tplBody.name, "KONTi Standard v2");
      assert.equal(tplBody.footer, "© KONTi 2026 Confidential");
      assert.ok(tplBody.headerLines.includes("Casa Solar Rincón"));
      assert.ok(tplBody.columns.includes("Total"));

      // 5c. Imported materials are visible from the unified /api/materials catalog
      const matsList = await fetch(`${baseUrl}/api/materials`, { headers: auth });
      assert.equal(matsList.status, 200);
      const allMats = (await matsList.json()) as Array<{ id: string; item: string }>;
      assert.ok(allMats.some((m) => m.item === "Green Roof Membrane"), "imported material should appear in /api/materials");

      // 5d. Edit contractor estimate lines — totals must include non-labor/sub categories
      // (foundation/steel/finishes/etc. are materials buckets and must NOT be dropped from subtotal)
      const editLines = est.lines.map((l, i) => i === 0 ? { ...l, quantity: l.quantity, unitPrice: l.unitPrice + 100 } : l);
      const editRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate/lines`, {
        method: "PUT", headers: auth, body: JSON.stringify({ lines: editLines }),
      });
      assert.equal(editRes.status, 200);
      const edited = (await editRes.json()) as {
        lines: Array<{ category: string; lineTotal: number }>;
        subtotalMaterials: number; subtotalLabor: number; subtotalSubcontractor: number;
        contingency: number; grandTotal: number; contingencyPercent: number;
      };
      const sumAll = edited.lines.reduce((a, b) => a + b.lineTotal, 0);
      const sumByBuckets = edited.subtotalMaterials + edited.subtotalLabor + edited.subtotalSubcontractor;
      assert.ok(Math.abs(sumAll - sumByBuckets) < 0.05, `subtotals must include all categories (sumAll=${sumAll} buckets=${sumByBuckets})`);
      const expectedGrand = Math.round((sumAll + sumAll * (edited.contingencyPercent / 100)) * 100) / 100;
      assert.ok(Math.abs(edited.grandTotal - expectedGrand) < 0.05, `grandTotal should reflect all line categories: got ${edited.grandTotal}, expected ~${expectedGrand}`);
      assert.ok(edited.subtotalMaterials > 0, "materials bucket must capture foundation/steel/etc. lines");

      // 6. Variance report
      const varRes = await fetch(`${baseUrl}/api/projects/proj-1/variance-report`, { headers: auth });
      assert.equal(varRes.status, 200);
      const v = (await varRes.json()) as {
        estimateSource: string;
        buckets: Array<{ key: string; estimated: number; actual: number; invoiced: number; variance: number; variancePercent: number | null; varianceVsInvoiced: number; varianceVsInvoicedPercent: number | null; status: string }>;
        materialCategories: Array<{ category: string; invoiced: number; varianceVsInvoiced: number; varianceVsInvoicedPercent: number | null }>;
        totals: { estimated: number; actual: number; invoiced: number; invoicedInPlan: number; invoicedUnassigned: number; variance: number; variancePercent: number | null; varianceVsInvoiced: number; varianceVsInvoicedPercent: number | null };
      };
      assert.equal(v.estimateSource, "contractor_estimate");
      const mlsBuckets = v.buckets.filter((b) => b.key === "materials" || b.key === "labor" || b.key === "subcontractor");
      assert.equal(mlsBuckets.length, 3, "M/L/S buckets always present");
      const matBucket = v.buckets.find((b) => b.key === "materials");
      assert.ok(matBucket && matBucket.estimated > 0);
      // Each M/L/S bucket carries an invoiced field plus the Δ-vs-Invoiced numbers.
      for (const b of mlsBuckets) {
        assert.equal(typeof b.invoiced, "number", `${b.key} bucket should expose invoiced`);
        assert.equal(typeof b.varianceVsInvoiced, "number", `${b.key} bucket should expose varianceVsInvoiced`);
      }
      // proj-1 has actuals (cost-plus entries) but ZERO M/L/S invoices, so
      // varianceVsInvoicedPercent must be `null` (not 0) — otherwise the UI
      // would show a misleading "+0%" next to a non-zero dollar delta.
      for (const b of mlsBuckets) {
        if (b.invoiced === 0 && b.actual !== 0) {
          assert.equal(b.varianceVsInvoicedPercent, null, `${b.key} percent should be null when invoiced=0 and actual>0`);
        }
      }
      // proj-1 has 2 design-phase invoices (no M/L/S match) so the
      // "unassigned" bucket must surface them instead of hiding them.
      const unassigned = v.buckets.find((b) => b.key === "unassigned");
      assert.ok(unassigned, "unassigned bucket should appear when invoices don't fit M/L/S");
      assert.equal(unassigned!.invoiced, 8500 + 18000, "unassigned bucket sums all design-phase invoices");
      assert.equal(unassigned!.estimated, 0);
      assert.equal(unassigned!.actual, 0);
      assert.equal(unassigned!.variancePercent, null, "unassigned percent must be null (estimated=0)");
      assert.equal(unassigned!.varianceVsInvoicedPercent, null, "unassigned vs-invoiced percent must be null (actual=0)");
      // Totals expose split invoiced (in-plan vs unassigned). The primary
      // Δ-vs-Invoiced compares Actual against IN-PLAN invoiced only so the
      // scopes match — it must NOT subtract the unassigned amount.
      assert.equal(typeof v.totals.invoiced, "number");
      assert.equal(typeof v.totals.invoicedInPlan, "number");
      assert.equal(typeof v.totals.invoicedUnassigned, "number");
      assert.equal(v.totals.invoiced, v.totals.invoicedInPlan + v.totals.invoicedUnassigned, "totals.invoiced = in-plan + unassigned");
      assert.equal(v.totals.invoicedUnassigned, 8500 + 18000, "unassigned design invoices roll up into totals");
      assert.equal(v.totals.varianceVsInvoiced, v.totals.actual - v.totals.invoicedInPlan, "Δ vs Invoiced uses in-plan only (matched scope)");
    });

    // 6b. proj-2 has invoices spread across labor/subcontractor/materials so
    //     the M/L/S buckets must each carry a non-zero invoiced amount and
    //     the per-category breakdown must surface the "finishes" invoice.
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const varRes = await fetch(`${baseUrl}/api/projects/proj-2/variance-report`, { headers: auth });
      assert.equal(varRes.status, 200);
      const v = (await varRes.json()) as {
        buckets: Array<{ key: string; invoiced: number }>;
        materialCategories: Array<{ category: string; invoiced: number }>;
        totals: { invoiced: number };
      };
      const labor = v.buckets.find((b) => b.key === "labor");
      const sub = v.buckets.find((b) => b.key === "subcontractor");
      const mats = v.buckets.find((b) => b.key === "materials");
      // Seed totals: labor 42000, subcontractor 58000+76000+64000=198000,
      // materials 48000 (finishes) — all from PROJECT_INVOICES["proj-2"].
      assert.equal(labor?.invoiced, 42000, "labor bucket aggregates the mobilization invoice");
      assert.equal(sub?.invoiced, 198000, "subcontractor bucket aggregates foundation+container+plumbing");
      assert.equal(mats?.invoiced, 48000, "materials bucket aggregates the finishes invoice");
      const finishesCat = v.materialCategories.find((c) => c.category === "finishes");
      assert.ok(finishesCat, "finishes category should appear when invoiced");
      assert.equal(finishesCat!.invoiced, 48000, "per-category invoiced totals to the finishes invoice");
      assert.equal(v.totals.invoiced, 42000 + 198000 + 48000, "totals.invoiced sums every M/L/S invoice");
    });
  } finally {
    await restoreState(snap);
  }
});

test("PDF export uses saved report template header/columns/footer", async () => {
  const snap = snapshotState();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["PDF_CO_API_KEY"];
  process.env["PDF_CO_API_KEY"] = "test-key";

  let capturedBody: string | null = null;
  globalThis.fetch = (async (input: Parameters<typeof originalFetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("api.pdf.co")) {
      capturedBody = (init?.body as string) ?? null;
      return new Response(JSON.stringify({ url: "https://example.invalid/test.pdf", error: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://example.invalid/")) {
      const fakePdf = new TextEncoder().encode("%PDF-1.4 fake pdf bytes for test\n%%EOF\n");
      return new Response(fakePdf, { status: 200, headers: { "content-type": "application/pdf" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // Seed a contractor estimate so the template's columns have data to render.
      const estRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ squareMeters: 120, projectType: "residencial", scope: [] }),
      });
      assert.equal(estRes.status, 200);

      const footerText = "© KONTi 2026 — Confidential cost report do-not-redistribute";
      const headerLine = "KONTi Design | Build Studio — Cost Report";
      const tplRes = await fetch(`${baseUrl}/api/projects/proj-1/report-template`, {
        method: "POST", headers: auth,
        body: JSON.stringify({
          name: "KONTi Cost Report v1",
          columns: ["Category", "Item", "Qty", "Unit", "Unit Price", "Total"],
          headerLines: [headerLine, "Casa Solar Rincón", "Rincón, PR"],
          footer: footerText,
        }),
      });
      assert.equal(tplRes.status, 200);

      const pdfRes = await fetch(`${baseUrl}/api/projects/proj-1/pdf`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(pdfRes.status, 200);

      assert.ok(capturedBody, "PDF.co should have been called");
      const parsed = JSON.parse(capturedBody as string) as { html: string };
      assert.ok(
        parsed.html.includes(footerText),
        `exported PDF html should include the saved template footer; got:\n${parsed.html.slice(0, 500)}`,
      );
      assert.ok(parsed.html.includes(headerLine), "exported html should include the saved header line");
      assert.ok(parsed.html.includes("KONTi Cost Report v1"), "exported html should include the template name as a section heading");
      // Default signature block must NOT appear when a custom footer is in use.
      assert.ok(!parsed.html.includes("Authorized Signature"), "default signature should be replaced by template footer");
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["PDF_CO_API_KEY"];
    else process.env["PDF_CO_API_KEY"] = originalKey;
    await restoreState(snap);
  }
});

test("PDF export falls back to default layout when no template is saved", async () => {
  const snap = snapshotState();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["PDF_CO_API_KEY"];
  process.env["PDF_CO_API_KEY"] = "test-key";

  let capturedBody: string | null = null;
  globalThis.fetch = (async (input: Parameters<typeof originalFetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("api.pdf.co")) {
      capturedBody = (init?.body as string) ?? null;
      return new Response(JSON.stringify({ url: "https://example.invalid/test.pdf", error: false }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://example.invalid/")) {
      return new Response(new TextEncoder().encode("%PDF-1.4 fake\n%%EOF\n"), {
        status: 200, headers: { "content-type": "application/pdf" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      // Make sure no template exists for proj-2.
      delete PROJECT_REPORT_TEMPLATE["proj-2"];
      const pdfRes = await fetch(`${baseUrl}/api/projects/proj-2/pdf`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(pdfRes.status, 200);
      const parsed = JSON.parse(capturedBody as string) as { html: string };
      assert.ok(parsed.html.includes("KONTi Project Status Report"), "default header should be used");
      assert.ok(parsed.html.includes("Authorized Signature"), "default signature footer should be used");
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env["PDF_CO_API_KEY"];
    else process.env["PDF_CO_API_KEY"] = originalKey;
    await restoreState(snap);
  }
});

test("contractor estimate requires auth", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squareMeters: 100 }),
    });
    assert.equal(res.status, 401);
  });
});

test("client cannot import materials", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/estimating/materials/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ csv: "item,category,unit,base_price\nFoo,steel,unit,10" }),
    });
    assert.equal(res.status, 403);
  });
});

test("estimating state survives a server restart (persists to Postgres and reloads)", async () => {
  // Task #141 — persistence now lives in Postgres. The shape of the test
  // is unchanged: mutate via the HTTP API, simulate a restart by wiping
  // in-memory state, then verify the data comes back from the DB.
  const snap = snapshotState();
  await __resetEstimatingTablesForTest();
  // Start from a clean in-memory slate too so what we read back has to have
  // come from the DB (not residue from earlier tests).
  applyEstimatingSnapshot(null);

  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // Imported material
      const importRes = await fetch(`${baseUrl}/api/estimating/materials/import`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          csv: "item,item_es,category,unit,base_price\nPersist Test Tile,Loseta Persistente,finishes,sqft,12.50",
        }),
      });
      assert.equal(importRes.status, 200);

      // Imported labor rate
      const labRes = await fetch(`${baseUrl}/api/estimating/labor-rates/import`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ rates: [{ trade: "Persist Trade", hourly_rate: 77 }] }),
      });
      assert.equal(labRes.status, 200);

      // Contractor estimate
      const estRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ squareMeters: 120, projectType: "residencial", scope: ["roof"] }),
      });
      assert.equal(estRes.status, 200);

      // Receipts
      const recRes = await fetch(`${baseUrl}/api/projects/proj-1/receipts`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          receipts: [
            { vendor: "Persist Vendor", date: "2026-04-20", trade: "Carpenter", amount: 500, hours: 10 },
          ],
        }),
      });
      assert.equal(recRes.status, 200);

      // Report template
      const tplRes = await fetch(`${baseUrl}/api/projects/proj-1/report-template`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Persist Template",
          columns: ["Category", "Item", "Total"],
          headerLines: ["KONTi", "Persist Test"],
          footer: "Footer-Persist",
        }),
      });
      assert.equal(tplRes.status, 200);
    });

    // Persistence is fire-and-forget — wait for the write queue to drain
    // before asserting against the DB.
    await flushEstimatingPersistence();

    // All five stores should now have rows in Postgres.
    const fromDb = await loadEstimatingSnapshotFromDb();
    assert.ok(fromDb, "loadEstimatingSnapshotFromDb should return a snapshot");
    assert.ok(fromDb!.extraMaterials.some((m) => m.item === "Persist Test Tile"));
    assert.ok(fromDb!.laborRates.some((r) => r.trade === "Persist Trade" && r.hourlyRate === 77));
    assert.ok(fromDb!.receipts["proj-1"]?.some((r) => r.vendor === "Persist Vendor"));
    assert.equal(fromDb!.reportTemplates["proj-1"]?.name, "Persist Template");
    assert.ok((fromDb!.contractorEstimates["proj-1"]?.grandTotal ?? 0) > 0);

    // Simulate a server restart: blow away in-memory state, then rehydrate
    // from the DB the same way `ensureEstimatingHydrated()` does at boot.
    applyEstimatingSnapshot(null);
    assert.equal(EXTRA_MATERIALS.length, 0);
    assert.equal(Object.keys(PROJECT_RECEIPTS).length, 0);
    assert.equal(Object.keys(PROJECT_REPORT_TEMPLATE).length, 0);
    assert.equal(Object.keys(PROJECT_CONTRACTOR_ESTIMATE).length, 0);

    applyEstimatingSnapshot(await loadEstimatingSnapshotFromDb());

    assert.ok(EXTRA_MATERIALS.some((m) => m.item === "Persist Test Tile"));
    assert.ok(LABOR_RATES.some((r) => r.trade === "Persist Trade" && r.hourlyRate === 77));
    assert.ok(PROJECT_RECEIPTS["proj-1"]?.some((r) => r.vendor === "Persist Vendor"));
    assert.equal(PROJECT_REPORT_TEMPLATE["proj-1"]?.name, "Persist Template");
    assert.ok((PROJECT_CONTRACTOR_ESTIMATE["proj-1"]?.grandTotal ?? 0) > 0);

    // Variance report continues to work end-to-end against the reloaded data.
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const varRes = await fetch(`${baseUrl}/api/projects/proj-1/variance-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(varRes.status, 200);
      const v = (await varRes.json()) as {
        estimateSource: string;
        buckets: Array<{ key: string; estimated: number }>;
      };
      assert.equal(v.estimateSource, "contractor_estimate");
      // M/L/S are always present; an "unassigned" bucket may also appear
      // for projects whose invoices live outside the cost plan (proj-1).
      const mls = v.buckets.filter((b) => b.key === "materials" || b.key === "labor" || b.key === "subcontractor");
      assert.equal(mls.length, 3);
    });
  } finally {
    await flushEstimatingPersistence();
    await __resetEstimatingTablesForTest();
    await restoreState(snap);
    await flushEstimatingPersistence();
  }
});

// Suppress unused-import noise for `persistEstimatingState` — kept in scope
// because `restoreState` still calls it via this module's export surface.
void persistEstimatingState;

// B-05: project metadata (squareMeters, projectType, bathrooms, kitchens,
// contingencyPercent) lives on the Project record and should produce the
// SAME estimate whether sent in the request body (legacy clients) or read
// from the project (new Cost Calculator UI which only sends contractor-only
// inputs like scope, source, marginPercent, managementFeePercent).
test("B-05: contractor estimate math is unchanged when metadata is read from the project record", async () => {
  const snap = snapshotState();
  // Inject a fixed estimating state (labor rates + empty receipts/templates/
  // estimates) so the hard baseline numbers below are stable regardless of
  // prior tests in this process or persisted state on disk. These rates
  // intentionally match DEFAULT_LABOR_RATES so this test doubles as a
  // pre-refactor baseline check.
  applyEstimatingSnapshot({
    extraMaterials: [],
    laborRates: [
      { trade: "General Labor", tradeEs: "Mano de Obra General", unit: "hour", hourlyRate: 22, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
      { trade: "Carpenter", tradeEs: "Carpintero", unit: "hour", hourlyRate: 38, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
      { trade: "Electrician", tradeEs: "Electricista", unit: "hour", hourlyRate: 55, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
      { trade: "Plumber", tradeEs: "Plomero", unit: "hour", hourlyRate: 52, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
      { trade: "Mason", tradeEs: "Albañil", unit: "hour", hourlyRate: 34, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
      { trade: "Welder", tradeEs: "Soldador", unit: "hour", hourlyRate: 48, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
    ],
    receipts: {},
    reportTemplates: {},
    contractorEstimates: {},
  });
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // proj-1 is seeded with squareMeters=180, projectType=residencial,
      // bathrooms=2, kitchens=1, contingencyPercent=8 (matches the
      // pre-refactor server default so existing estimates aren't perturbed).
      const sharedScope = ["pool", "solar"];
      const sharedExtras = { scope: sharedScope, source: "B-05 parity check", marginPercent: 12, managementFeePercent: 5 };

      // Path A: project metadata sent explicitly (legacy body).
      const explicitRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          ...sharedExtras,
          squareMeters: 180,
          projectType: "residencial",
          bathrooms: 2,
          kitchens: 1,
          contingencyPercent: 8,
        }),
      });
      assert.equal(explicitRes.status, 200);
      const explicit = (await explicitRes.json()) as {
        grandTotal: number;
        contingencyPercent: number;
        contingency: number;
        subtotalMaterials: number;
        subtotalLabor: number;
        subtotalSubcontractor: number;
      };

      // Path B: project metadata omitted — server falls back to the project record.
      const fromProjectRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(sharedExtras),
      });
      assert.equal(fromProjectRes.status, 200);
      const fromProject = (await fromProjectRes.json()) as typeof explicit;

      assert.equal(
        fromProject.contingencyPercent,
        explicit.contingencyPercent,
        "contingency % must match the project's seeded value when omitted from body",
      );
      assert.equal(fromProject.contingencyPercent, 8);
      assert.equal(fromProject.subtotalMaterials, explicit.subtotalMaterials);
      assert.equal(fromProject.subtotalLabor, explicit.subtotalLabor);
      assert.equal(fromProject.subtotalSubcontractor, explicit.subtotalSubcontractor);
      assert.equal(fromProject.contingency, explicit.contingency);
      assert.equal(
        fromProject.grandTotal,
        explicit.grandTotal,
        "grand total must be identical whether metadata is sent in the body or read from the project",
      );

      // Hard baseline against the pre-refactor numbers captured for these
      // exact inputs (proj-1 seed + DEFAULT_LABOR_RATES injected above +
      // scope:[pool,solar], margin 12, mgmt 5, contingency 8). If any of
      // these change, the estimate math has silently drifted and this test
      // must be updated deliberately.
      assert.equal(explicit.subtotalMaterials, 25980, "baseline: materials subtotal");
      assert.equal(explicit.subtotalLabor, 27303, "baseline: labor subtotal");
      assert.equal(explicit.subtotalSubcontractor, 68200, "baseline: subcontractor subtotal");
      assert.equal(explicit.contingency, 9719, "baseline: contingency $");
      assert.equal(explicit.marginAmount, 15744, "baseline: margin $");
      assert.equal(explicit.managementFeeAmount, 7347, "baseline: management fee $");
      assert.equal(explicit.grandTotal, 154293, "baseline: grand total");
    });
  } finally {
    await restoreState(snap);
  }
});

// B-05: PATCH /projects/:id/metadata persists project-level metadata so the
// next contractor estimate (without those fields in the body) reflects the
// updated values.
test("B-05: PATCH /projects/:id/metadata updates Project and feeds the next estimate", async () => {
  const snap = snapshotState();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // Patch proj-1 metadata to known values.
      const patchRes = await fetch(`${baseUrl}/api/projects/proj-1/metadata`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({
          squareMeters: 240,
          bathrooms: 3,
          kitchens: 2,
          projectType: "mixto",
          contingencyPercent: 15,
        }),
      });
      assert.equal(patchRes.status, 200);
      const patched = (await patchRes.json()) as {
        projectId: string;
        squareMeters: number;
        bathrooms: number;
        kitchens: number;
        projectType: string;
        contingencyPercent: number;
      };
      assert.equal(patched.squareMeters, 240);
      assert.equal(patched.contingencyPercent, 15);
      assert.equal(patched.projectType, "mixto");

      // GET project should reflect the patch (single source of truth).
      const projRes = await fetch(`${baseUrl}/api/projects/proj-1`, { headers: auth });
      assert.equal(projRes.status, 200);
      const proj = (await projRes.json()) as {
        squareMeters?: number;
        bathrooms?: number;
        kitchens?: number;
        projectType?: string;
        contingencyPercent?: number;
      };
      assert.equal(proj.squareMeters, 240);
      assert.equal(proj.bathrooms, 3);
      assert.equal(proj.kitchens, 2);
      assert.equal(proj.projectType, "mixto");
      assert.equal(proj.contingencyPercent, 15);

      // Generating an estimate without body metadata should pick up the patched values.
      const estRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ scope: [], source: "B-05 patch parity", marginPercent: 0, managementFeePercent: 0 }),
      });
      assert.equal(estRes.status, 200);
      const est = (await estRes.json()) as { contingencyPercent: number; grandTotal: number };
      assert.equal(est.contingencyPercent, 15, "estimate should use the patched contingency from the project");
      assert.ok(est.grandTotal > 0);

      // Bad payload (negative sqm) should 400.
      const bad = await fetch(`${baseUrl}/api/projects/proj-1/metadata`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ squareMeters: -5 }),
      });
      assert.equal(bad.status, 400);
    });
  } finally {
    await restoreState(snap);
    // Reset the in-memory project metadata back to seed values so this test
    // doesn't bleed into others that rely on proj-1's defaults.
    const { PROJECTS: liveProjects } = await import("../../data/seed");
    const p1 = liveProjects.find((p) => p.id === "proj-1") as
      | (typeof liveProjects[number] & {
          squareMeters?: number; bathrooms?: number; kitchens?: number;
          projectType?: "residencial" | "comercial" | "mixto" | "contenedor";
          contingencyPercent?: number;
        })
      | undefined;
    if (p1) {
      p1.squareMeters = 180;
      p1.bathrooms = 2;
      p1.kitchens = 1;
      p1.projectType = "residencial";
      p1.contingencyPercent = 8;
    }
  }
});
