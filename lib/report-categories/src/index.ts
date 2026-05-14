// Single source of truth for the KONTi project-report category model.
//
// The team's PROJECT ESTIMATE spreadsheet
// (attached_assets/1b)_KONTI_DESIGN_CONSTRUCTION_ESTIMATE_-_BENITO_COLON…)
// rolls every project cost into five top-level buckets, in this order:
//
//   1. DESIGN AND DATA COLLECTION   (Plans, Soil Study, Survey, …)
//   2. PERMITS & SERVICE FEES       (Municipal Patent, Permit fees, Insurance)
//   3. PRODUCT (CONTAINERS)         (Container purchase, structural prep,
//                                    interior build, finishes, …)
//   4. EXTERIOR & ADD-ONS           (Foundation, Site Electric/Plumbing,
//                                    Steel Structure, Decking, Site Work, …)
//   5. CONSTRUCTION CONTINGENCY     (reserved budget for unforeseen costs)
//
// Both the api-server rollup endpoints and the project-report.tsx renderer
// import from this module so the platform report and the team's emailed PDF
// stay in lockstep. Raw line items keep their existing trade-level "category"
// field — the mapping happens at rollup-time only.

export type ReportBucketKey =
  | "design_data_collection"
  | "permits_service_fees"
  | "product_containers"
  | "exterior_add_ons"
  | "construction_contingency";

export const REPORT_BUCKET_KEYS: readonly ReportBucketKey[] = [
  "design_data_collection",
  "permits_service_fees",
  "product_containers",
  "exterior_add_ons",
  "construction_contingency",
] as const;

export const REPORT_BUCKET_LABELS: Record<ReportBucketKey, { en: string; es: string }> = {
  design_data_collection:   { en: "Design & Data Collection", es: "Diseño y Recolección de Datos" },
  permits_service_fees:     { en: "Permits & Service Fees",   es: "Permisos y Tasas de Servicio" },
  product_containers:       { en: "Product (Containers)",     es: "Producto (Contenedores)" },
  exterior_add_ons:         { en: "Exterior & Add-Ons",       es: "Exterior y Complementos" },
  construction_contingency: { en: "Construction Contingency", es: "Contingencia de Construcción" },
};

