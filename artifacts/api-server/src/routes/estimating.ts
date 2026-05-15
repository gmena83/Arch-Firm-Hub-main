import { Router, type IRouter } from "express";
import {
  PROJECTS,
  MATERIALS,
  CALCULATOR_ENTRIES,
  PROJECT_COST_PLUS,
  PROJECT_CSV_MAPPINGS,
  PROJECT_INVOICES,
  type CsvImportKind,
} from "../data/seed";
import { appendActivityAndPersist, persistCsvMappingForProject } from "../lib/lifecycle-persistence";
import { requireRole } from "../middlewares/require-role";
import { getManagedSecret } from "../lib/managed-secrets";
import { enforceClientOwnership } from "../middlewares/client-ownership";
import {
  loadEstimatingSnapshotFromDb,
  saveEstimatingSnapshotToDb,
  migrateEstimatingJsonIfNeeded,
} from "../lib/estimating-store";
import { persistCalculatorEntriesForProject } from "../lib/calculator-persistence";
import { logger } from "../lib/logger";
import { extractAndParseReceipt } from "../lib/receipt-ocr";
import { isDriveEnabled } from "../lib/integrations-config";
import { uploadDocumentToDrive } from "../lib/drive-sync";
import { nextId } from "../lib/id";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// In-memory stores (demo session) — survive until process restart.
// ---------------------------------------------------------------------------

export interface ImportedMaterial {
  id: string;
  item: string;
  itemEs: string;
  category: string;
  unit: string;
  basePrice: number;
}

export interface LaborRate {
  trade: string;
  tradeEs: string;
  unit: string; // hour | day | sqft | unit
  hourlyRate: number;
  source: "seed" | "import" | "receipts";
  updatedAt: string;
}

export interface Receipt {
  id: string;
  vendor: string;
  date: string;
  trade: string;
  amount: number;
  hours: number;
  // P5.4 — Class column from the team's existing 2a) PURCHASES sheet:
  // `Included` = chargeable to the client; `Excluded` = non-chargeable
  // (absorbed by KONTi). Default true. Variance + cost-plus filters
  // honor this flag.
  chargeable?: boolean;
}

// P5.2 — Individual line items extracted from a multi-item receipt scan
// (e.g. one Home Depot trip with 8 materials → 8 rows). One Receipt row
// can have many LineItems via the `receiptId` FK.
export interface ReceiptLineItem {
  id: string;
  receiptId: string;
  projectId: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  chargeable: boolean;
  createdAt: string;
}

export const PROJECT_RECEIPT_LINE_ITEMS: Record<string, ReceiptLineItem[]> = {};

