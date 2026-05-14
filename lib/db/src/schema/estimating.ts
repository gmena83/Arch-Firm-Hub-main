// Estimating + calculator persistence (Task #141).
//
// These tables back the data that used to live in `.data/estimating.json`
// alongside an in-memory copy in `routes/estimating.ts`. Moving to Postgres
// gives us a real source of truth that survives container redeploys and is
// trivial to migrate to Supabase later (the SQL is portable).
//
// Notes on column choices:
//   - `text` IDs everywhere because the existing payloads use string IDs
//     (e.g. "rec-...", "calc-1-1", "mat-imp-..."). No reason to introduce
//     surrogate integers when the app already has stable identifiers.
//   - `doublePrecision` for monetary fields. The current code stores plain
//     JS numbers; switching to numeric/decimal would introduce string⇄number
//     coercion at every read/write for no business benefit. If the team ever
//     wants strict cents-precision accounting we can migrate to numeric
//     later — but that is out of scope for the durability fix.
//   - JSON columns (`columns`, `headerLines`, `scope`) keep the JSON shape
//     the API already returns; no need to normalise into another table for
//     small string arrays.
//   - Estimate lines live in their own table with a composite PK so the
//     line ordering is stable (`position` int) and a single project's lines
//     can be replaced atomically.

import {
  pgTable,
  text,
  doublePrecision,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// -- imported_materials ------------------------------------------------------
// CSV-imported extras that appear alongside the seed `MATERIALS` list in the
// unified `/api/materials` catalog. Source-of-truth for `EXTRA_MATERIALS`.
export const importedMaterialsTable = pgTable("imported_materials", {
  id: text("id").primaryKey(),
  item: text("item").notNull(),
  itemEs: text("item_es").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  basePrice: doublePrecision("base_price").notNull(),
});

// -- labor_rates -------------------------------------------------------------
// Per-trade hourly rate, with provenance ("seed" | "import" | "receipts").
// `trade` is the natural key — there is exactly one rate per trade name.
export const laborRatesTable = pgTable("labor_rates", {
  trade: text("trade").primaryKey(),
  tradeEs: text("trade_es").notNull(),
  unit: text("unit").notNull(),
  hourlyRate: doublePrecision("hourly_rate").notNull(),
  source: text("source").notNull(), // "seed" | "import" | "receipts"
  updatedAt: text("updated_at").notNull(), // ISO string, mirrors API payload
});

// -- project_receipts --------------------------------------------------------
// CSV / OCR receipts. We keep up to the most-recent N per project (the route
// does the trimming) so this table is small.
export const projectReceiptsTable = pgTable(
  "project_receipts",
  {
    projectId: text("project_id").notNull(),
    id: text("id").notNull(),
    vendor: text("vendor").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd, matches API payload
    trade: text("trade").notNull(),
    amount: doublePrecision("amount").notNull(),
    hours: doublePrecision("hours").notNull(),
    position: integer("position").notNull().default(0),
  },
  // Composite PK — receipt IDs are unique within a project (the route
  // generates them server-side) but not guaranteed globally. Same shape as
  // contractor estimate lines so per-project replace semantics are safe.
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("project_receipts_project_id_idx").on(t.projectId),
  ],
);

// -- project_report_templates ------------------------------------------------
// One report template per project (the API replaces wholesale on POST).
export const projectReportTemplatesTable = pgTable("project_report_templates", {
  projectId: text("project_id").primaryKey(),
  name: text("name").notNull(),
  columns: jsonb("columns").$type<string[]>().notNull(),
  headerLines: jsonb("header_lines").$type<string[]>().notNull(),
  footer: text("footer").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
});

