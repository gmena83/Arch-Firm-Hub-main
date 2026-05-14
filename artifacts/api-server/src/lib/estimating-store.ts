// Estimating + calculator persistence — Postgres backend (Task #141).
//
// History: until #141 these stores lived in `.data/estimating.json`, written
// by `lib/estimating-persistence.ts` (now reduced to a deprecated re-export shim that delegates here). JSON-on-disk lost data on every
// container redeploy because Replit deployments don't keep the workspace
// filesystem. Postgres (currently the local Replit PG; Supabase later) gives
// us real durability with the same pure-snapshot API the routes already use.
//
// Public surface:
//   - loadEstimatingSnapshotFromDb()  → returns the same shape the legacy
//     JSON file held, or null when the database has nothing yet.
//   - saveEstimatingSnapshotToDb()    → wholesale replace inside one tx.
//   - loadCalculatorEntriesFromDb()   → per-project map (only keys with rows).
//   - saveCalculatorEntriesForProject → upsert one project's entries.
//   - migrateEstimatingJsonIfNeeded() → first-boot import of the legacy file
//     (idempotent, recorded in `estimating_migrations`).
//
// All writes are wrapped in a transaction so a crash mid-save can never
// leave a project's estimate / lines pair half-applied.

import { db } from "@workspace/db";
import {
  importedMaterialsTable,
  laborRatesTable,
  projectReceiptsTable,
  projectReportTemplatesTable,
  projectContractorEstimatesTable,
  projectContractorEstimateLinesTable,
  projectCalculatorEntriesTable,
  estimatingMigrationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "./logger";
import type {
  ImportedMaterial,
  LaborRate,
  Receipt,
  ReportTemplate,
  ContractorEstimate,
  ContractorEstimateLine,
} from "../routes/estimating";

// Re-exported so tests can build snapshots without re-importing the route
// module's full type list.
export interface PersistedEstimatingSnapshot {
  extraMaterials: ImportedMaterial[];
  laborRates: LaborRate[];
  receipts: Record<string, Receipt[]>;
  reportTemplates: Record<string, ReportTemplate>;
  contractorEstimates: Record<string, ContractorEstimate>;
}

export interface CalculatorEntry {
  id: string;
  projectId: string;
  materialId: string;
  materialName: string;
  materialNameEs: string;
  category: string;
  unit: string;
  quantity: number;
  basePrice: number;
  manualPriceOverride: number | null;
  effectivePrice: number;
  lineTotal: number;
}

// ---------------------------------------------------------------------------
// Estimating snapshot
// ---------------------------------------------------------------------------

/**
 * Read the full estimating snapshot from Postgres. Returns `null` when every
 * estimating-related table is empty so callers (specifically the boot
 * hydrator in `routes/estimating.ts`) can fall back to default labor rates
 * without thinking about it.
 */
export async function loadEstimatingSnapshotFromDb(): Promise<PersistedEstimatingSnapshot | null> {
  const [
    materialsRows,
    laborRows,
    receiptRows,
    templateRows,
    estimateRows,
    estimateLineRows,
  ] = await Promise.all([
    db.select().from(importedMaterialsTable),
    db.select().from(laborRatesTable),
    db.select().from(projectReceiptsTable),
    db.select().from(projectReportTemplatesTable),
    db.select().from(projectContractorEstimatesTable),
    db.select().from(projectContractorEstimateLinesTable),
  ]);

  const isEmpty =
    materialsRows.length === 0 &&
    laborRows.length === 0 &&
    receiptRows.length === 0 &&
    templateRows.length === 0 &&
    estimateRows.length === 0 &&
    estimateLineRows.length === 0;
  if (isEmpty) return null;

  const extraMaterials: ImportedMaterial[] = materialsRows.map((r) => ({
    id: r.id,
    item: r.item,
    itemEs: r.itemEs,
    category: r.category,
    unit: r.unit,
    basePrice: r.basePrice,
  }));

  const laborRates: LaborRate[] = laborRows.map((r) => ({
    trade: r.trade,
    tradeEs: r.tradeEs,
    unit: r.unit,
    hourlyRate: r.hourlyRate,
    source: r.source as LaborRate["source"],
    updatedAt: r.updatedAt,
  }));

  const receipts: Record<string, Receipt[]> = {};
  // Sort by position so the order matches what was last persisted.
  const sortedReceipts = [...receiptRows].sort((a, b) => a.position - b.position);
  for (const r of sortedReceipts) {
    if (!receipts[r.projectId]) receipts[r.projectId] = [];
    receipts[r.projectId]!.push({
      id: r.id,
      vendor: r.vendor,
      date: r.date,
      trade: r.trade,
      amount: r.amount,
      hours: r.hours,
    });
  }

  const reportTemplates: Record<string, ReportTemplate> = {};
  for (const r of templateRows) {
    reportTemplates[r.projectId] = {
      name: r.name,
      columns: r.columns,
      headerLines: r.headerLines,
      footer: r.footer,
      uploadedAt: r.uploadedAt,
      uploadedBy: r.uploadedBy,
    };
  }

  // Group lines by project, sort by position to preserve display order.
  const linesByProject = new Map<string, ContractorEstimateLine[]>();
  const sortedLines = [...estimateLineRows].sort(
    (a, b) => a.position - b.position,
  );
  for (const l of sortedLines) {
    if (!linesByProject.has(l.projectId)) linesByProject.set(l.projectId, []);
    linesByProject.get(l.projectId)!.push({
      id: l.id,
      category: l.category,
      description: l.description,
      descriptionEs: l.descriptionEs,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    });
  }

  const contractorEstimates: Record<string, ContractorEstimate> = {};
  for (const r of estimateRows) {
    contractorEstimates[r.projectId] = {
      projectId: r.projectId,
      source: r.source,
      squareMeters: r.squareMeters,
      projectType: r.projectType,
      scope: r.scope,
      bathrooms: r.bathrooms,
      kitchens: r.kitchens,
      lines: linesByProject.get(r.projectId) ?? [],
      subtotalMaterials: r.subtotalMaterials,
      subtotalLabor: r.subtotalLabor,
      subtotalSubcontractor: r.subtotalSubcontractor,
      contingencyPercent: r.contingencyPercent,
      contingency: r.contingency,
      marginPercent: r.marginPercent,
      marginAmount: r.marginAmount,
      managementFeePercent: r.managementFeePercent,
      managementFeeAmount: r.managementFeeAmount,
      grandTotal: r.grandTotal,
      generatedAt: r.generatedAt,
      generatedBy: r.generatedBy,
    };
  }

  return { extraMaterials, laborRates, receipts, reportTemplates, contractorEstimates };
}

/**
 * Drizzle's transaction callback parameter type. We accept this so that
 * `migrateEstimatingJsonIfNeeded` can run the snapshot save inside its
 * outer transaction (keeping the snapshot insert and the migration-marker
 * insert truly atomic — either both commit or neither does).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function _writeSnapshot(
  tx: Tx,
  snap: PersistedEstimatingSnapshot,
): Promise<void> {
  // Wipe everything first; cheaper than figuring out per-row diffs and the
  // tables stay tiny (a few hundred rows max in the worst case).
  await tx.delete(projectContractorEstimateLinesTable);
  await tx.delete(projectContractorEstimatesTable);
  await tx.delete(projectReportTemplatesTable);
  await tx.delete(projectReceiptsTable);
  await tx.delete(laborRatesTable);
  await tx.delete(importedMaterialsTable);

  if (snap.extraMaterials.length > 0) {
    await tx.insert(importedMaterialsTable).values(
      snap.extraMaterials.map((m) => ({
        id: m.id,
        item: m.item,
        itemEs: m.itemEs,
        category: m.category,
        unit: m.unit,
        basePrice: m.basePrice,
      })),
    );
  }

  if (snap.laborRates.length > 0) {
    await tx.insert(laborRatesTable).values(
      snap.laborRates.map((r) => ({
        trade: r.trade,
        tradeEs: r.tradeEs,
        unit: r.unit,
        hourlyRate: r.hourlyRate,
        source: r.source,
        updatedAt: r.updatedAt,
      })),
    );
  }

  const receiptRows: (typeof projectReceiptsTable.$inferInsert)[] = [];
  for (const [projectId, receipts] of Object.entries(snap.receipts)) {
    receipts.forEach((r, position) => {
      receiptRows.push({
        id: r.id,
        projectId,
        vendor: r.vendor,
        date: r.date,
        trade: r.trade,
        amount: r.amount,
        hours: r.hours,
        position,
      });
    });
  }
  if (receiptRows.length > 0) {
    await tx.insert(projectReceiptsTable).values(receiptRows);
  }

  const templateRows = Object.entries(snap.reportTemplates).map(
    ([projectId, t]) => ({
      projectId,
      name: t.name,
      columns: t.columns,
      headerLines: t.headerLines,
      footer: t.footer,
      uploadedAt: t.uploadedAt,
      uploadedBy: t.uploadedBy,
    }),
  );
  if (templateRows.length > 0) {
    await tx.insert(projectReportTemplatesTable).values(templateRows);
  }

  const estimateRows: (typeof projectContractorEstimatesTable.$inferInsert)[] = [];
  const lineRows: (typeof projectContractorEstimateLinesTable.$inferInsert)[] = [];
  for (const [projectId, est] of Object.entries(snap.contractorEstimates)) {
    estimateRows.push({
      projectId,
      source: est.source,
      squareMeters: est.squareMeters,
      projectType: est.projectType,
      scope: est.scope,
      bathrooms: est.bathrooms,
      kitchens: est.kitchens,
      subtotalMaterials: est.subtotalMaterials,
      subtotalLabor: est.subtotalLabor,
      subtotalSubcontractor: est.subtotalSubcontractor,
      contingencyPercent: est.contingencyPercent,
      contingency: est.contingency,
      marginPercent: est.marginPercent,
      marginAmount: est.marginAmount,
      managementFeePercent: est.managementFeePercent,
      managementFeeAmount: est.managementFeeAmount,
      grandTotal: est.grandTotal,
      generatedAt: est.generatedAt,
      generatedBy: est.generatedBy,
    });
    est.lines.forEach((l, position) => {
      lineRows.push({
        projectId,
        id: l.id,
        position,
        category: l.category,
        description: l.description,
        descriptionEs: l.descriptionEs,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      });
    });
  }
  if (estimateRows.length > 0) {
    await tx.insert(projectContractorEstimatesTable).values(estimateRows);
  }
  if (lineRows.length > 0) {
    await tx.insert(projectContractorEstimateLinesTable).values(lineRows);
  }
}

/**
 * Replace the entire estimating snapshot atomically. We delete-then-insert
 * inside a transaction because the in-memory model is also "this is the new
 * truth" — if a route added two receipts and removed one, mirroring that
 * with diffing would add complexity for no upside.
 */
export async function saveEstimatingSnapshotToDb(
  snap: PersistedEstimatingSnapshot,
): Promise<void> {
  await db.transaction(async (tx) => {
    await _writeSnapshot(tx, snap);
  });
}

// ---------------------------------------------------------------------------
// Calculator entries — per-project, mutated by PATCH /calculations/:lineId.
// ---------------------------------------------------------------------------

/**
 * Returns calculator entries grouped by project for projects that have any
 * rows in `project_calculator_entries`. Projects with no rows are simply
 * absent from the returned map — the route layer falls back to seed values
 * for those (so introducing a new project in `seed.ts` continues to work
 * without DB intervention).
 */
export async function loadCalculatorEntriesFromDb(): Promise<Record<string, CalculatorEntry[]>> {
  const rows = await db.select().from(projectCalculatorEntriesTable);
  const byProject: Record<string, CalculatorEntry[]> = {};
  const sorted = rows.sort((a, b) => a.position - b.position);
  for (const r of sorted) {
    if (!byProject[r.projectId]) byProject[r.projectId] = [];
    byProject[r.projectId]!.push({
      id: r.id,
      projectId: r.projectId,
      materialId: r.materialId,
      materialName: r.materialName,
      materialNameEs: r.materialNameEs,
      category: r.category,
      unit: r.unit,
      quantity: r.quantity,
      basePrice: r.basePrice,
      manualPriceOverride: r.manualPriceOverride ?? null,
      effectivePrice: r.effectivePrice,
      lineTotal: r.lineTotal,
    });
  }
  return byProject;
}

/**
 * Replace one project's calculator entries atomically. The PATCH endpoint
 * mutates one line in-place but we persist the whole project to keep the
 * "DB row order = display order" contract simple — these arrays max out at
 * a few dozen rows.
 */
export async function saveCalculatorEntriesForProject(
  projectId: string,
  entries: CalculatorEntry[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(projectCalculatorEntriesTable)
      .where(eq(projectCalculatorEntriesTable.projectId, projectId));
    if (entries.length === 0) return;
    await tx.insert(projectCalculatorEntriesTable).values(
      entries.map((e, position) => ({
        id: e.id,
        projectId,
        position,
        materialId: e.materialId,
        materialName: e.materialName,
        materialNameEs: e.materialNameEs,
        category: e.category,
        unit: e.unit,
        quantity: e.quantity,
        basePrice: e.basePrice,
        manualPriceOverride: e.manualPriceOverride,
        effectivePrice: e.effectivePrice,
        lineTotal: e.lineTotal,
      })),
    );
  });
}

