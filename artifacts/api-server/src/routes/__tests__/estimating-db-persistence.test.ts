// Postgres-backed persistence tests (Task #141).
//
// These tests cover the two pieces that the older `estimating.test.ts`
// "survives a restart" sub-test does NOT exercise:
//   1. Calculator-entry persistence end-to-end through the PATCH route.
//   2. The one-time JSON → Postgres migration is idempotent and renames
//      the legacy file.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  importedMaterialsTable,
  laborRatesTable,
  projectContractorEstimatesTable,
  projectContractorEstimateLinesTable,
  projectReceiptsTable,
  projectReportTemplatesTable,
  projectCalculatorEntriesTable,
  estimatingMigrationsTable,
} from "@workspace/db";
import {
  loadCalculatorEntriesFromDb,
  saveCalculatorEntriesForProject,
  saveEstimatingSnapshotToDb,
  loadEstimatingSnapshotFromDb,
  migrateEstimatingJsonIfNeeded,
  __resetEstimatingTablesForTest,
  type CalculatorEntry,
} from "../../lib/estimating-store";
import { CALCULATOR_ENTRIES } from "../../data/seed";
import {
  flushCalculatorPersistence,
  __resetCalculatorHydrationForTest,
  ensureCalculatorHydrated,
} from "../projects";
import { flushEstimatingPersistence, applyEstimatingSnapshot } from "../estimating";

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

function snapshotCalc(projectId: string): Record<string, unknown>[] {
  const calc = CALCULATOR_ENTRIES as unknown as Record<string, Record<string, unknown>[]>;
  return calc[projectId] ? JSON.parse(JSON.stringify(calc[projectId])) : [];
}
function restoreCalc(projectId: string, before: Record<string, unknown>[]) {
  const calc = CALCULATOR_ENTRIES as unknown as Record<string, Record<string, unknown>[]>;
  calc[projectId] = before;
}

test("DB-1: estimating snapshot round-trips via Postgres (per-store coverage)", async () => {
  await __resetEstimatingTablesForTest();
  try {
    await saveEstimatingSnapshotToDb({
      extraMaterials: [
        { id: "mat-imp-rt", item: "RoundTrip Tile", itemEs: "Loseta RT", category: "finishes", unit: "sqft", basePrice: 8.25 },
      ],
      laborRates: [
        { trade: "RT Trade", tradeEs: "RT Oficio", unit: "hour", hourlyRate: 41.5, source: "import", updatedAt: "2026-04-01T00:00:00Z" },
      ],
      receipts: {
        "proj-rt": [
          { id: "rec-rt-1", vendor: "RT Vendor A", date: "2026-04-10", trade: "RT Trade", amount: 200.5, hours: 4 },
          { id: "rec-rt-2", vendor: "RT Vendor B", date: "2026-04-11", trade: "RT Trade", amount: 50.25, hours: 1 },
        ],
      },
      reportTemplates: {
        "proj-rt": {
          name: "RT Template",
          columns: ["Category", "Item", "Total"],
          headerLines: ["RT Header 1", "RT Header 2"],
          footer: "RT Footer",
          uploadedAt: "2026-04-12T10:00:00Z",
          uploadedBy: "rt@konti.com",
        },
      },
      contractorEstimates: {
        "proj-rt": {
          projectId: "proj-rt",
          source: "RT Source",
          squareMeters: 100,
          projectType: "residencial",
          scope: ["roof", "kitchen"],
          bathrooms: 1,
          kitchens: 1,
          lines: [
            { id: "ln-rt-1", category: "materials", description: "RT line 1", descriptionEs: "RT línea 1", quantity: 2, unit: "unit", unitPrice: 100, lineTotal: 200 },
            { id: "ln-rt-2", category: "labor", description: "RT line 2", descriptionEs: "RT línea 2", quantity: 5, unit: "hour", unitPrice: 41.5, lineTotal: 207.5 },
          ],
          subtotalMaterials: 200,
          subtotalLabor: 207.5,
          subtotalSubcontractor: 0,
          contingencyPercent: 8,
          contingency: 32.6,
          marginPercent: 12,
          marginAmount: 50,
          managementFeePercent: 5,
          managementFeeAmount: 24,
          grandTotal: 514.1,
          generatedAt: "2026-04-12T10:01:00Z",
          generatedBy: "rt@konti.com",
        },
      },
    });

    const fromDb = await loadEstimatingSnapshotFromDb();
    assert.ok(fromDb);
    assert.equal(fromDb!.extraMaterials.length, 1);
    assert.equal(fromDb!.extraMaterials[0]!.item, "RoundTrip Tile");
    assert.equal(fromDb!.laborRates.length, 1);
    assert.equal(fromDb!.laborRates[0]!.hourlyRate, 41.5);
    assert.equal(fromDb!.receipts["proj-rt"]?.length, 2);
    // Order preserved by `position`.
    assert.equal(fromDb!.receipts["proj-rt"]?.[0]?.id, "rec-rt-1");
    assert.equal(fromDb!.receipts["proj-rt"]?.[1]?.id, "rec-rt-2");
    assert.deepEqual(fromDb!.reportTemplates["proj-rt"]?.columns, ["Category", "Item", "Total"]);
    assert.equal(fromDb!.contractorEstimates["proj-rt"]?.lines.length, 2);
    // Line ordering preserved by `position`.
    assert.equal(fromDb!.contractorEstimates["proj-rt"]?.lines[0]?.id, "ln-rt-1");
    assert.equal(fromDb!.contractorEstimates["proj-rt"]?.lines[1]?.id, "ln-rt-2");
    assert.equal(fromDb!.contractorEstimates["proj-rt"]?.grandTotal, 514.1);

    // Save again as empty → all tables should be empty after, and load returns null.
    await saveEstimatingSnapshotToDb({
      extraMaterials: [],
      laborRates: [],
      receipts: {},
      reportTemplates: {},
      contractorEstimates: {},
    });
    const empty = await loadEstimatingSnapshotFromDb();
    assert.equal(empty, null);
  } finally {
    await __resetEstimatingTablesForTest();
  }
});