// Trade-level category → team bucket mapping. Built from the line items in
// the BENITO_COLON estimate XLSX:
//   - foundation, site electric, site plumbing, decking, steel structure
//     → EXTERIOR & ADD-ONS
//   - container purchase, structural prep, container infrastructure,
//     interior build, finishes, kitchen, bathroom, detailing, cleanup
//     → PRODUCT (CONTAINERS)  (this bucket also absorbs the trade-level
//     labor and most internal trade work, since the team's XLSX includes
//     labor inside each container line)
const TRADE_TO_BUCKET: Record<string, ReportBucketKey> = {
  // Trade keys used by CALCULATOR_ENTRIES and contractor-estimate lines.
  foundation:    "exterior_add_ons",
  steel:         "product_containers",
  electrical:    "product_containers",
  plumbing:      "product_containers",
  finishes:      "product_containers",
  insulation:    "product_containers",
  lumber:        "product_containers",
  labor:         "product_containers",
  subcontractor: "exterior_add_ons",

  // Spreadsheet-named exterior trades from the BENITO_COLON estimate. These
  // keys aren't in CALCULATOR_ENTRIES today, but if a future estimate tags
  // a line with the human-readable spreadsheet term we still want it routed
  // to EXTERIOR & ADD-ONS instead of falling through to the default bucket.
  "site electric":   "exterior_add_ons",
  "site_electric":   "exterior_add_ons",
  "site-electric":   "exterior_add_ons",
  "site plumbing":   "exterior_add_ons",
  "site_plumbing":   "exterior_add_ons",
  "site-plumbing":   "exterior_add_ons",
  "site work":       "exterior_add_ons",
  "site_work":       "exterior_add_ons",
  "site-work":       "exterior_add_ons",
  "decking":         "exterior_add_ons",
  "steel structure": "exterior_add_ons",
  "steel_structure": "exterior_add_ons",
  "steel-structure": "exterior_add_ons",
  "exterior":        "exterior_add_ons",

  // Direct bucket keys (in case future estimate lines tag at the bucket
  // level — keeps the mapper idempotent).
  design_data_collection:   "design_data_collection",
  permits_service_fees:     "permits_service_fees",
  product_containers:       "product_containers",
  exterior_add_ons:         "exterior_add_ons",
  construction_contingency: "construction_contingency",

  // Document/seed-side category names that overlap with this column.
  design:       "design_data_collection",
  permits:      "permits_service_fees",
  contingency:  "construction_contingency",
  construction: "product_containers",

  // Additional canonical-XLSX aliases (DESIGN & DATA COLLECTION column).
  "design & data collection": "design_data_collection",
  "design and data collection": "design_data_collection",
  "data collection":           "design_data_collection",
  "site survey":               "design_data_collection",
  "topographic survey":        "design_data_collection",
  "soil study":                "design_data_collection",
  "soil_study":                "design_data_collection",
  "geotechnical":              "design_data_collection",
  "architectural design":      "design_data_collection",
  "engineering":               "design_data_collection",
  "blueprints":                "design_data_collection",
  "renderings":                "design_data_collection",

  // PERMITS & SERVICE FEES aliases.
  "permits & service fees":  "permits_service_fees",
  "permits and service fees":"permits_service_fees",
  "service fees":            "permits_service_fees",
  "service_fees":            "permits_service_fees",
  "permit":                  "permits_service_fees",
  "permit fees":             "permits_service_fees",
  "permitting":              "permits_service_fees",
  "arpe":                    "permits_service_fees",
  "oprhi":                   "permits_service_fees",
  "ocam":                    "permits_service_fees",
  "use permit":              "permits_service_fees",
  "construction permit":     "permits_service_fees",
  "endoso":                  "permits_service_fees",
  "endorsements":            "permits_service_fees",

  // EXTERIOR & ADD-ONS aliases (from spreadsheet variants).
  "exterior & add-ons":      "exterior_add_ons",
  "exterior and add-ons":    "exterior_add_ons",
  "exterior & add ons":      "exterior_add_ons",
  "add-ons":                 "exterior_add_ons",
  "add_ons":                 "exterior_add_ons",
  "addons":                  "exterior_add_ons",
  "landscaping":             "exterior_add_ons",
  "fencing":                 "exterior_add_ons",
  "driveway":                "exterior_add_ons",
  "pool":                    "exterior_add_ons",
  "deck":                    "exterior_add_ons",
  "terrace":                 "exterior_add_ons",
  "patio":                   "exterior_add_ons",
  "septic":                  "exterior_add_ons",
  "septic tank":             "exterior_add_ons",
  "well":                    "exterior_add_ons",
  "cistern":                 "exterior_add_ons",
  "site preparation":        "exterior_add_ons",
  "excavation":              "exterior_add_ons",
  "earthworks":              "exterior_add_ons",

  // PRODUCT (CONTAINERS) aliases — explicit container/interior trades.
  "product (containers)":    "product_containers",
  "product containers":      "product_containers",
  "containers":              "product_containers",
  "container":               "product_containers",
  "container purchase":      "product_containers",
  "container infrastructure":"product_containers",
  "structural prep":         "product_containers",
  "interior build":          "product_containers",
  "interior":                "product_containers",
  "kitchen":                 "product_containers",
  "bathroom":                "product_containers",
  "bath":                    "product_containers",
  "detailing":               "product_containers",
  "cleanup":                 "product_containers",
  "hvac":                    "product_containers",
  "ac":                      "product_containers",
  "windows":                 "product_containers",
  "doors":                   "product_containers",
  "flooring":                "product_containers",
  "drywall":                 "product_containers",
  "paint":                   "product_containers",
  "painting":                "product_containers",
  "appliances":              "product_containers",
  "millwork":                "product_containers",
  "cabinetry":               "product_containers",

  // CONSTRUCTION CONTINGENCY aliases.
  "construction contingency": "construction_contingency",
  "contingency reserve":      "construction_contingency",
  "reserve":                  "construction_contingency",
  "buffer":                   "construction_contingency",

  // P4.1 — Phase 1-5 PRODUCT (CONTAINERS) sub-categories from Jorge's
  // canonical 1b)_KONTI_DESIGN_CONSTRUCTION_ESTIMATE BENITO_COLON xlsx.
  // These all roll up into PRODUCT (CONTAINERS) but the key-level
  // routing keeps the team's existing line tagging working unchanged.
  // Snake-case duplicates of the space-separated keys already in the map
  // above so both forms work when a line is tagged programmatically.
  "container_purchase":       "product_containers",
  "structural_prep":          "product_containers",
  "cuts_and_frames":          "product_containers",
  "cuts & frames":            "product_containers",
  "cut_and_frames":           "product_containers",
  "cut & frames":             "product_containers",
  "exterior_windows_and_doors": "product_containers",
  "exterior windows & doors": "product_containers",
  "exterior windows and doors": "product_containers",
  "container_infrastructure": "product_containers",
  "interior_build":           "product_containers",
  "interior_infrastructure":  "product_containers",
  "interior infrastructure":  "product_containers",
  "container_finishes":       "product_containers",
  "container finishes":       "product_containers",
  "container_installation":   "product_containers",
  "container installation":   "product_containers",
  "post_construction_cleanup":"product_containers",
  "post construction cleanup":"product_containers",
  "plumbing_finishes":        "product_containers",
  "plumbing finishes":        "product_containers",
  "electrical_finishes":      "product_containers",
  "electrical finishes":      "product_containers",
  "plumbing_infrastructure":  "product_containers",
  "plumbing infrastructure":  "product_containers",
  "electrical_infrastructure":"product_containers",
  "electrical infrastructure":"product_containers",
  "gas_connection":           "product_containers",
  "gas connection":           "product_containers",
  "consumables":              "product_containers",

  // P4.1 — EXTERIOR & ADD-ONS sub-categories (canonical Appendix A.1).
  "outdoor_kitchen_build":    "exterior_add_ons",
  "outdoor kitchen build":    "exterior_add_ons",
  "appliances_purchase":      "exterior_add_ons",
  "appliances purchase":      "exterior_add_ons",
  "bio_garden":               "exterior_add_ons",
  "bio garden":               "exterior_add_ons",
  "exterior_steel_structure": "exterior_add_ons",
  "exterior steel structure": "exterior_add_ons",
  "exterior_staircase":       "exterior_add_ons",
  "exterior staircase":       "exterior_add_ons",
  "interior_staircase":       "product_containers",
  "interior staircase":       "product_containers",
  "pergola":                  "exterior_add_ons",
};