export interface ReportTemplate {
  name: string;
  columns: string[];
  headerLines: string[];
  footer: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ContractorEstimateLine {
  id: string;
  category: string;
  description: string;
  descriptionEs: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  // Task #158 / B-02 — Hourly vs Lump Sum labor classification. Optional and
  // only meaningful for `category === "labor"`. Defaults to "hourly" when
  // omitted; "lump" lines are treated as fixed-price (variance is amount-delta
  // rather than per-hour delta) and the dashboard's calculator forces qty=1
  // unit="lump" so the line total IS the lump sum.
  laborType?: "hourly" | "lump";
}

export interface ContractorEstimate {
  projectId: string;
  source: string;
  squareMeters: number;
  projectType: string;
  scope: string[];
  bathrooms: number;
  kitchens: number;
  lines: ContractorEstimateLine[];
  subtotalMaterials: number;
  subtotalLabor: number;
  subtotalSubcontractor: number;
  contingencyPercent: number;
  contingency: number;
  marginPercent: number;
  marginAmount: number;
  managementFeePercent: number;
  managementFeeAmount: number;
  grandTotal: number;
  generatedAt: string;
  generatedBy: string;
  // P1.4 — visible manual overrides surfaced on the Contractor calculator.
  // When set, the next regenerate uses these instead of the auto-derived
  // values from the receipt-history average. `null` / `undefined` means
  // "use auto". The dashboard renders the inputs prominently per the
  // 2026-05-11 meeting: Carla and Jorge expected an obvious field for
  // these and couldn't find it in the existing UI.
  manualLaborRate?: number | null;
  manualMarginPercent?: number | null;
}

export const EXTRA_MATERIALS: ImportedMaterial[] = [];

const DEFAULT_LABOR_RATES: LaborRate[] = [
  { trade: "General Labor", tradeEs: "Mano de Obra General", unit: "hour", hourlyRate: 22, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
  { trade: "Carpenter", tradeEs: "Carpintero", unit: "hour", hourlyRate: 38, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
  { trade: "Electrician", tradeEs: "Electricista", unit: "hour", hourlyRate: 55, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
  { trade: "Plumber", tradeEs: "Plomero", unit: "hour", hourlyRate: 52, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
  { trade: "Mason", tradeEs: "Albañil", unit: "hour", hourlyRate: 34, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
  { trade: "Welder", tradeEs: "Soldador", unit: "hour", hourlyRate: 48, source: "seed", updatedAt: "2026-01-01T00:00:00Z" },
];

export const LABOR_RATES: LaborRate[] = [];

export const PROJECT_RECEIPTS: Record<string, Receipt[]> = {};
export const PROJECT_REPORT_TEMPLATE: Record<string, ReportTemplate> = {};
export const PROJECT_CONTRACTOR_ESTIMATE: Record<string, ContractorEstimate> = {};

// ---------------------------------------------------------------------------
// Persistence — receipts, contractor estimates, report templates, imported
// materials, and labor-rate overrides survive an API server restart.
// ---------------------------------------------------------------------------

interface PersistedSnapshot {
  extraMaterials: ImportedMaterial[];
  laborRates: LaborRate[];
  receipts: Record<string, Receipt[]>;
  reportTemplates: Record<string, ReportTemplate>;
  contractorEstimates: Record<string, ContractorEstimate>;
}

function snapshotEstimatingState(): PersistedSnapshot {
  return {
    extraMaterials: EXTRA_MATERIALS,
    laborRates: LABOR_RATES,
    receipts: PROJECT_RECEIPTS,
    reportTemplates: PROJECT_REPORT_TEMPLATE,
    contractorEstimates: PROJECT_CONTRACTOR_ESTIMATE,
  };
}

export function applyEstimatingSnapshot(snap: PersistedSnapshot | null): void {
  EXTRA_MATERIALS.length = 0;
  LABOR_RATES.length = 0;
  for (const k of Object.keys(PROJECT_RECEIPTS)) delete PROJECT_RECEIPTS[k];
  for (const k of Object.keys(PROJECT_REPORT_TEMPLATE)) delete PROJECT_REPORT_TEMPLATE[k];
  for (const k of Object.keys(PROJECT_CONTRACTOR_ESTIMATE)) delete PROJECT_CONTRACTOR_ESTIMATE[k];

  if (snap && Array.isArray(snap.laborRates) && snap.laborRates.length > 0) {
    LABOR_RATES.push(...snap.laborRates);
  } else {
    LABOR_RATES.push(...DEFAULT_LABOR_RATES);
  }
  if (snap) {
    if (Array.isArray(snap.extraMaterials)) EXTRA_MATERIALS.push(...snap.extraMaterials);
    if (snap.receipts && typeof snap.receipts === "object") Object.assign(PROJECT_RECEIPTS, snap.receipts);
    if (snap.reportTemplates && typeof snap.reportTemplates === "object") Object.assign(PROJECT_REPORT_TEMPLATE, snap.reportTemplates);
    if (snap.contractorEstimates && typeof snap.contractorEstimates === "object") Object.assign(PROJECT_CONTRACTOR_ESTIMATE, snap.contractorEstimates);
  }
}

// Persistence is request-coupled (callers `await persistEstimatingState()`
// before responding) and serialized through `_pendingPersistence` so a
// burst of POSTs (e.g. CSV import then estimate then template) cannot
// race each other and overwrite the wrong snapshot. Tests can also wait
// on `flushEstimatingPersistence()` to see writes settle before asserting.
let _pendingPersistence: Promise<unknown> = Promise.resolve();

export function persistEstimatingState(): Promise<void> {
  // Snapshot AND deep-clone the in-memory state synchronously at enqueue
  // time. The shallow snapshot returned by `snapshotEstimatingState()`
  // shares array/object references with the live `EXTRA_MATERIALS` etc.
  // structures, so without the clone a write that sat in the queue while
  // a second mutation came in would persist the LATER state, not the
  // state at this caller's request boundary. `structuredClone` is in the
  // Node global since 17 (we run >=20) and handles the plain
  // arrays/objects this snapshot contains.
  const frozen = structuredClone(snapshotEstimatingState());
  const next = _pendingPersistence
    .catch(() => undefined) // never let an old failure block new writes
    .then(() => saveEstimatingSnapshotToDb(frozen));
  // Keep the chained promise on the queue (with errors swallowed) so a
  // follow-up call serialises behind this one, but return a separate
  // promise that propagates the error to the awaiting route handler so
  // it can 500 instead of silently 200-ing on a failed commit.
  _pendingPersistence = next.catch(() => undefined);
  return next.then(() => undefined);
}

export function flushEstimatingPersistence(): Promise<void> {
  return _pendingPersistence.then(
    () => undefined,
    () => undefined,
  );
}

// Hydration runs once at boot (see `ensureEstimatingHydrated()` invoked from
// `index.ts` before `app.listen`) and migrates the legacy JSON file in the
// same step. We export a promise getter so tests + the boot path share the
// same memoised hydration.
let _hydrationPromise: Promise<void> | null = null;

export function ensureEstimatingHydrated(): Promise<void> {
  if (_hydrationPromise) return _hydrationPromise;
  _hydrationPromise = (async () => {
    try {
      const result = await migrateEstimatingJsonIfNeeded();
      if (result.status === "migrated") {
        logger.info(
          { jsonPath: result.jsonPath, backupPath: result.backupPath },
          "estimating: legacy JSON imported into Postgres",
        );
      }
    } catch (err) {
      // Migration-failure policy (mirrors the hydration policy in
      // `index.ts`):
      //   - production:  rethrow → bootstrap calls `process.exit(1)` so
      //     the platform restarts us instead of silently serving from
      //     a possibly-stale DB while the legacy `.data/estimating.json`
      //     sits unmigrated. This avoids the operator-invisible
      //     "we shipped, but skipped your legacy data" scenario.
      //   - dev / test:  log loudly and continue, so a malformed local
      //     JSON file doesn't block iteration when the operator can
      //     just delete or repair the file and restart.
      // Include err.message + code in the message string so Railway's
      // log viewer surfaces them even when it crops structured objects.
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string })?.code ?? "no_code";
      logger.error({ err }, `estimating: legacy JSON migration failed — ${errCode}: ${errMsg}`);
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
    }
    const snap = await loadEstimatingSnapshotFromDb();
    applyEstimatingSnapshot(snap);
  })();
  _hydrationPromise.catch((err) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as { code?: string })?.code ?? "no_code";
    logger.error({ err }, `estimating: initial hydration failed — ${errCode}: ${errMsg}`);
  });
  return _hydrationPromise;
}

// Reset the hydration memo — used by tests that swap the underlying DB state
// and need a fresh load.
export function __resetEstimatingHydrationForTest(): void {
  _hydrationPromise = null;
}

// Apply default labor rates immediately on module import so anything that
// reads LABOR_RATES before `ensureEstimatingHydrated()` resolves (notably
// the test suite, which never calls the bootstrap path) sees the seed
// values — same observable behaviour as the previous JSON-backed implementation
// where a missing/empty file fell through to DEFAULT_LABOR_RATES on import.
// Postgres-backed values from `ensureEstimatingHydrated()` later overwrite
// these defaults atomically before traffic is served (see `index.ts`).
applyEstimatingSnapshot(null);

// ---------------------------------------------------------------------------
// CSV helper — strict, header-row required, comma-delimited, quoted strings OK.
// ---------------------------------------------------------------------------

function parseCsv(input: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const lines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return rows;
  const headers = splitCsvRow(lines[0] as string).map((h) => h.toLowerCase());
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i] as string);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j] as string] = (cells[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// When the importer ships an explicit { canonicalKey: sourceHeader } mapping
// (Task #112), rewrite each parsed row so the canonical keys are populated
// from the user-selected source columns. This lets the existing synonym
// fallback code in each endpoint keep working unchanged for un-mapped fields.
type ColumnMapping = Record<string, string | null | undefined>;

function applyMappingToRows(
  rows: Array<Record<string, string>>,
  mapping: ColumnMapping | undefined,
): Array<Record<string, string>> {
  if (!mapping || Object.keys(mapping).length === 0) return rows;
  return rows.map((row) => {
    const next: Record<string, string> = { ...row };
    for (const [canonical, source] of Object.entries(mapping)) {
      if (!source) continue;
      const sourceLower = source.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(row, sourceLower)) {
        next[canonical.toLowerCase()] = row[sourceLower] ?? "";
      }
    }
    return next;
  });
}

function readMapping(body: Record<string, unknown>): ColumnMapping | undefined {
  const m = body["mapping"];
  if (!m || typeof m !== "object" || Array.isArray(m)) return undefined;
  const out: ColumnMapping = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// GET combined materials list (seed + imported), used by frontend instead of /materials when imports are wanted.
router.get("/estimating/materials", requireRole(["team","admin","superadmin","architect","client"]), (_req, res) => {
  res.json([...MATERIALS, ...EXTRA_MATERIALS]);
});

// POST import materials from CSV body or JSON array. Role: team.
// When `projectId` is provided, also append imported materials as calculator
// lines for that project (default qty = 1) so the team doesn't have to add
// them again under Estimate → Add Material (CSV item #57).
router.post("/estimating/materials/import", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  let rows: Array<Record<string, string>> = [];
  if (typeof body["csv"] === "string") {
    rows = parseCsv(body["csv"] as string);
  } else if (Array.isArray(body["materials"])) {
    rows = (body["materials"] as Array<Record<string, unknown>>).map((m) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(m)) o[k.toLowerCase()] = String(m[k] ?? "");
      return o;
    });
  } else {
    res.status(400).json({ error: "invalid_payload", message: "Provide csv (string) or materials (array)." });
    return;
  }

  rows = applyMappingToRows(rows, readMapping(body));

  if (rows.length === 0) {
    res.status(400).json({ error: "empty_import", message: "No rows parsed.", messageEs: "No se procesaron filas." });
    return;
  }

  const targetProjectId = typeof body["projectId"] === "string" ? (body["projectId"] as string) : undefined;
  const targetProject = targetProjectId ? PROJECTS.find((p) => p.id === targetProjectId) : undefined;
  if (targetProjectId && !targetProject) {
    res.status(400).json({ error: "invalid_project", message: `Project ${targetProjectId} not found.` });
    return;
  }

  const accepted: ImportedMaterial[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, string>;
    const item = (r["item"] ?? r["material"] ?? r["name"] ?? r["description"] ?? r["descripcion"] ?? r["descripción"] ?? "").trim();
    const itemEs = (r["item_es"] ?? r["itemes"] ?? r["nombre"] ?? r["descripcion"] ?? r["descripción"] ?? item).trim();
    const category = (r["category"] ?? r["categoria"] ?? r["categoría"] ?? "").trim().toLowerCase();
    const unit = (r["unit"] ?? r["unidad"] ?? "").trim();
    const qtyRaw = (r["qty"] ?? r["quantity"] ?? r["cantidad"] ?? "1").replace(/[^0-9.]/g, "");
    const priceRaw = (r["base_price"] ?? r["baseprice"] ?? r["unit_price"] ?? r["unitprice"] ?? r["price"] ?? r["precio"] ?? r["preciounitario"] ?? r["precio_unitario"] ?? "").replace(/[^0-9.]/g, "");
    const basePrice = Number(priceRaw);
    const qty = Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;
    if (!item || !category || !unit || !isFinite(basePrice) || basePrice <= 0) {
      skipped.push({ row: i + 2, reason: "missing item/category/unit/price" });
      continue;
    }
    const id = nextId("mat-imp");
    accepted.push({ id, item, itemEs, category, unit, basePrice });

    if (targetProject) {
      const calcMap = CALCULATOR_ENTRIES as Record<string, Array<Record<string, unknown>>>;
      const list = calcMap[targetProject.id] ?? (calcMap[targetProject.id] = []);
      list.push({
        id: nextId("calc-imp"),
        projectId: targetProject.id,
        materialId: id,
        materialName: item,
        materialNameEs: itemEs,
        category,
        unit,
        quantity: qty,
        basePrice,
        manualPriceOverride: null,
        effectivePrice: basePrice,
        lineTotal: basePrice * qty,
      });
    }
  }
  EXTRA_MATERIALS.push(...accepted);

  if (targetProject && accepted.length > 0) {
    await appendActivityAndPersist(targetProject.id, {
      type: "calculator_import",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Auto-added ${accepted.length} imported material(s) to the project calculator.`,
      descriptionEs: `Se agregaron automáticamente ${accepted.length} material(es) importado(s) a la calculadora.`,
    });
  }

  // Couple the response to the DB commit (durability fix): if either
  // write rejects, surface a 500 instead of silently 200-ing while the
  // queued promise rejects in the background. The materials snapshot
  // and the calculator entries live in different tables (catalog vs
  // per-project queue), so both writes must complete before we ack.
  try {
    await persistEstimatingState();
    if (targetProject && accepted.length > 0) {
      await persistCalculatorEntriesForProject(targetProject.id);
    }
  } catch (err) {
    logger.error({ err }, "estimating: materials/import persist failed");
    res.status(500).json({ error: "persist_failed", message: "Materials were parsed but failed to save. Please retry." });
    return;
  }

  res.json({
    imported: accepted.length,
    skipped: skipped.length,
    skippedDetails: skipped,
    materials: accepted,
    totalCatalogSize: MATERIALS.length + EXTRA_MATERIALS.length,
    // Numeric count of lines auto-added to the target project's calculator
    // (0 when no projectId was supplied). Frontend uses this to render the
    // "N added to project calculator" toast detail.
    addedToProjectCalculator: targetProject ? accepted.length : 0,
    addedToProjectCalculatorId: targetProject ? targetProject.id : null,
  });
});

// GET labor rates
router.get("/estimating/labor-rates", requireRole(["team","admin","superadmin","architect","client"]), (_req, res) => {
  res.json({ rates: LABOR_RATES });
});

// POST import labor rates (replaces overrides for matching trade names; appends new).
router.post("/estimating/labor-rates/import", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  let rows: Array<Record<string, string>> = [];
  if (typeof body["csv"] === "string") {
    rows = parseCsv(body["csv"] as string);
  } else if (Array.isArray(body["rates"])) {
    rows = (body["rates"] as Array<Record<string, unknown>>).map((m) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(m)) o[k.toLowerCase()] = String(m[k] ?? "");
      return o;
    });
  } else {
    res.status(400).json({ error: "invalid_payload", message: "Provide csv or rates." });
    return;
  }

  rows = applyMappingToRows(rows, readMapping(body));

  const updated: LaborRate[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, string>;
    const trade = (r["trade"] ?? r["oficio"] ?? "").trim();
    const tradeEs = (r["trade_es"] ?? r["tradees"] ?? r["oficio_es"] ?? trade).trim();
    const unit = (r["unit"] ?? r["unidad"] ?? "hour").trim() || "hour";
    const rateRaw = (r["hourly_rate"] ?? r["hourlyrate"] ?? r["rate"] ?? r["tarifa"] ?? "").replace(/[^0-9.]/g, "");
    const hourlyRate = Number(rateRaw);
    if (!trade || !isFinite(hourlyRate) || hourlyRate <= 0) {
      skipped.push({ row: i + 2, reason: "missing trade or rate" });
      continue;
    }
    const existingIdx = LABOR_RATES.findIndex((lr) => lr.trade.toLowerCase() === trade.toLowerCase());
    const next: LaborRate = { trade, tradeEs, unit, hourlyRate, source: "import", updatedAt: new Date().toISOString() };
    if (existingIdx >= 0) LABOR_RATES[existingIdx] = next;
    else LABOR_RATES.push(next);
    updated.push(next);
  }
  try {
    await persistEstimatingState();
  } catch (err) {
    logger.error({ err }, "estimating: labor-rates/import persist failed");
    res.status(500).json({ error: "persist_failed", message: "Labor rates were parsed but failed to save. Please retry." });
    return;
  }
  res.json({ imported: updated.length, skipped: skipped.length, skippedDetails: skipped, rates: LABOR_RATES });
});

// Internal helper: persist receipts (last 3 by date), recompute labor baseline,
// log activity, and return the response payload. Used by both the CSV/JSON
// endpoint and the OCR file-upload endpoint.
async function applyReceipts(projectId: string, parsed: Receipt[], actor: string, source: "csv" | "ocr") {
  // Keep most recent 3 (by date string desc).
  const sorted = [...parsed].sort((a, b) => (a.date < b.date ? 1 : -1));
  const lastThree = sorted.slice(0, 3);
  PROJECT_RECEIPTS[projectId] = lastThree;

  // Update labor rates: average effective hourly rate across receipts per trade.
  const byTrade: Record<string, { totalAmount: number; totalHours: number }> = {};
  for (const r of lastThree) {
    const key = r.trade;
    if (!byTrade[key]) byTrade[key] = { totalAmount: 0, totalHours: 0 };
    (byTrade[key] as { totalAmount: number; totalHours: number }).totalAmount += r.amount;
    (byTrade[key] as { totalAmount: number; totalHours: number }).totalHours += r.hours;
  }
  const updatedTrades: string[] = [];
  for (const trade of Object.keys(byTrade)) {
    const v = byTrade[trade] as { totalAmount: number; totalHours: number };
    if (v.totalHours <= 0) continue;
    const newRate = Math.round((v.totalAmount / v.totalHours) * 100) / 100;
    const idx = LABOR_RATES.findIndex((lr) => lr.trade.toLowerCase() === trade.toLowerCase());
    const next: LaborRate = {
      trade,
      tradeEs: idx >= 0 ? (LABOR_RATES[idx] as LaborRate).tradeEs : trade,
      unit: "hour",
      hourlyRate: newRate,
      source: "receipts",
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) LABOR_RATES[idx] = next;
    else LABOR_RATES.push(next);
    updatedTrades.push(trade);
  }

  const sourceLabel = source === "ocr" ? "via OCR upload" : "from CSV import";
  const sourceLabelEs = source === "ocr" ? "vía subida con OCR" : "desde importación CSV";
  await appendActivityAndPersist(projectId, {
    type: "receipts_upload",
    actor,
    description: `Last ${lastThree.length} receipts uploaded ${sourceLabel}; labor baseline refreshed for ${updatedTrades.length} trade(s).`,
    descriptionEs: `Se subieron los últimos ${lastThree.length} recibos ${sourceLabelEs}; tarifas de mano de obra actualizadas para ${updatedTrades.length} oficio(s).`,
  });

  // Couple the response to the DB commit so a 200 OK to the caller
  // means the receipts + recomputed labor rates are durably stored.
  await persistEstimatingState();

  return { projectId, receipts: lastThree, updatedTrades, rates: LABOR_RATES };
}

// POST receipts for a project — recomputes labor baseline from last 3 receipts.
router.post("/projects/:id/receipts", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  let rows: Array<Record<string, string>> = [];
  if (typeof body["csv"] === "string") {
    rows = parseCsv(body["csv"] as string);
  } else if (Array.isArray(body["receipts"])) {
    rows = (body["receipts"] as Array<Record<string, unknown>>).map((m) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(m)) o[k.toLowerCase()] = String(m[k] ?? "");
      return o;
    });
  } else {
    res.status(400).json({ error: "invalid_payload", message: "Provide csv or receipts." });
    return;
  }

  rows = applyMappingToRows(rows, readMapping(body));

  const parsed: Receipt[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, string>;
    const vendor = (r["vendor"] ?? r["proveedor"] ?? "").trim();
    const date = (r["date"] ?? r["fecha"] ?? "").trim();
    const trade = (r["trade"] ?? r["oficio"] ?? "").trim();
    const amount = Number((r["amount"] ?? r["monto"] ?? "").replace(/[^0-9.]/g, ""));
    const hours = Number((r["hours"] ?? r["horas"] ?? "0").replace(/[^0-9.]/g, ""));
    if (!vendor || !trade || !isFinite(amount) || amount <= 0 || !isFinite(hours) || hours <= 0) {
      skipped.push({ row: i + 2, reason: "missing vendor/trade or non-positive amount/hours" });
      continue;
    }
    parsed.push({ id: nextId("rec"), vendor, date: date || new Date().toISOString().slice(0, 10), trade, amount, hours });
  }
  if (parsed.length === 0) {
    res.status(400).json({
      error: "no_valid_receipts",
      message: "No valid receipts parsed (need vendor, trade, amount > 0, hours > 0).",
      messageEs: "No se procesaron recibos válidos.",
      skipped: skipped.length,
      skippedDetails: skipped,
    });
    return;
  }

  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  let result;
  try {
    result = await applyReceipts(project.id, parsed, actor, "csv");
  } catch (err) {
    logger.error({ err }, "estimating: receipts persist failed (csv)");
    res.status(500).json({ error: "persist_failed", message: "Receipts were parsed but failed to save. Please retry." });
    return;
  }
  res.json({ ...result, imported: parsed.length, skipped: skipped.length, skippedDetails: skipped });
});

// POST a single receipt PDF or image to OCR. Extracts vendor/date/amount/hours
// via PDF.co, merges with any user-supplied overrides, then persists the same
// way the CSV path does.
router.post(
  "/projects/:id/receipts/upload-file",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const project = PROJECTS.find((p) => p.id === req.params["id"]);
    if (!project) { res.status(404).json({ error: "not_found" }); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const fileBase64Raw = typeof body["fileBase64"] === "string" ? (body["fileBase64"] as string) : "";
    const filename = typeof body["filename"] === "string" && body["filename"]
      ? (body["filename"] as string)
      : "receipt.pdf";
    // Strip any data: URL prefix the client may have included.
    const fileBase64 = fileBase64Raw.replace(/^data:[^;]+;base64,/, "");
    if (!fileBase64) {
      res.status(400).json({ error: "missing_file", message: "Provide fileBase64 (base64 of a PDF or image)." });
      return;
    }
    const tradeOverride = typeof body["trade"] === "string" ? (body["trade"] as string).trim() : "";
    if (!tradeOverride) {
      res.status(400).json({ error: "missing_trade", message: "Pick the trade this receipt belongs to.", messageEs: "Selecciona el oficio al que corresponde el recibo." });
      return;
    }
    const vendorOverride = typeof body["vendor"] === "string" ? (body["vendor"] as string).trim() : "";
    const dateOverride = typeof body["date"] === "string" ? (body["date"] as string).trim() : "";
    const amountOverride = body["amount"] !== undefined && body["amount"] !== null && body["amount"] !== ""
      ? Number(body["amount"])
      : undefined;
    const hoursOverride = body["hours"] !== undefined && body["hours"] !== null && body["hours"] !== ""
      ? Number(body["hours"])
      : undefined;

    const apiKey = getManagedSecret("PDF_CO_API_KEY");
    if (!apiKey) {
      res.status(500).json({
        error: "ocr_not_configured",
        message: "PDF_CO_API_KEY is not set on the server. Ask an admin to configure it before uploading receipt images.",
        messageEs: "PDF_CO_API_KEY no está configurado. Pide al administrador configurarlo antes de subir recibos.",
      });
      return;
    }

    let extracted;
    try {
      extracted = await extractAndParseReceipt({ fileBase64, filename }, apiKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR extraction failed.";
      res.status(502).json({ error: "ocr_failed", message, messageEs: "Falló la extracción con OCR." });
      return;
    }

    const vendor = vendorOverride || extracted.vendor || "";
    const date = (dateOverride || extracted.date || new Date().toISOString().slice(0, 10)).trim();
    const amount = amountOverride !== undefined && isFinite(amountOverride) && amountOverride > 0
      ? amountOverride
      : (extracted.amount ?? NaN);
    const hours = hoursOverride !== undefined && isFinite(hoursOverride) && hoursOverride > 0
      ? hoursOverride
      : (extracted.hours ?? NaN);

    const missing: string[] = [];
    if (!vendor) missing.push("vendor");
    if (!isFinite(amount) || amount <= 0) missing.push("amount");
    if (!isFinite(hours) || hours <= 0) missing.push("hours");
    if (missing.length > 0) {
      res.status(422).json({
        error: "incomplete_extraction",
        message: `Could not extract ${missing.join(", ")} from the receipt. Re-upload a clearer image or fill the field manually.`,
        messageEs: `No se pudo extraer ${missing.join(", ")} del recibo. Sube una imagen más nítida o ingresa el campo manualmente.`,
        extracted: {
          vendor: extracted.vendor,
          date: extracted.date,
          amount: extracted.amount,
          hours: extracted.hours,
        },
      });
      return;
    }

    // Append to the existing receipts list (keep up to 3 most recent overall),
    // matching the CSV path behavior so a single OCR upload doesn't wipe out
    // previously entered receipts.
    const previous = PROJECT_RECEIPTS[project.id] ?? [];
    const newReceipt: Receipt = {
      id: nextId("rec-ocr"),
      vendor,
      date,
      trade: tradeOverride,
      amount: Math.round(amount * 100) / 100,
      hours: Math.round(hours * 100) / 100,
    };
    const combined = [...previous, newReceipt];

    const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
    let result;
    try {
      result = await applyReceipts(project.id, combined, actor, "ocr");
    } catch (err) {
      logger.error({ err }, "estimating: receipts persist failed (ocr)");
      res.status(500).json({ error: "persist_failed", message: "Receipt was parsed but failed to save. Please retry." });
      return;
    }

    // Drive copy (Task #128 step 6) — best-effort. The OCR pipeline owns
    // the source-of-truth for the parsed receipt rows; the Drive copy is a
    // human-readable archive in the project's `Receipts` folder. We don't
    // want a Drive outage to prevent the receipt from showing up in the
    // estimating recalculation, so failures are logged and surfaced via the
    // sync log only.
    let driveWarning: { en: string; es: string } | undefined;
    if (isDriveEnabled()) {
      try {
        const inferredMime = filename.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "image/jpeg";
        await uploadDocumentToDrive({
          projectId: project.id,
          projectName: project.name,
          documentId: newReceipt.id,
          documentName: filename,
          category: "receipts",
          mimeType: inferredMime,
          data: Buffer.from(fileBase64, "base64"),
          isClientVisible: false,
        });
      } catch {
        driveWarning = {
          en: "Receipt was processed but the Google Drive archive copy failed. Check the Drive sync log.",
          es: "El recibo se procesó pero la copia de archivo en Google Drive falló. Revisa el registro de sincronización de Drive.",
        };
      }
    }

    res.json({
      ...result,
      ocrExtracted: {
        vendor: extracted.vendor,
        date: extracted.date,
        amount: extracted.amount,
        hours: extracted.hours,
      },
      newReceipt,
      ...(driveWarning ? { driveWarning } : {}),
    });
  },
);

// GET receipts
router.get("/projects/:id/receipts", requireRole(["team","admin","superadmin","architect","client"]), (req, res) => {
  const id = req.params["id"] as string;
  if (!enforceClientOwnership(req, res, id)) return;
  res.json({ projectId: id, receipts: PROJECT_RECEIPTS[id] ?? [] });
});

// P5.2 — Multi-item receipt scan + confirm.
//
// Flow:
//   1. Client POSTs a base64-encoded receipt to `/scan-receipt`. Server runs
//      PDF.co OCR + Claude line extraction, returns the proposed line items
//      WITHOUT committing them. Client renders a confirmation table where
//      the team can correct each row's category / chargeable flag.
//   2. Client POSTs the corrected rows to `/receipts/:receiptId/line-items`
//      which persists them and refreshes the variance aggregation.
router.post(
  "/projects/:id/scan-receipt",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["id"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({
        code: "project_not_found",
        message: "Project not found",
        messageEs: "Proyecto no encontrado",
      });
      return;
    }
    const body = (req.body ?? {}) as { fileBase64?: string; filename?: string };
    if (typeof body.fileBase64 !== "string" || !body.fileBase64 || typeof body.filename !== "string" || !body.filename) {
      res.status(400).json({
        code: "bad_request",
        message: "fileBase64 and filename are required",
        messageEs: "fileBase64 y filename son requeridos",
      });
      return;
    }
    const apiKey = getManagedSecret("PDF_CO_API_KEY");
    if (!apiKey) {
      res.status(501).json({
        code: "ocr_not_configured",
        message: "Receipt OCR is not configured.",
        messageEs: "El OCR de recibos no está configurado.",
      });
      return;
    }
    try {
      // Strip a data:URL prefix if the client included it.
      const rawBase64 = body.fileBase64.replace(/^data:[^;]+;base64,/, "");
      const ocr = await extractAndParseReceipt(
        { fileBase64: rawBase64, filename: body.filename },
        apiKey,
      );
      // P5.1 — run line-item extractor against the OCR text. Never throws;
      // returns [] on AI failure. Empty result falls back to the legacy
      // single-row receipt path in the UI.
      const { extractReceiptLineItems } = await import("../lib/receipt-ocr");
      const items = await extractReceiptLineItems(ocr.text);
      res.json({
        projectId,
        ocr: {
          vendor: ocr.vendor,
          date: ocr.date,
          amount: ocr.amount,
          hours: ocr.hours,
          text: ocr.text,
        },
        // Proposed line items the team confirms (or edits) before commit.
        proposedLineItems: items.map((i) => ({
          ...i,
          chargeable: true,
        })),
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), projectId }, "scan-receipt failed");
      res.status(502).json({
        code: "ocr_failed",
        message: "Could not extract text from this receipt. Try a clearer image.",
        messageEs: "No se pudo extraer texto del recibo. Intenta una imagen más clara.",
      });
    }
  },
);

// P5.2 + P5.4 — commit the team-corrected line items to a receipt.
// Creates the parent receipt row (or reuses if `receiptId` is supplied)
// and inserts each line. Variance aggregation reads from line items so
// the report refreshes within 2s of commit.
router.post(
  "/projects/:id/receipts/commit-line-items",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["id"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({
        code: "project_not_found",
        message: "Project not found",
        messageEs: "Proyecto no encontrado",
      });
      return;
    }
    const body = (req.body ?? {}) as {
      vendor?: string;
      date?: string;
      receiptChargeable?: boolean;
      items?: Array<{
        description?: string;
        category?: string;
        quantity?: number;
        unit?: string;
        unitPrice?: number;
        chargeable?: boolean;
      }>;
    };
    const vendor = (body.vendor ?? "").trim() || "Manual entry";
    const date = (body.date ?? "").trim() || new Date().toISOString().slice(0, 10);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({
        code: "no_items",
        message: "At least one line item is required.",
        messageEs: "Se requiere al menos un ítem.",
      });
      return;
    }

    // Create parent receipt aggregating the line totals so the variance
    // report can keep using the existing `amount` summary.
    const receiptId = nextId("rec");
    const lineItems: ReceiptLineItem[] = body.items
      .filter((row) => row && typeof row === "object")
      .map((row, idx) => {
        const description = String(row.description ?? "").trim().slice(0, 300);
        const category = String(row.category ?? "other").trim().toLowerCase().slice(0, 60) || "other";
        const qty = Number(row.quantity ?? 1);
        const unitPrice = Number(row.unitPrice ?? 0);
        const unit = String(row.unit ?? "ea").trim().slice(0, 20) || "ea";
        const chargeable = row.chargeable !== false;
        const safeQty = isFinite(qty) && qty > 0 ? qty : 1;
        const safePrice = isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
        return {
          id: `${receiptId}-l-${idx + 1}`,
          receiptId,
          projectId,
          description: description || `Line ${idx + 1}`,
          category,
          quantity: Math.round(safeQty * 100) / 100,
          unit,
          unitPrice: Math.round(safePrice * 100) / 100,
          lineTotal: Math.round(safeQty * safePrice * 100) / 100,
          chargeable,
          createdAt: new Date().toISOString(),
        };
      });
    if (lineItems.length === 0) {
      res.status(400).json({
        code: "no_valid_items",
        message: "No valid line items in payload.",
        messageEs: "Ningún ítem válido en el payload.",
      });
      return;
    }
    const totalAmount = lineItems.reduce((a, l) => a + l.lineTotal, 0);
    const parent: Receipt = {
      id: receiptId,
      vendor,
      date,
      trade: lineItems[0]!.category, // best-effort tag for the legacy view
      amount: Math.round(totalAmount * 100) / 100,
      hours: 0,
      chargeable: body.receiptChargeable !== false,
    };

    const list = PROJECT_RECEIPTS[projectId] ?? (PROJECT_RECEIPTS[projectId] = []);
    list.push(parent);
    const lineList = PROJECT_RECEIPT_LINE_ITEMS[projectId] ?? (PROJECT_RECEIPT_LINE_ITEMS[projectId] = []);
    lineList.push(...lineItems);

    try {
      await persistEstimatingState();
    } catch (err) {
      logger.error({ err, projectId, receiptId }, "commit-line-items persist failed");
      res.status(500).json({
        code: "persist_failed",
        message: "Line items committed in memory but persistence failed. Please retry.",
        messageEs: "Ítems se aplicaron pero no se guardaron. Reintente.",
      });
      return;
    }

    res.status(201).json({
      projectId,
      receipt: parent,
      lineItems,
      summary: {
        total: parent.amount,
        chargeable: lineItems.filter((l) => l.chargeable).reduce((a, l) => a + l.lineTotal, 0),
        nonChargeable: lineItems.filter((l) => !l.chargeable).reduce((a, l) => a + l.lineTotal, 0),
      },
    });
  },
);

// P5.2 — list line items for a project (for the variance roll-up and the
// "non-billable" tab on the cost-plus panel).
router.get(
  "/projects/:id/receipt-line-items",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  (req, res) => {
    const id = req.params["id"] as string;
    if (!enforceClientOwnership(req, res, id)) return;
    const role = (req as { user?: { role?: string } }).user?.role;
    let list = PROJECT_RECEIPT_LINE_ITEMS[id] ?? [];
    // Clients never see non-chargeable lines (those are internal-only).
    if (role === "client") list = list.filter((l) => l.chargeable);
    res.json({ projectId: id, lineItems: list });
  },
);

// P5.4 — toggle the chargeable flag on a single line item.
router.patch(
  "/projects/:id/receipt-line-items/:lineId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["id"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const list = PROJECT_RECEIPT_LINE_ITEMS[projectId] ?? [];
    const line = list.find((l) => l.id === req.params["lineId"]);
    if (!line) {
      res.status(404).json({ code: "not_found", message: "Line item not found", messageEs: "Ítem no encontrado" });
      return;
    }
    const body = (req.body ?? {}) as { chargeable?: boolean; category?: string };
    if (typeof body.chargeable === "boolean") line.chargeable = body.chargeable;
    if (typeof body.category === "string" && body.category.trim().length > 0) {
      line.category = body.category.trim().toLowerCase().slice(0, 60);
    }
    try { await persistEstimatingState(); }
    catch {
      res.status(500).json({ code: "persist_failed", message: "Toggle saved in memory but failed to persist.", messageEs: "Cambio no se pudo guardar." });
      return;
    }
    res.json(line);
  },
);

// POST report template
router.post("/projects/:id/report-template", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body["name"] === "string" && body["name"] ? body["name"] : "Custom Template";
  const columns = Array.isArray(body["columns"]) ? (body["columns"] as unknown[]).map(String) : ["Category", "Item", "Qty", "Unit", "Unit Price", "Total"];
  const headerLines = Array.isArray(body["headerLines"]) ? (body["headerLines"] as unknown[]).map(String) : [`KONTi Design | Build Studio`, project.name, project.location];
  const footer = typeof body["footer"] === "string" ? body["footer"] : "Generated by KONTi Dashboard";
  const tpl: ReportTemplate = {
    name,
    columns,
    headerLines,
    footer,
    uploadedAt: new Date().toISOString(),
    uploadedBy: (req as { user?: { name?: string } }).user?.name ?? "Team",
  };
  PROJECT_REPORT_TEMPLATE[project.id] = tpl;
  await appendActivityAndPersist(project.id, {
    type: "report_template_upload",
    actor: tpl.uploadedBy,
    description: `Report template "${name}" uploaded for export reuse.`,
    descriptionEs: `Plantilla de reporte "${name}" subida para reutilización en exportaciones.`,
  });
  try {
    await persistEstimatingState();
  } catch (err) {
    logger.error({ err }, "estimating: report-template persist failed");
    res.status(500).json({ error: "persist_failed", message: "Template was uploaded but failed to save. Please retry." });
    return;
  }
  res.json({ projectId: project.id, template: tpl });
});

router.get("/projects/:id/report-template", requireRole(["team","admin","superadmin","architect","client"]), (req, res) => {
  const id = req.params["id"] as string;
  if (!enforceClientOwnership(req, res, id)) return;
  const tpl = PROJECT_REPORT_TEMPLATE[id];
  if (!tpl) { res.status(404).json({ error: "not_found", message: "No template saved" }); return; }
  res.json(tpl);
});

// POST contractor estimate (from preliminary doc).
//
// B-05 split: project metadata (squareMeters, projectType, bathrooms, kitchens,
// contingencyPercent) lives on the Project record and is edited from the
// Project Detail page. The Contractor Calculator no longer collects those
// inputs — when they are missing from the request body we read them from the
// project so the estimate math stays unchanged.
router.post("/projects/:id/contractor-estimate", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]) as
    | (typeof PROJECTS[number] & {
        squareMeters?: number;
        bathrooms?: number;
        kitchens?: number;
        projectType?: string;
        contingencyPercent?: number;
      })
    | undefined;
  if (!project) { res.status(404).json({ error: "not_found" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const pickNumber = (key: string, fallback: number): number => {
    if (body[key] === undefined) return fallback;
    const n = Number(body[key]);
    return isFinite(n) ? n : fallback;
  };

  const squareMeters = pickNumber("squareMeters", project.squareMeters ?? 0);
  const projectType = typeof body["projectType"] === "string"
    ? body["projectType"]
    : (project.projectType ?? "residencial");
  const scope = Array.isArray(body["scope"]) ? (body["scope"] as unknown[]).map(String) : [];
  const source = typeof body["source"] === "string" ? body["source"] : "Preliminary project doc (manual entry)";
  const contingencyPercent = pickNumber("contingencyPercent", project.contingencyPercent ?? 8);
  const bathrooms = Math.max(0, Math.floor(pickNumber("bathrooms", project.bathrooms ?? 0)) || 0);
  const kitchens = Math.max(0, Math.floor(pickNumber("kitchens", project.kitchens ?? 0)) || 0);
  const marginPercent = Math.max(0, Number(body["marginPercent"] ?? 0) || 0);
  const managementFeePercent = Math.max(0, Number(body["managementFeePercent"] ?? 0) || 0);

  if (!isFinite(squareMeters) || squareMeters <= 0) {
    res.status(400).json({ error: "invalid_square_meters", message: "squareMeters must be > 0" });
    return;
  }

  const allMaterials = [...MATERIALS, ...EXTRA_MATERIALS];
  const lines: ContractorEstimateLine[] = [];

  // Heuristic line item synthesis driven by scope keywords + sq meters.
  function pickByCategory(cat: string): { id: string; item: string; itemEs?: string; unit: string; basePrice: number } | undefined {
    return allMaterials.find((m) => m.category === cat);
  }

  const concrete = pickByCategory("foundation");
  if (concrete) {
    const qty = Math.max(1, Math.ceil(squareMeters * 0.12));
    lines.push({
      id: `est-line-${lines.length + 1}`,
      category: "foundation",
      description: concrete.item,
      descriptionEs: ("itemEs" in concrete ? (concrete as { itemEs?: string }).itemEs : undefined) ?? concrete.item,
      quantity: qty, unit: concrete.unit, unitPrice: concrete.basePrice,
      lineTotal: qty * concrete.basePrice,
    });
  }
  const steel = pickByCategory("steel");
  if (steel) {
    const qty = Math.max(1, Math.ceil(squareMeters / 60));
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "steel", description: steel.item, descriptionEs: ("itemEs" in steel ? (steel as { itemEs?: string }).itemEs : undefined) ?? steel.item,
      quantity: qty, unit: steel.unit, unitPrice: steel.basePrice, lineTotal: qty * steel.basePrice,
    });
  }
  const elec = pickByCategory("electrical");
  if (elec) {
    const qty = Math.max(2, Math.ceil(squareMeters / 25));
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "electrical", description: elec.item, descriptionEs: ("itemEs" in elec ? (elec as { itemEs?: string }).itemEs : undefined) ?? elec.item,
      quantity: qty, unit: elec.unit, unitPrice: elec.basePrice, lineTotal: qty * elec.basePrice,
    });
  }
  const plumb = pickByCategory("plumbing");
  if (plumb) {
    const qty = Math.max(1, Math.ceil(squareMeters / 40));
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "plumbing", description: plumb.item, descriptionEs: ("itemEs" in plumb ? (plumb as { itemEs?: string }).itemEs : undefined) ?? plumb.item,
      quantity: qty, unit: plumb.unit, unitPrice: plumb.basePrice, lineTotal: qty * plumb.basePrice,
    });
  }
  const finish = pickByCategory("finishes");
  if (finish) {
    const qty = Math.max(2, Math.ceil(squareMeters / 18));
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "finishes", description: finish.item, descriptionEs: ("itemEs" in finish ? (finish as { itemEs?: string }).itemEs : undefined) ?? finish.item,
      quantity: qty, unit: finish.unit, unitPrice: finish.basePrice, lineTotal: qty * finish.basePrice,
    });
  }

  // Scope-driven extras
  for (const s of scope) {
    const lower = s.toLowerCase();
    if (/(pool|piscina)/.test(lower)) {
      lines.push({
        id: `est-line-${lines.length + 1}`, category: "subcontractor",
        description: "Subcontractor — Pool excavation & shell",
        descriptionEs: "Subcontratista — Excavación y carcasa de piscina",
        quantity: 1, unit: "lump", unitPrice: 28000, lineTotal: 28000,
      });
    }
    if (/(solar|photovoltaic|fotovolt)/.test(lower)) {
      lines.push({
        id: `est-line-${lines.length + 1}`, category: "subcontractor",
        description: "Subcontractor — Solar PV system (8 kW)",
        descriptionEs: "Subcontratista — Sistema solar fotovoltaico (8 kW)",
        quantity: 1, unit: "lump", unitPrice: 22000, lineTotal: 22000,
      });
    }
    if (/(roof|techo)/.test(lower)) {
      lines.push({
        id: `est-line-${lines.length + 1}`, category: "subcontractor",
        description: "Subcontractor — Roof membrane & flashing",
        descriptionEs: "Subcontratista — Membrana de techo e impermeabilización",
        quantity: Math.max(1, Math.ceil(squareMeters / 100)), unit: "lot", unitPrice: 4500,
        lineTotal: Math.max(1, Math.ceil(squareMeters / 100)) * 4500,
      });
    }
  }

  // Bathroom + kitchen rough-in extras (subcontractor allowances).
  if (bathrooms > 0) {
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "subcontractor",
      description: `Bathroom rough-in & fixtures (${bathrooms})`,
      descriptionEs: `Baños — instalación y accesorios (${bathrooms})`,
      quantity: bathrooms, unit: "each", unitPrice: 4200, lineTotal: bathrooms * 4200,
    });
  }
  if (kitchens > 0) {
    lines.push({
      id: `est-line-${lines.length + 1}`, category: "subcontractor",
      description: `Kitchen rough-in & cabinetry (${kitchens})`,
      descriptionEs: `Cocinas — instalación y gabinetes (${kitchens})`,
      quantity: kitchens, unit: "each", unitPrice: 9800, lineTotal: kitchens * 9800,
    });
  }

  // Labor lines — drive from current LABOR_RATES.
  const laborHoursBase = squareMeters * (projectType === "comercial" ? 6 : 4.5);
  const splits: Record<string, number> = { "General Labor": 0.45, "Carpenter": 0.20, "Electrician": 0.12, "Plumber": 0.10, "Mason": 0.13 };
  for (const [trade, share] of Object.entries(splits)) {
    const rate = LABOR_RATES.find((r) => r.trade === trade);
    if (!rate) continue;
    const hours = Math.round(laborHoursBase * share);
    lines.push({
      id: `est-line-${lines.length + 1}`,
      category: "labor",
      description: `Labor — ${rate.trade}`,
      descriptionEs: `Mano de obra — ${rate.tradeEs}`,
      quantity: hours, unit: rate.unit, unitPrice: rate.hourlyRate, lineTotal: hours * rate.hourlyRate,
    });
  }

  let subtotalMaterials = 0;
  let subtotalLabor = 0;
  let subtotalSubcontractor = 0;
  for (const l of lines) {
    if (l.category === "labor") subtotalLabor += l.lineTotal;
    else if (l.category === "subcontractor") subtotalSubcontractor += l.lineTotal;
    else subtotalMaterials += l.lineTotal;
  }
  const subtotal = subtotalMaterials + subtotalLabor + subtotalSubcontractor;
  const contingency = Math.round(subtotal * (contingencyPercent / 100));
  const marginAmount = Math.round((subtotal + contingency) * (marginPercent / 100));
  const managementFeeAmount = Math.round((subtotal + contingency + marginAmount) * (managementFeePercent / 100));
  const grandTotal = subtotal + contingency + marginAmount + managementFeeAmount;

  const estimate: ContractorEstimate = {
    projectId: project.id,
    source,
    squareMeters,
    projectType,
    scope,
    bathrooms,
    kitchens,
    lines,
    subtotalMaterials,
    subtotalLabor,
    subtotalSubcontractor,
    contingencyPercent,
    contingency,
    marginPercent,
    marginAmount,
    managementFeePercent,
    managementFeeAmount,
    grandTotal,
    generatedAt: new Date().toISOString(),
    generatedBy: (req as { user?: { name?: string } }).user?.name ?? "Team",
  };
  PROJECT_CONTRACTOR_ESTIMATE[project.id] = estimate;

  await appendActivityAndPersist(project.id, {
    type: "contractor_estimate",
    actor: estimate.generatedBy,
    description: `Contractor estimate generated: $${grandTotal.toLocaleString()} (${lines.length} line items).`,
    descriptionEs: `Estimado de contratista generado: $${grandTotal.toLocaleString()} (${lines.length} líneas).`,
  });

  try {
    await persistEstimatingState();
  } catch (err) {
    logger.error({ err }, "estimating: contractor-estimate persist failed");
    res.status(500).json({ error: "persist_failed", message: "Estimate was generated but failed to save. Please retry." });
    return;
  }

  res.json(estimate);
});

router.get("/projects/:id/contractor-estimate", requireRole(["team","admin","superadmin","architect","client"]), (req, res) => {
  const id = req.params["id"] as string;
  if (!enforceClientOwnership(req, res, id)) return;
  const est = PROJECT_CONTRACTOR_ESTIMATE[id];
  if (!est) { res.status(404).json({ error: "no_estimate", message: "No contractor estimate yet." }); return; }
  res.json(est);
});

// PUT — update editable contractor estimate lines (description, quantity, unit, unitPrice).
router.put("/projects/:id/contractor-estimate/lines", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const id = req.params["id"] as string;
  const project = PROJECTS.find((p) => p.id === id);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }
  const est = PROJECT_CONTRACTOR_ESTIMATE[id];
  if (!est) { res.status(404).json({ error: "no_estimate", message: "Generate an estimate first." }); return; }
  const body = (req.body ?? {}) as {
    lines?: Array<Record<string, unknown>>;
    contingencyPercent?: number;
    marginPercent?: number;
    managementFeePercent?: number;
    bathrooms?: number;
    kitchens?: number;
  };
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    res.status(400).json({ error: "invalid_lines" }); return;
  }
  const updatedLines = body.lines.map((raw, i) => {
    const existing = est.lines[i];
    const id = typeof raw["id"] === "string" ? (raw["id"] as string) : existing?.id ?? `line-${i + 1}`;
    const category = typeof raw["category"] === "string" ? (raw["category"] as string) : existing?.category ?? "materials";
    const description = typeof raw["description"] === "string" ? (raw["description"] as string) : existing?.description ?? "Line";
    const descriptionEs = typeof raw["descriptionEs"] === "string" ? (raw["descriptionEs"] as string) : existing?.descriptionEs ?? description;
    let quantity = Number(raw["quantity"] ?? existing?.quantity ?? 0);
    let unit = typeof raw["unit"] === "string" ? (raw["unit"] as string) : existing?.unit ?? "unit";
    const unitPrice = Number(raw["unitPrice"] ?? existing?.unitPrice ?? 0);
    // Task #158 / B-02 — `laborType` only meaningful on labor lines. When set
    // to "lump", normalise qty=1 unit="lump" so `lineTotal === lump sum` and
    // the variance report's amount delta math is honest.
    const rawLaborType = typeof raw["laborType"] === "string" ? (raw["laborType"] as string) : existing?.laborType;
    let laborType: "hourly" | "lump" | undefined;
    if (category === "labor") {
      laborType = rawLaborType === "lump" ? "lump" : "hourly";
      if (laborType === "lump") {
        quantity = 1;
        unit = "lump";
      }
    }
    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
    return {
      id, category, description, descriptionEs,
      quantity, unit, unitPrice, lineTotal,
      ...(laborType ? { laborType } : {}),
    };
  });
  const subtotalLabor = updatedLines.filter((l) => l.category === "labor").reduce((a, b) => a + b.lineTotal, 0);
  const subtotalSubcontractor = updatedLines.filter((l) => l.category === "subcontractor").reduce((a, b) => a + b.lineTotal, 0);
  const subtotalMaterials = updatedLines.filter((l) => l.category !== "labor" && l.category !== "subcontractor").reduce((a, b) => a + b.lineTotal, 0);
  const baseSubtotal = subtotalMaterials + subtotalLabor + subtotalSubcontractor;
  const contingencyPercent = body.contingencyPercent !== undefined ? Math.max(0, Number(body.contingencyPercent) || 0) : est.contingencyPercent;
  const marginPercent = body.marginPercent !== undefined ? Math.max(0, Number(body.marginPercent) || 0) : (est.marginPercent ?? 0);
  const managementFeePercent = body.managementFeePercent !== undefined ? Math.max(0, Number(body.managementFeePercent) || 0) : (est.managementFeePercent ?? 0);
  const bathrooms = body.bathrooms !== undefined ? Math.max(0, Math.floor(Number(body.bathrooms) || 0)) : (est.bathrooms ?? 0);
  const kitchens = body.kitchens !== undefined ? Math.max(0, Math.floor(Number(body.kitchens) || 0)) : (est.kitchens ?? 0);
  const contingency = Math.round(baseSubtotal * (contingencyPercent / 100) * 100) / 100;
  const marginAmount = Math.round((baseSubtotal + contingency) * (marginPercent / 100) * 100) / 100;
  const managementFeeAmount = Math.round((baseSubtotal + contingency + marginAmount) * (managementFeePercent / 100) * 100) / 100;
  const grandTotal = Math.round((baseSubtotal + contingency + marginAmount + managementFeeAmount) * 100) / 100;
  const updated: ContractorEstimate = {
    ...est,
    lines: updatedLines,
    subtotalMaterials, subtotalLabor, subtotalSubcontractor,
    contingencyPercent, contingency,
    marginPercent, marginAmount,
    managementFeePercent, managementFeeAmount,
    bathrooms, kitchens,
    grandTotal,
    generatedAt: new Date().toISOString(),
  };
  PROJECT_CONTRACTOR_ESTIMATE[id] = updated;
  await appendActivityAndPersist(id, {
    type: "contractor_estimate",
    actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
    description: `Contractor estimate edited: ${updatedLines.length} lines · $${grandTotal.toLocaleString()}`,
    descriptionEs: `Estimado de contratista editado: ${updatedLines.length} líneas · $${grandTotal.toLocaleString()}`,
  });
  try {
    await persistEstimatingState();
  } catch (err) {
    logger.error({ err }, "estimating: contractor-estimate-lines persist failed");
    res.status(500).json({ error: "persist_failed", message: "Edits were applied but failed to save. Please retry." });
    return;
  }
  res.json(updated);
});

// P1.4 — PATCH manual labor & margin overrides on the contractor estimate.
// Surfaces the meeting's "donde ingresar manualmente los costos de labor de
// los contratistas" complaint. The overrides are independent of the auto
// generation — they don't rewrite lines, they sit alongside as a visible
// authoritative value the team can apply on the next regenerate.
router.patch(
  "/projects/:id/contractor-estimate/overrides",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const id = req.params["id"] as string;
    const project = PROJECTS.find((p) => p.id === id);
    if (!project) { res.status(404).json({ error: "not_found" }); return; }
    const est = PROJECT_CONTRACTOR_ESTIMATE[id];
    if (!est) { res.status(404).json({ error: "no_estimate", message: "Generate an estimate first." }); return; }

    const body = (req.body ?? {}) as {
      manualLaborRate?: number | null;
      manualMarginPercent?: number | null;
    };

    const fieldErrors: Record<string, string> = {};
    // null is a valid "clear the override" signal; numeric must be finite & non-negative.
    if (body.manualLaborRate !== undefined && body.manualLaborRate !== null) {
      const n = Number(body.manualLaborRate);
      if (!isFinite(n) || n < 0 || n > 1000) {
        fieldErrors["manualLaborRate"] = "must be between 0 and 1000 USD/hr";
      }
    }
    if (body.manualMarginPercent !== undefined && body.manualMarginPercent !== null) {
      const n = Number(body.manualMarginPercent);
      if (!isFinite(n) || n < 0 || n > 100) {
        fieldErrors["manualMarginPercent"] = "must be between 0 and 100";
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: "invalid_payload",
        message: "Manual override values out of range",
        messageEs: "Valores de sobrescritura manual fuera de rango",
        fields: fieldErrors,
      });
      return;
    }

    const updated: ContractorEstimate = {
      ...est,
      ...(body.manualLaborRate !== undefined
        ? { manualLaborRate: body.manualLaborRate === null ? null : Number(body.manualLaborRate) }
        : {}),
      ...(body.manualMarginPercent !== undefined
        ? { manualMarginPercent: body.manualMarginPercent === null ? null : Number(body.manualMarginPercent) }
        : {}),
    };
    PROJECT_CONTRACTOR_ESTIMATE[id] = updated;

    await appendActivityAndPersist(id, {
      type: "contractor_estimate",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Manual contractor overrides updated (rate: ${updated.manualLaborRate ?? "auto"}, margin: ${updated.manualMarginPercent ?? "auto"}%)`,
      descriptionEs: `Sobrescrituras manuales del contratista actualizadas (tarifa: ${updated.manualLaborRate ?? "auto"}, margen: ${updated.manualMarginPercent ?? "auto"}%)`,
    });

    try {
      await persistEstimatingState();
    } catch (err) {
      logger.error({ err, projectId: id }, "estimating: manual-overrides persist failed");
      res.status(500).json({ error: "persist_failed", message: "Overrides were applied but failed to save. Please retry." });
      return;
    }
    res.json(updated);
  },
);