test("DB-2: calculator-entry edits are persisted via PATCH and survive a simulated restart", async () => {
  // We use `proj-1`, which has 5 seeded calculator lines. Snapshot the
  // in-memory state so we can put it back at the end.
  const projectId = "proj-1";
  const before = snapshotCalc(projectId);
  await __resetEstimatingTablesForTest();
  __resetCalculatorHydrationForTest();

  try {
    const lineId = "calc-1-1";
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // Bump quantity on the first line and apply a manual override.
      const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}/calculations/${lineId}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quantity: 7, manualPriceOverride: 1234.5 }),
      });
      assert.equal(patchRes.status, 200);
      const patched = (await patchRes.json()) as { entry: { quantity: number; manualPriceOverride: number; effectivePrice: number; lineTotal: number } };
      assert.equal(patched.entry.quantity, 7);
      assert.equal(patched.entry.manualPriceOverride, 1234.5);
      assert.equal(patched.entry.effectivePrice, 1234.5);
      assert.equal(patched.entry.lineTotal, Math.round(1234.5 * 7 * 100) / 100);
    });

    // Wait for the fire-and-forget DB write to settle.
    await flushCalculatorPersistence();

    // The whole project's entries should now be in Postgres, in order.
    const byProject = await loadCalculatorEntriesFromDb();
    assert.ok(byProject[projectId], "project should have entries in DB");
    assert.equal(byProject[projectId]!.length, before.length);
    const persistedFirst = byProject[projectId]!.find((e) => e.id === lineId);
    assert.ok(persistedFirst, "patched line should be in DB");
    assert.equal(persistedFirst!.quantity, 7);
    assert.equal(persistedFirst!.manualPriceOverride, 1234.5);
    assert.equal(persistedFirst!.lineTotal, Math.round(1234.5 * 7 * 100) / 100);

    // Simulate a restart: wipe in-memory entries for this project, then run
    // hydration the same way the bootstrap path does. The patched line
    // must come back from the DB (not the seed defaults).
    const calc = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
    delete calc[projectId];
    __resetCalculatorHydrationForTest();
    await ensureCalculatorHydrated();

    const reloaded = (CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>)[projectId];
    assert.ok(reloaded, "calc entries should rehydrate from DB");
    const reloadedFirst = reloaded!.find((e) => e.id === lineId);
    assert.equal(reloadedFirst?.quantity, 7);
    assert.equal(reloadedFirst?.manualPriceOverride, 1234.5);
    assert.equal(reloadedFirst?.lineTotal, Math.round(1234.5 * 7 * 100) / 100);

    // Projects with no DB rows should still use seed defaults — confirm
    // by checking proj-2 (which was never patched in this test) is intact.
    const proj2 = (CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>)["proj-2"];
    assert.ok(proj2 && proj2.length > 0, "proj-2 keeps seed defaults");
  } finally {
    // Restore in-memory state for the rest of the suite, clean up DB rows.
    restoreCalc(projectId, before);
    await saveCalculatorEntriesForProject(projectId, []);
    __resetCalculatorHydrationForTest();
  }
});