export function bucketForTradeCategory(rawCategory: string | null | undefined): ReportBucketKey {
  if (!rawCategory) return "product_containers";
  // Normalize whitespace so "  Foundation  " or "Steel Structure" still
  // match a canonical key. Unknown trades fall back to PRODUCT (CONTAINERS)
  // since the team's PROJECT ESTIMATE spreadsheet absorbs internal trade
  // work into that bucket.
  const normalized = rawCategory.trim().toLowerCase();
  return TRADE_TO_BUCKET[normalized] ?? "product_containers";
}

export function reportBucketLabel(key: string, lang: string): string {
  const k = key as ReportBucketKey;
  const entry = REPORT_BUCKET_LABELS[k];
  if (!entry) {
    // Fall through to the raw key for unknown buckets (defensive — every
    // production code-path should pass a canonical bucket key).
    return key;
  }
  return lang === "es" ? entry.es : entry.en;
}

export interface BucketSubLine {
  // Original raw trade-level category key (e.g. "foundation", "steel"). Kept
  // verbatim so consumers can correlate back to source line items.
  category: string;
  labelEn: string;
  labelEs: string;
  total: number;
}

export interface BucketRollupRow {
  key: ReportBucketKey;
  labelEn: string;
  labelEs: string;
  total: number;
  // Trade-level sub-lines that contributed to this bucket. Always included
  // (empty array for empty buckets) so the report UI can render an
  // expandable detail row under each bucket without a second request.
  lines: BucketSubLine[];
}

// Group {category, total} pairs into the team's five canonical buckets and
// always return all five entries in canonical order, even when a bucket has
// zero spend so far. The report UI renders empty buckets as "—" so clients
// can see the structure mirrors the team's emailed PDF.
export function rollupByBucket(
  pairs: Array<{ category: string; total: number }>,
): BucketRollupRow[] {
  const totals = new Map<ReportBucketKey, number>();
  // Per-bucket trade sub-line totals, keyed by the lowercased trade category
  // so duplicate inputs (e.g. two "Foundation" rows) collapse into one line.
  const lines = new Map<ReportBucketKey, Map<string, number>>();
  for (const key of REPORT_BUCKET_KEYS) {
    totals.set(key, 0);
    lines.set(key, new Map());
  }
  for (const pair of pairs) {
    if (!Number.isFinite(pair.total)) continue;
    const bucket = bucketForTradeCategory(pair.category);
    totals.set(bucket, (totals.get(bucket) ?? 0) + pair.total);
    const tradeKey = (pair.category ?? "").trim().toLowerCase() || "uncategorized";
    const bucketLines = lines.get(bucket)!;
    bucketLines.set(tradeKey, (bucketLines.get(tradeKey) ?? 0) + pair.total);
  }
  return REPORT_BUCKET_KEYS.map((key) => {
    const bucketLines = lines.get(key) ?? new Map<string, number>();
    return {
      key,
      labelEn: REPORT_BUCKET_LABELS[key].en,
      labelEs: REPORT_BUCKET_LABELS[key].es,
      total: totals.get(key) ?? 0,
      lines: Array.from(bucketLines.entries())
        // Largest contribution first so the most material item shows on top.
        .sort((a, b) => b[1] - a[1])
        .map(([category, total]) => ({
          category,
          labelEn: tradeCategoryLabel(category, "en"),
          labelEs: tradeCategoryLabel(category, "es"),
          total,
        })),
    };
  });
}