// P1.5 — POST a custom calculator line. The 2026-05-11 meeting asked for
// "un bloque editable para materiales y contratistas" so the team can add
// items that aren't in the master list. New rows are tagged as custom via
// the materialId prefix ("custom-...") so the cascade in reapplyContainerCount
// leaves them alone (only master-derived rows are recomputed on container
// count change).
router.post(
  "/projects/:id/calculator/custom-line",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["id"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ error: "not_found", message: "Project not found" });
      return;
    }
    const body = (req.body ?? {}) as {
      materialName?: string;
      materialNameEs?: string;
      category?: string;
      unit?: string;
      quantity?: number;
      basePrice?: number;
    };
    const name = String(body.materialName ?? "").trim();
    const cat = String(body.category ?? "").trim().toLowerCase();
    const unit = String(body.unit ?? "ea").trim() || "ea";
    const qty = Number(body.quantity ?? 1);
    const price = Number(body.basePrice ?? 0);
    if (!name || name.length > 200) {
      res.status(400).json({ error: "invalid_payload", message: "materialName required (1-200 chars)" });
      return;
    }
    if (!cat || !["steel", "lumber", "electrical", "plumbing", "finishes", "insulation", "foundation"].includes(cat)) {
      res.status(400).json({ error: "invalid_payload", message: "category must be a valid trade key" });
      return;
    }
    if (!isFinite(qty) || qty < 0 || qty > 100_000) {
      res.status(400).json({ error: "invalid_payload", message: "quantity must be 0..100000" });
      return;
    }
    if (!isFinite(price) || price < 0 || price > 1_000_000) {
      res.status(400).json({ error: "invalid_payload", message: "basePrice must be 0..1000000" });
      return;
    }

    const calcMap = CALCULATOR_ENTRIES as Record<string, Array<Record<string, unknown>>>;
    const list = calcMap[projectId] ?? (calcMap[projectId] = []);
    const customId = `${projectId}-custom-${nextId("ln").slice(3)}`;
    const newEntry = {
      id: customId,
      projectId,
      materialId: `custom-${customId}`, // prefix isolates from master rows
      materialName: name,
      materialNameEs: String(body.materialNameEs ?? name).slice(0, 200),
      category: cat,
      unit,
      quantity: qty,
      basePrice: price,
      manualPriceOverride: null,
      effectivePrice: price,
      lineTotal: Math.round(price * qty * 100) / 100,
    };
    list.push(newEntry);

    try {
      await persistCalculatorEntriesForProject(projectId);
    } catch (err) {
      logger.error({ err, projectId }, "calculator: custom-line persist failed");
      res.status(500).json({ error: "persist_failed", message: "Custom line was added in memory but failed to save. Please retry." });
      return;
    }

    res.status(201).json(newEntry);
  },
);