// -- project_contractor_estimates -------------------------------------------
// Header / summary row. Lines are in `project_contractor_estimate_lines`.
export const projectContractorEstimatesTable = pgTable(
  "project_contractor_estimates",
  {
    projectId: text("project_id").primaryKey(),
    source: text("source").notNull(),
    squareMeters: doublePrecision("square_meters").notNull(),
    projectType: text("project_type").notNull(),
    scope: jsonb("scope").$type<string[]>().notNull(),
    bathrooms: integer("bathrooms").notNull().default(0),
    kitchens: integer("kitchens").notNull().default(0),
    subtotalMaterials: doublePrecision("subtotal_materials").notNull(),
    subtotalLabor: doublePrecision("subtotal_labor").notNull(),
    subtotalSubcontractor: doublePrecision("subtotal_subcontractor").notNull(),
    contingencyPercent: doublePrecision("contingency_percent").notNull(),
    contingency: doublePrecision("contingency").notNull(),
    marginPercent: doublePrecision("margin_percent").notNull().default(0),
    marginAmount: doublePrecision("margin_amount").notNull().default(0),
    managementFeePercent: doublePrecision("management_fee_percent")
      .notNull()
      .default(0),
    managementFeeAmount: doublePrecision("management_fee_amount")
      .notNull()
      .default(0),
    grandTotal: doublePrecision("grand_total").notNull(),
    generatedAt: text("generated_at").notNull(),
    generatedBy: text("generated_by").notNull(),
    // P1.4 — manual labor & margin overrides surfaced on the Contractor
    // calculator. When set, these override the auto-derived values from
    // the receipt-history average. NULL means "use the auto value".
    manualLaborRate: doublePrecision("manual_labor_rate"),
    manualMarginPercent: doublePrecision("manual_margin_percent"),
  },
);

// -- project_contractor_estimate_lines --------------------------------------
// Line items, ordered by `position`. Composite PK because the existing line
// IDs are unique within a project but not necessarily globally.
export const projectContractorEstimateLinesTable = pgTable(
  "project_contractor_estimate_lines",
  {
    projectId: text("project_id").notNull(),
    id: text("id").notNull(),
    position: integer("position").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    descriptionEs: text("description_es").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unit: text("unit").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
    lineTotal: doublePrecision("line_total").notNull(),
    // P1.8 — 3-tier labor estimation (Worst / Most Likely / Best). Only
    // meaningful for `category === "labor"` lines; null for materials &
    // subcontractor. Variance compares Actual against MOST LIKELY by default.
    hoursWorstCase: doublePrecision("hours_worst_case"),
    hoursMostLikely: doublePrecision("hours_most_likely"),
    hoursBestCase: doublePrecision("hours_best_case"),
    // Existing field — re-declared here for completeness. "hourly" (default)
    // computes lineTotal from quantity × unitPrice. "lump" forces qty=1,
    // unit="lump" so lineTotal IS the lump sum (variance-report friendly).
    laborType: text("labor_type"),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("contractor_estimate_lines_project_id_idx").on(t.projectId),
  ],
);

// -- project_calculator_entries ---------------------------------------------
// Per-project BOM rows. Backs `seed.ts → CALCULATOR_ENTRIES` for projects
// whose lines have been edited via the PATCH /calculations/:lineId endpoint.
// Projects with no DB row continue to use the seed defaults — see
// `loadCalculatorEntriesFromDb` in `estimating-store.ts`.
export const projectCalculatorEntriesTable = pgTable(
  "project_calculator_entries",
  {
    projectId: text("project_id").notNull(),
    id: text("id").notNull(),
    position: integer("position").notNull(),
    materialId: text("material_id").notNull(),
    materialName: text("material_name").notNull(),
    materialNameEs: text("material_name_es").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    basePrice: doublePrecision("base_price").notNull(),
    manualPriceOverride: doublePrecision("manual_price_override"),
    effectivePrice: doublePrecision("effective_price").notNull(),
    lineTotal: doublePrecision("line_total").notNull(),
  },
  // Composite PK — calculator line IDs (e.g. "calc-1-1") are project-scoped
  // and would collide between projects under a global PK, breaking the
  // per-project delete-then-insert path in `saveCalculatorEntriesForProject`.
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("calculator_entries_project_id_idx").on(t.projectId),
  ],
);

// -- migrations metadata -----------------------------------------------------
// Single-row table tracking that the one-time JSON → Postgres import has
// run, so we never re-import even if the legacy file is restored from a
// backup.
export const estimatingMigrationsTable = pgTable("estimating_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  details: text("details"),
});