// Convenience: collapse a Record<rawCategoryKey, number> directly into the
// five-bucket rollup. Used by the calculations endpoint where the raw rollup
// is already keyed by trade-level category.
export function rollupRecordByBucket(
  byCategory: Record<string, number>,
): BucketRollupRow[] {
  return rollupByBucket(
    Object.entries(byCategory).map(([category, total]) => ({ category, total })),
  );
}

// Legacy trade-level labels — kept so the team-side Material Cost Summary on
// project-detail.tsx (which still renders raw trade categories per line) can
// share a single label dictionary with the bucket rollup.
const TRADE_LABELS: Record<string, { en: string; es: string }> = {
  foundation:    { en: "Foundation",        es: "Cimientos" },
  steel:         { en: "Steel / Container", es: "Acero / Contenedor" },
  electrical:    { en: "Electrical",        es: "Eléctrico" },
  plumbing:      { en: "Plumbing",          es: "Plomería" },
  finishes:      { en: "Finishes",          es: "Acabados" },
  insulation:    { en: "Insulation",        es: "Aislamiento" },
  lumber:        { en: "Lumber",            es: "Madera" },
  labor:         { en: "Labor",             es: "Mano de Obra" },
  subcontractor: { en: "Subcontractor",     es: "Subcontratistas" },
  // P4.1 — Phase 1-5 PRODUCT (CONTAINERS) sub-categories.
  container_purchase:        { en: "Container Purchase",     es: "Compra de Contenedor" },
  structural_prep:           { en: "Structural Prep",        es: "Preparación Estructural" },
  cuts_and_frames:           { en: "Cuts & Frames",          es: "Cortes y Marcos" },
  exterior_windows_and_doors:{ en: "Exterior Windows & Doors", es: "Ventanas y Puertas Exteriores" },
  container_infrastructure:  { en: "Container Infrastructure", es: "Infraestructura del Contenedor" },
  interior_build:            { en: "Interior Build",         es: "Construcción Interior" },
  interior_infrastructure:   { en: "Interior Infrastructure", es: "Infraestructura Interior" },
  container_finishes:        { en: "Container Finishes",     es: "Acabados del Contenedor" },
  container_installation:    { en: "Container Installation", es: "Instalación del Contenedor" },
  detailing:                 { en: "Detailing",              es: "Detallado" },
  post_construction_cleanup: { en: "Post-Construction Cleanup", es: "Limpieza Post-Construcción" },
  plumbing_finishes:         { en: "Plumbing Finishes",      es: "Acabados de Plomería" },
  electrical_finishes:       { en: "Electrical Finishes",    es: "Acabados Eléctricos" },
  plumbing_infrastructure:   { en: "Plumbing Infrastructure", es: "Infraestructura de Plomería" },
  electrical_infrastructure: { en: "Electrical Infrastructure", es: "Infraestructura Eléctrica" },
  gas_connection:            { en: "Gas Connection",         es: "Conexión de Gas" },
  consumables:               { en: "Consumables",            es: "Consumibles" },
  kitchen:                   { en: "Kitchen",                es: "Cocina" },
  bathroom:                  { en: "Bathroom",               es: "Baño" },
  hvac:                      { en: "HVAC",                   es: "HVAC" },
  appliances:                { en: "Appliances",             es: "Electrodomésticos" },
  interior_staircase:        { en: "Interior Staircase",     es: "Escalera Interior" },
  // P4.1 — EXTERIOR & ADD-ONS sub-categories.
  exterior_steel_structure:  { en: "Exterior Steel Structure", es: "Estructura de Acero Exterior" },
  exterior_staircase:        { en: "Exterior Staircase",     es: "Escalera Exterior" },
  decking:                   { en: "Decking",                es: "Terraza" },
  pergola:                   { en: "Pergola",                es: "Pérgola" },
  bio_garden:                { en: "Bio Garden",             es: "Bio Jardín" },
  site_electric:             { en: "Site Electric",          es: "Eléctrico del Sitio" },
  site_plumbing:             { en: "Site Plumbing",          es: "Plomería del Sitio" },
  site_work:                 { en: "Site Work",              es: "Trabajo de Sitio" },
  outdoor_kitchen_build:     { en: "Outdoor Kitchen",        es: "Cocina Exterior" },
};

export function tradeCategoryLabel(key: string, lang: string): string {
  const entry = TRADE_LABELS[key.toLowerCase()];
  if (entry) return lang === "es" ? entry.es : entry.en;
  return key.charAt(0).toUpperCase() + key.slice(1);
}