// GET variance report — estimated vs actual for a project.
router.get("/projects/:id/variance-report", requireRole(["team","admin","superadmin","architect","client"]), (req, res) => {
  const id = req.params["id"] as string;
  if (!enforceClientOwnership(req, res, id)) return;
  const project = PROJECTS.find((p) => p.id === id);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }

  const calcEntries = (CALCULATOR_ENTRIES as Record<string, Array<{ category: string; lineTotal: number }>>)[project.id] ?? [];
  const contractorEst = PROJECT_CONTRACTOR_ESTIMATE[project.id];
  const cp = (PROJECT_COST_PLUS as Record<string, { materialsCost: number; laborCost: number; subcontractorCost: number }>)[project.id];

  const estByCategory: Record<string, number> = {};
  let estimatedMaterials = 0;
  let estimatedLabor = 0;
  let estimatedSubcontractor = 0;

  if (contractorEst) {
    for (const l of contractorEst.lines) {
      estByCategory[l.category] = (estByCategory[l.category] ?? 0) + l.lineTotal;
      if (l.category === "labor") estimatedLabor += l.lineTotal;
      else if (l.category === "subcontractor") estimatedSubcontractor += l.lineTotal;
      else estimatedMaterials += l.lineTotal;
    }
  } else {
    for (const e of calcEntries) {
      estByCategory[e.category] = (estByCategory[e.category] ?? 0) + e.lineTotal;
      estimatedMaterials += e.lineTotal;
    }
    // Default labor / subcontractor estimates: 92% of cost-plus actuals (mock baseline).
    if (cp) {
      estimatedLabor = Math.round(cp.laborCost * 0.92);
      estimatedSubcontractor = Math.round(cp.subcontractorCost * 0.92);
    }
  }

  const actualMaterials = cp?.materialsCost ?? 0;
  const actualLabor = cp?.laborCost ?? 0;
  const actualSubcontractor = cp?.subcontractorCost ?? 0;

  const projectInvoices = PROJECT_INVOICES[project.id] ?? [];
  const invoicedByBucket: Record<"materials" | "labor" | "subcontractor" | "unassigned", number> = {
    materials: 0, labor: 0, subcontractor: 0, unassigned: 0,
  };
  const invoicedByCategory: Record<string, number> = {};
  for (const inv of projectInvoices) {
    invoicedByBucket[inv.bucket] += inv.total;
    if (inv.category) {
      invoicedByCategory[inv.category] = (invoicedByCategory[inv.category] ?? 0) + inv.total;
    }
  }

  // Returns null when base is 0 and value is non-zero so the UI can render
  // "—" instead of a misleading "0%".
  function pct(base: number, value: number): number | null {
    if (base === 0) return value === 0 ? 0 : null;
    return Math.round(((value - base) / base) * 1000) / 10;
  }

  type VarianceBucketRow = {
    key: "materials" | "labor" | "subcontractor" | "unassigned";
    labelEn: string;
    labelEs: string;
    estimated: number;
    actual: number;
    invoiced: number;
    variance: number;
    variancePercent: number | null;
    varianceVsInvoiced: number;
    varianceVsInvoicedPercent: number | null;
    status: "on_track" | "warning" | "over";
  };
  const baseBuckets = [
    { key: "materials" as const,     labelEn: "Materials",     labelEs: "Materiales",       estimated: estimatedMaterials,     actual: actualMaterials,     invoiced: invoicedByBucket.materials },
    { key: "labor" as const,         labelEn: "Labor",         labelEs: "Mano de Obra",     estimated: estimatedLabor,         actual: actualLabor,         invoiced: invoicedByBucket.labor },
    { key: "subcontractor" as const, labelEn: "Subcontractor", labelEs: "Subcontratistas",  estimated: estimatedSubcontractor, actual: actualSubcontractor, invoiced: invoicedByBucket.subcontractor },
  ];
  const buckets: VarianceBucketRow[] = baseBuckets.map((b) => ({
    ...b,
    variance: b.actual - b.estimated,
    variancePercent: pct(b.estimated, b.actual),
    varianceVsInvoiced: b.actual - b.invoiced,
    varianceVsInvoicedPercent: pct(b.invoiced, b.actual),
    status: (b.actual <= b.estimated * 1.05 ? "on_track" : b.actual <= b.estimated * 1.15 ? "warning" : "over") as "on_track" | "warning" | "over",
  }));

  if (invoicedByBucket.unassigned > 0) {
    buckets.push({
      key: "unassigned",
      labelEn: "Unassigned (billed, not in cost plan)",
      labelEs: "Sin asignar (facturado, fuera del plan)",
      estimated: 0,
      actual: 0,
      invoiced: invoicedByBucket.unassigned,
      variance: 0,
      variancePercent: null,
      varianceVsInvoiced: -invoicedByBucket.unassigned,
      varianceVsInvoicedPercent: null,
      status: "on_track",
    });
  }

  const materialCategoryKeys = new Set<string>();
  for (const cat of Object.keys(estByCategory)) {
    if (cat !== "labor" && cat !== "subcontractor") materialCategoryKeys.add(cat);
  }
  for (const cat of Object.keys(invoicedByCategory)) {
    if (cat !== "labor" && cat !== "subcontractor") materialCategoryKeys.add(cat);
  }
  const materialCategories = Array.from(materialCategoryKeys)
    .map((category) => {
      const estimated = estByCategory[category] ?? 0;
      const actualShare = actualMaterials === 0 || estimatedMaterials === 0 ? 0 : Math.round((estimated / estimatedMaterials) * actualMaterials);
      const invoiced = invoicedByCategory[category] ?? 0;
      return {
        category,
        estimated,
        actual: actualShare,
        invoiced,
        variance: actualShare - estimated,
        variancePercent: pct(estimated, actualShare),
        varianceVsInvoiced: actualShare - invoiced,
        varianceVsInvoicedPercent: pct(invoiced, actualShare),
      };
    })
    .sort((a, b) => b.estimated - a.estimated);

  const totalEstimated = estimatedMaterials + estimatedLabor + estimatedSubcontractor;
  const totalActual = actualMaterials + actualLabor + actualSubcontractor;
  const invoicedInPlan = invoicedByBucket.materials + invoicedByBucket.labor + invoicedByBucket.subcontractor;
  const invoicedUnassigned = invoicedByBucket.unassigned;
  const totalInvoiced = invoicedInPlan + invoicedUnassigned;

  res.json({
    projectId: project.id,
    projectName: project.name,
    estimateSource: contractorEst ? "contractor_estimate" : "calculator_entries",
    generatedAt: new Date().toISOString(),
    buckets,
    materialCategories,
    totals: {
      estimated: totalEstimated,
      actual: totalActual,
      invoiced: totalInvoiced,
      invoicedInPlan,
      invoicedUnassigned,
      variance: totalActual - totalEstimated,
      variancePercent: pct(totalEstimated, totalActual),
      varianceVsInvoiced: totalActual - invoicedInPlan,
      varianceVsInvoicedPercent: pct(invoicedInPlan, totalActual),
    },
  });
});