// ---------------------------------------------------------------------------
// One-time JSON → Postgres migration
// ---------------------------------------------------------------------------

const JSON_MIGRATION_ID = "estimating-json-2026-05";

function defaultJsonPath(): string {
  if (process.env["ESTIMATING_PERSIST_FILE"]) {
    return process.env["ESTIMATING_PERSIST_FILE"] as string;
  }
  const baseDir = process.env["KONTI_DATA_DIR"]
    ? (process.env["KONTI_DATA_DIR"] as string)
    : path.resolve(process.cwd(), ".data");
  return path.join(baseDir, "estimating.json");
}

/**
 * If a legacy `estimating.json` exists AND we have not yet recorded a
 * successful import in `estimating_migrations`, parse it and write it into
 * Postgres inside a transaction, then rename the file to `.migrated.<ISO>`
 * so a subsequent boot doesn't see it. Returns metadata about what
 * happened, primarily for tests + logging. Idempotent — safe to call on
 * every boot.
 */
export async function migrateEstimatingJsonIfNeeded(opts: {
  jsonPath?: string;
} = {}): Promise<{
  status: "no_file" | "already_applied" | "migrated";
  jsonPath: string;
  backupPath?: string;
}> {
  const jsonPath = opts.jsonPath ?? defaultJsonPath();

  // Already recorded? Nothing to do — even if someone restored the file from
  // a backup we don't want to clobber the live DB.
  const existing = await db
    .select()
    .from(estimatingMigrationsTable)
    .where(eq(estimatingMigrationsTable.id, JSON_MIGRATION_ID));
  if (existing.length > 0) {
    return { status: "already_applied", jsonPath };
  }

  if (!fs.existsSync(jsonPath)) {
    return { status: "no_file", jsonPath };
  }

  // Clobber guard: if the migration marker is missing (fresh DB pointed at
  // a backup, marker accidentally deleted, partial restore) but the
  // estimating tables already hold real data, do NOT replay an old JSON
  // snapshot on top of it — `_writeSnapshot` truncates and would silently
  // wipe live materials / receipts / estimates. Insert the marker so we
  // stop checking on every boot, log loudly, and bail out untouched.
  // Count every table that participates in the snapshot/calculator stores.
  // Includes the line-detail tables (`project_contractor_estimate_lines`,
  // `project_calculator_entries`) so the clobber guard catches partial /
  // inconsistent states where header rows were truncated but child rows
  // remain — not just the headers themselves.
  const [matCount, laborCount, receiptCount, tplCount, estCount, estLineCount, calcCount] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(importedMaterialsTable),
      db.select({ n: sql<number>`count(*)::int` }).from(laborRatesTable),
      db.select({ n: sql<number>`count(*)::int` }).from(projectReceiptsTable),
      db.select({ n: sql<number>`count(*)::int` }).from(projectReportTemplatesTable),
      db.select({ n: sql<number>`count(*)::int` }).from(projectContractorEstimatesTable),
      db.select({ n: sql<number>`count(*)::int` }).from(projectContractorEstimateLinesTable),
      db.select({ n: sql<number>`count(*)::int` }).from(projectCalculatorEntriesTable),
    ]);
  const totalRows =
    (matCount[0]?.n ?? 0) +
    (laborCount[0]?.n ?? 0) +
    (receiptCount[0]?.n ?? 0) +
    (tplCount[0]?.n ?? 0) +
    (estCount[0]?.n ?? 0) +
    (estLineCount[0]?.n ?? 0) +
    (calcCount[0]?.n ?? 0);
  if (totalRows > 0) {
    logger.warn(
      { jsonPath, totalRows },
      "estimating-store: legacy JSON present but DB is non-empty — refusing to overwrite. Marking migration as applied; rename or remove the JSON to silence this.",
    );
    await db
      .insert(estimatingMigrationsTable)
      .values({
        id: JSON_MIGRATION_ID,
        details: `skipped: db non-empty (${totalRows} rows) at ${jsonPath}`,
      });
    return { status: "already_applied", jsonPath };
  }

  let parsed: PersistedEstimatingSnapshot;
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    if (!raw.trim()) {
      // Empty file — nothing to import but record the migration anyway so
      // we don't keep checking on every boot. Rename it too so the next
      // boot is a no-op even before the marker is consulted (matches
      // behaviour of the normal migrated path below).
      await db
        .insert(estimatingMigrationsTable)
        .values({ id: JSON_MIGRATION_ID, details: `empty file: ${jsonPath}` });
      const emptyBackup = `${jsonPath}.migrated.${new Date()
        .toISOString()
        .replace(/[:]/g, "-")}`;
      try {
        fs.renameSync(jsonPath, emptyBackup);
      } catch (err) {
        logger.warn(
          { err, jsonPath, backupPath: emptyBackup },
          "estimating-store: empty-file migration succeeded but rename failed",
        );
      }
      return { status: "migrated", jsonPath, backupPath: emptyBackup };
    }
    parsed = JSON.parse(raw) as PersistedEstimatingSnapshot;
  } catch (err) {
    logger.error({ err, jsonPath }, "estimating-store: legacy JSON parse failed");
    throw err; // Loud failure — operator should fix the file or remove it.
  }

  // Defensive defaults so a partially-shaped file still imports.
  const safe: PersistedEstimatingSnapshot = {
    extraMaterials: Array.isArray(parsed.extraMaterials) ? parsed.extraMaterials : [],
    laborRates: Array.isArray(parsed.laborRates) ? parsed.laborRates : [],
    receipts: parsed.receipts && typeof parsed.receipts === "object" ? parsed.receipts : {},
    reportTemplates:
      parsed.reportTemplates && typeof parsed.reportTemplates === "object"
        ? parsed.reportTemplates
        : {},
    contractorEstimates:
      parsed.contractorEstimates && typeof parsed.contractorEstimates === "object"
        ? parsed.contractorEstimates
        : {},
  };

  // One transaction for both the snapshot write and the migration-marker
  // insert: either both commit or neither does. Note we call the private
  // `_writeSnapshot(tx, ...)` helper rather than the public
  // `saveEstimatingSnapshotToDb` — the latter would open a *separate*
  // transaction and let one half commit without the other.
  await db.transaction(async (tx) => {
    await _writeSnapshot(tx, safe);
    await tx
      .insert(estimatingMigrationsTable)
      .values({ id: JSON_MIGRATION_ID, details: `imported from ${jsonPath}` });
  });

  // Rename the source file so the next boot is a no-op even before the
  // migration row is consulted.
  const backupPath = `${jsonPath}.migrated.${new Date()
    .toISOString()
    .replace(/[:]/g, "-")}`;
  try {
    fs.renameSync(jsonPath, backupPath);
  } catch (err) {
    logger.warn(
      { err, jsonPath, backupPath },
      "estimating-store: migration succeeded but rename failed",
    );
  }

  logger.info(
    {
      jsonPath,
      backupPath,
      counts: {
        extraMaterials: safe.extraMaterials.length,
        laborRates: safe.laborRates.length,
        receiptProjects: Object.keys(safe.receipts).length,
        templates: Object.keys(safe.reportTemplates).length,
        estimates: Object.keys(safe.contractorEstimates).length,
      },
    },
    "estimating-store: imported legacy JSON into Postgres",
  );

  return { status: "migrated", jsonPath, backupPath };
}

// Test helpers — let tests reset the DB between runs without exposing the
// raw drizzle handle to the route layer.
export async function __resetEstimatingTablesForTest(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectContractorEstimateLinesTable);
    await tx.delete(projectContractorEstimatesTable);
    await tx.delete(projectReportTemplatesTable);
    await tx.delete(projectReceiptsTable);
    await tx.delete(laborRatesTable);
    await tx.delete(importedMaterialsTable);
    await tx.delete(projectCalculatorEntriesTable);
    await tx.execute(
      sql`DELETE FROM estimating_migrations WHERE id = ${JSON_MIGRATION_ID}`,
    );
  });
}