test("DB-3: legacy JSON migration is idempotent and renames the source file", async () => {
  await __resetEstimatingTablesForTest();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "konti-mig-"));
  const jsonPath = path.join(tmpDir, "estimating.json");

  const legacy = {
    extraMaterials: [
      { id: "mat-leg-1", item: "Legacy Tile", itemEs: "Loseta Legacy", category: "finishes", unit: "sqft", basePrice: 5.5 },
    ],
    laborRates: [
      { trade: "Legacy Trade", tradeEs: "Oficio Legacy", unit: "hour", hourlyRate: 33, source: "import", updatedAt: "2026-03-01T00:00:00Z" },
    ],
    receipts: {
      "proj-legacy": [
        { id: "rec-leg-1", vendor: "Legacy Vendor", date: "2026-03-15", trade: "Legacy Trade", amount: 99, hours: 2 },
      ],
    },
    reportTemplates: {},
    contractorEstimates: {},
  };
  fs.writeFileSync(jsonPath, JSON.stringify(legacy), "utf8");

  try {
    // First call — does the actual import.
    const r1 = await migrateEstimatingJsonIfNeeded({ jsonPath });
    assert.equal(r1.status, "migrated");
    assert.ok(r1.backupPath, "should rename the source file on success");
    assert.ok(!fs.existsSync(jsonPath), "original file should be moved");
    assert.ok(fs.existsSync(r1.backupPath!), "backup file should exist");

    const snap = await loadEstimatingSnapshotFromDb();
    assert.ok(snap);
    assert.ok(snap!.extraMaterials.some((m) => m.id === "mat-leg-1"));
    assert.ok(snap!.laborRates.some((l) => l.trade === "Legacy Trade"));
    assert.ok(snap!.receipts["proj-legacy"]?.some((r) => r.id === "rec-leg-1"));

    // Migration recorded.
    const recorded = await db
      .select()
      .from(estimatingMigrationsTable)
      .where(eq(estimatingMigrationsTable.id, "estimating-json-2026-05"));
    assert.equal(recorded.length, 1);

    // Second call (even if someone restored a fresh file) — must NOT re-import.
    fs.writeFileSync(jsonPath, JSON.stringify({ extraMaterials: [{ id: "should-not-import", item: "Nope", itemEs: "Nope", category: "x", unit: "x", basePrice: 1 }], laborRates: [], receipts: {}, reportTemplates: {}, contractorEstimates: {} }), "utf8");
    const r2 = await migrateEstimatingJsonIfNeeded({ jsonPath });
    assert.equal(r2.status, "already_applied");
    const after = await loadEstimatingSnapshotFromDb();
    assert.ok(after!.extraMaterials.every((m) => m.id !== "should-not-import"));
    // The file we just wrote should still be there since the migration is a no-op now.
    assert.ok(fs.existsSync(jsonPath));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await __resetEstimatingTablesForTest();
  }
});