// ---------------------------------------------------------------------------
// Per-project remembered CSV column mappings (for the calculator imports tab)
// ---------------------------------------------------------------------------

const VALID_CSV_KINDS: ReadonlyArray<CsvImportKind> = ["materials", "labor", "receipts"];

function isValidMappingValue(v: unknown): boolean {
  return v === null || typeof v === "string";
}
function isValidMappingObject(obj: unknown): obj is Record<string, string | null> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (!isValidMappingValue(v)) return false;
  }
  return true;
}

router.get(
  "/projects/:id/csv-mappings",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  (req, res) => {
    const id = req.params["id"];
    if (!id || !PROJECTS.find((p) => p.id === id)) {
      return res.status(404).json({ message: "project_not_found" });
    }
    if (!enforceClientOwnership(req, res, id)) return;
    return res.json({ projectId: id, mappings: PROJECT_CSV_MAPPINGS[id] ?? {} });
  },
);

router.put(
  "/projects/:id/csv-mappings/:kind",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const id = req.params["id"];
    const kind = req.params["kind"] as CsvImportKind | undefined;
    if (!id || !PROJECTS.find((p) => p.id === id)) {
      return res.status(404).json({ message: "project_not_found" });
    }
    if (!kind || !VALID_CSV_KINDS.includes(kind)) {
      return res.status(400).json({
        message: "invalid_kind",
        messageEs: "tipo de importación no válido",
      });
    }
    const mapping = (req.body as { mapping?: unknown } | undefined)?.mapping;
    if (!isValidMappingObject(mapping)) {
      return res.status(400).json({
        message: "invalid_mapping",
        messageEs: "mapeo inválido",
      });
    }
    const bucket = PROJECT_CSV_MAPPINGS[id] ?? {};
    bucket[kind] = mapping;
    PROJECT_CSV_MAPPINGS[id] = bucket;
    // Task #144 — persist before ack so a 200 OK guarantees the mapping
    // survives a restart.
    try { await persistCsvMappingForProject(id); }
    catch { return res.status(500).json({ error: "persist_failed", message: "CSV mapping was applied in memory but failed to save. Please retry." }); }
    return res.json({ projectId: id, kind, mapping });
  },
);

export default router;