test("DB-4: importing materials with projectId persists the auto-added calculator lines", async () => {
  // Regression for the materials/import path: it auto-appends calculator
  // lines for the target project on top of the materials catalog. Both the
  // catalog (estimating snapshot) AND the calculator entries
  // (`project_calculator_entries`) must survive a restart — earlier wiring
  // only persisted the catalog, so imported lines vanished.
  const projectId = "proj-1";
  const before = snapshotCalc(projectId);
  await __resetEstimatingTablesForTest();
  __resetCalculatorHydrationForTest();

  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${baseUrl}/api/estimating/materials/import`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          projectId,
          materials: [
            { item: "Imported Slab", item_es: "Losa Importada", category: "structure", unit: "sqft", base_price: 12.5, qty: 3 },
            { item: "Imported Bolt", item_es: "Perno Importado", category: "fasteners", unit: "each", base_price: 0.75, qty: 100 },
          ],
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { imported: number; addedToProjectCalculator: number; addedToProjectCalculatorId: string | null };
      assert.equal(body.imported, 2);
      assert.equal(body.addedToProjectCalculator, 2);
      assert.equal(body.addedToProjectCalculatorId, projectId);
    });

    // Wait for both the estimating snapshot (materials catalog) and the
    // per-project calculator write to drain — they live in different
    // queues but the test asserts both writes survived.
    await flushEstimatingPersistence();
    await flushCalculatorPersistence();

    // Both the catalog and the calculator rows should now be in Postgres.
    const snap = await loadEstimatingSnapshotFromDb();
    assert.ok(snap);
    assert.ok(snap!.extraMaterials.some((m) => m.item === "Imported Slab"));
    assert.ok(snap!.extraMaterials.some((m) => m.item === "Imported Bolt"));

    const byProject = await loadCalculatorEntriesFromDb();
    const persisted = byProject[projectId];
    assert.ok(persisted, "calculator rows for the target project should be persisted");
    const slabLine = persisted!.find((e) => e.materialName === "Imported Slab");
    const boltLine = persisted!.find((e) => e.materialName === "Imported Bolt");
    assert.ok(slabLine, "imported Slab line should be in DB");
    assert.ok(boltLine, "imported Bolt line should be in DB");
    assert.equal(slabLine!.quantity, 3);
    assert.equal(slabLine!.lineTotal, 37.5);
    assert.equal(boltLine!.quantity, 100);
    assert.equal(boltLine!.lineTotal, 75);

    // Simulate restart: drop in-memory state and re-hydrate. The imported
    // lines must come back from the DB on top of the existing seed lines.
    const calc = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
    delete calc[projectId];
    __resetCalculatorHydrationForTest();
    await ensureCalculatorHydrated();

    const reloaded = (CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>)[projectId];
    assert.ok(reloaded, "calc entries should rehydrate from DB after restart");
    assert.ok(reloaded!.some((e) => e.materialName === "Imported Slab"), "imported Slab survives restart");
    assert.ok(reloaded!.some((e) => e.materialName === "Imported Bolt"), "imported Bolt survives restart");
  } finally {
    restoreCalc(projectId, before);
    await saveCalculatorEntriesForProject(projectId, []);
    __resetCalculatorHydrationForTest();
    await __resetEstimatingTablesForTest();
  }
});

test("DB-5: index.ts boot path wires hydration BEFORE app.listen", () => {
  // Static-check guard: if someone deletes the hydration calls from
  // index.ts (or moves `app.listen` ahead of them), this test fails so
  // the regression is caught before a deploy. Hydration must run before
  // we accept traffic — otherwise calculator entries / estimating
  // snapshots come from seed defaults and live edits get clobbered on
  // the next persist.
  // Resolve relative to the api-server package root so the test works
  // under both ESM (no __dirname) and the future bundled build path.
  const indexPath = path.join(process.cwd(), "src", "index.ts");
  const src = fs.readFileSync(indexPath, "utf8");
  assert.match(src, /ensureEstimatingHydrated\(\)/, "boot must call ensureEstimatingHydrated()");
  assert.match(src, /ensureCalculatorHydrated\(\)/, "boot must call ensureCalculatorHydrated()");
  const idxEstimating = src.indexOf("ensureEstimatingHydrated()");
  const idxCalculator = src.indexOf("ensureCalculatorHydrated()");
  const idxListen = src.indexOf("app.listen");
  assert.ok(idxEstimating < idxListen, "ensureEstimatingHydrated must be wired before app.listen");
  assert.ok(idxCalculator < idxListen, "ensureCalculatorHydrated must be wired before app.listen");
});

test("DB-6: 200 OK guarantees durability — calculator + estimating writes are committed BEFORE response (no flush)", async () => {
  // Crash-window regression: the previous fire-and-forget design queued
  // DB writes after responding 200, so a crash between ack and queue
  // drain silently lost acknowledged writes. The fix awaits the persist
  // promise inside each mutating handler so the response cannot beat the
  // commit. This test proves the contract by deliberately NOT calling
  // `flushCalculatorPersistence()` / `flushEstimatingPersistence()` —
  // the rows must already be in Postgres by the time the HTTP response
  // resolves.
  const projectId = "proj-1";
  const before = snapshotCalc(projectId);
  await __resetEstimatingTablesForTest();
  __resetCalculatorHydrationForTest();

  try {
    const lineId = "calc-1-1";
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // 1. Calculator PATCH — handler must await persist before responding.
      const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}/calculations/${lineId}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quantity: 9, manualPriceOverride: 777.77 }),
      });
      assert.equal(patchRes.status, 200);
      // NO flush call — the next line reads the DB directly. If the
      // handler responded 200 before the commit, this read would miss it
      // and the assertion below would fail.
      const byProject = await loadCalculatorEntriesFromDb();
      const persisted = byProject[projectId]?.find((e) => e.id === lineId);
      assert.ok(persisted, "PATCH 200 OK must mean calculator row is already in DB (no flush)");
      assert.equal(persisted!.quantity, 9);
      assert.equal(persisted!.manualPriceOverride, 777.77);

      // 2. Estimating labor-rates import — same contract for the
      // estimating snapshot path.
      const importRes = await fetch(`${baseUrl}/api/estimating/labor-rates/import`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          csv: "trade,trade_es,unit,hourly_rate\nDurability Trade,Oficio Durabilidad,hour,42.42\n",
        }),
      });
      assert.equal(importRes.status, 200);
      // Again, NO flush — read directly from DB.
      const snap = await loadEstimatingSnapshotFromDb();
      assert.ok(snap, "estimating snapshot must already be in DB after 200 OK");
      assert.ok(
        snap!.laborRates.some((r) => r.trade === "Durability Trade" && r.hourlyRate === 42.42),
        "imported labor rate must be in DB before response resolves (no flush)",
      );
    });
  } finally {
    restoreCalc(projectId, before);
    await saveCalculatorEntriesForProject(projectId, []);
    __resetCalculatorHydrationForTest();
    await __resetEstimatingTablesForTest();
    // Reset in-memory estimating state too — the API mutations above
    // appended a "Durability Trade" labor rate to LABOR_RATES which
    // would otherwise leak into the next test file in the same process
    // (the PDF tests in estimating.test.ts snapshot at start, so a
    // polluted snapshot becomes the new "baseline" they restore to).
    applyEstimatingSnapshot(null);
  }
});

test("DB-7: clobber guard refuses to overwrite live DB when migration marker is missing", async () => {
  // Regression for Task #141: if a fresh deploy is pointed at a backup
  // (or the marker row is accidentally deleted) but the estimating
  // tables already hold real data, `migrateEstimatingJsonIfNeeded` must
  // NOT replay the legacy JSON on top — `_writeSnapshot` truncates and
  // would silently wipe live materials/receipts/estimates. Instead it
  // should log, insert a "skipped: db non-empty" marker row, leave the
  // JSON in place for an operator to inspect, and return already_applied.
  await __resetEstimatingTablesForTest();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "konti-clobber-"));
  const jsonPath = path.join(tmpDir, "estimating.json");

  try {
    // Seed the DB with non-trivial live data across multiple tables.
    await saveEstimatingSnapshotToDb({
      extraMaterials: [
        { id: "mat-live-1", item: "Live Tile", itemEs: "Loseta Viva", category: "finishes", unit: "sqft", basePrice: 9.99 },
      ],
      laborRates: [
        { trade: "Live Trade", tradeEs: "Oficio Vivo", unit: "hour", hourlyRate: 55, source: "import", updatedAt: "2026-04-20T00:00:00Z" },
      ],
      receipts: {
        "proj-live": [
          { id: "rec-live-1", vendor: "Live Vendor", date: "2026-04-21", trade: "Live Trade", amount: 321, hours: 6 },
        ],
      },
      reportTemplates: {},
      contractorEstimates: {},
    });

    // Ensure the migration marker row is absent (this is the dangerous
    // state the guard exists for).
    await db
      .delete(estimatingMigrationsTable)
      .where(eq(estimatingMigrationsTable.id, "estimating-json-2026-05"));

    // Write a *different* legacy JSON that, if applied, would wipe the
    // live data above and replace it with these contents.
    const stale = {
      extraMaterials: [
        { id: "mat-stale-1", item: "Stale Tile", itemEs: "Loseta Vieja", category: "finishes", unit: "sqft", basePrice: 1.11 },
      ],
      laborRates: [
        { trade: "Stale Trade", tradeEs: "Oficio Viejo", unit: "hour", hourlyRate: 1, source: "import", updatedAt: "2020-01-01T00:00:00Z" },
      ],
      receipts: {
        "proj-stale": [
          { id: "rec-stale-1", vendor: "Stale Vendor", date: "2020-01-02", trade: "Stale Trade", amount: 1, hours: 1 },
        ],
      },
      reportTemplates: {},
      contractorEstimates: {},
    };
    fs.writeFileSync(jsonPath, JSON.stringify(stale), "utf8");

    const result = await migrateEstimatingJsonIfNeeded({ jsonPath });

    // Return value: clean already_applied, no backupPath since we did not rename.
    assert.deepEqual(result, { status: "already_applied", jsonPath });

    // Live DB must be intact — none of the stale ids should have been imported.
    const snap = await loadEstimatingSnapshotFromDb();
    assert.ok(snap, "live snapshot must still load");
    assert.ok(snap!.extraMaterials.some((m) => m.id === "mat-live-1"), "live material survives");
    assert.ok(snap!.extraMaterials.every((m) => m.id !== "mat-stale-1"), "stale material was NOT imported");
    assert.ok(snap!.laborRates.some((l) => l.trade === "Live Trade"), "live labor rate survives");
    assert.ok(snap!.laborRates.every((l) => l.trade !== "Stale Trade"), "stale labor rate was NOT imported");
    assert.ok(snap!.receipts["proj-live"]?.some((r) => r.id === "rec-live-1"), "live receipt survives");
    assert.equal(snap!.receipts["proj-stale"], undefined, "stale receipt project was NOT imported");

    // A marker row exists with the skipped-reason details prefix.
    const recorded = await db
      .select()
      .from(estimatingMigrationsTable)
      .where(eq(estimatingMigrationsTable.id, "estimating-json-2026-05"));
    assert.equal(recorded.length, 1, "marker row should be inserted to stop re-checking on every boot");
    assert.ok(
      recorded[0]!.details?.startsWith("skipped: db non-empty"),
      `details should start with "skipped: db non-empty", got: ${recorded[0]!.details}`,
    );

    // The JSON file is left in place (NOT renamed) so an operator can inspect it.
    assert.ok(fs.existsSync(jsonPath), "stale JSON should be left in place for inspection");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await __resetEstimatingTablesForTest();
  }
});

// Suppress unused warning — these helpers are exported for downstream use
// and we want to keep them in the test surface in case future tests need
// them, but only some are referenced above.
void importedMaterialsTable;
void laborRatesTable;
void projectContractorEstimatesTable;
void projectContractorEstimateLinesTable;
void projectReceiptsTable;
void projectReportTemplatesTable;
void projectCalculatorEntriesTable;
