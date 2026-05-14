import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

type InboxItem = {
  id: string;
  status: string;
  topic: string;
  feedbackText: string;
  currentPage: string;
  screenshots: string[];
  timeCreated: string;
};

type ReportRow = {
  itemNum: number;
  date: string;
  statusLabel: string;
  statusKey: "completed" | "in_progress" | "pending" | "out_of_scope";
  refs: string;
};

type Priority = "P0" | "P1" | "P2" | "P3";
type EtaBucket = "≤ 1 day" | "2–3 days" | "1 week" | "2 weeks" | "3+ weeks";

type ClusterKey =
  | "Client view / portal"
  | "Project creation / phases"
  | "Calculator / estimating"
  | "Site photos / gallery"
  | "AI assistant"
  | "Variance / cost tracking"
  | "Permits / OGPe"
  | "Notifications / status"
  | "Mobile / responsive"
  | "PDF report export"
  | "Branding / logo"
  | "Documents / files"
  | "Team directory"
  | "Materials library"
  | "Leads intake"
  | "Other / cross-cutting";

const inboxItems: InboxItem[] = JSON.parse(
  readFileSync(resolve(ROOT, ".local/reports/inbox-items.json"), "utf8"),
);

const reportMd = readFileSync(
  resolve(ROOT, "attached_assets/reports/feedback-vs-changelog.md"),
  "utf8",
);

// ---- Parse the report ---------------------------------------------------
function parseReport(md: string): Map<number, ReportRow> {
  const map = new Map<number, ReportRow>();
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^##### Item (\d+) · (\d{4}-\d{2}-\d{2}) · (.+)$/);
    if (!head) continue;
    const itemNum = Number(head[1]);
    const date = head[2];
    const statusLabel = head[3].trim();
    let statusKey: ReportRow["statusKey"];
    if (statusLabel.startsWith("✅")) statusKey = "completed";
    else if (statusLabel.startsWith("🟡")) statusKey = "in_progress";
    else if (statusLabel.startsWith("⏳")) statusKey = "pending";
    else if (statusLabel.startsWith("💬")) statusKey = "out_of_scope";
    else throw new Error(`Unknown status on Item ${itemNum}: ${statusLabel}`);

    let refs = "—";
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      const r = lines[j].match(/^\*\*Refs:\*\*\s*(.+)$/);
      if (r) {
        refs = r[1].trim();
        break;
      }
    }
    map.set(itemNum, { itemNum, date, statusLabel, statusKey, refs });
  }
  return map;
}

const reportMap = parseReport(reportMd);
if (reportMap.size !== 98) {
  throw new Error(`Expected 98 report cards, parsed ${reportMap.size}`);
}

// ---- Build full row records --------------------------------------------
type FullRow = ReportRow & {
  page: string;
  topic: string;
  quote: string;
  cluster: ClusterKey;
};

const TOPIC_LABEL: Record<string, string> = {
  DESIGN: "Design (Diseño)",
  CONTENT: "Content (Contenido)",
  FEATURE_REQUEST: "Feature request (Solicitud)",
  BUG_REPORT: "Bug report (Reporte de bug)",
  OTHER: "Other (Otro)",
};

function shortenPage(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "");
}

function detectCluster(quote: string, page: string): ClusterKey {
  const q = quote.toLowerCase();
  const p = page.toLowerCase();
  // Order matters — earlier rules win.
  if (
    p.includes("/calculator") ||
    /calculadora|calculator|estimad|estimat|cotej|recibo|labor|mano de obra|management fee|presupuest/.test(q)
  )
    return "Calculator / estimating";
  if (p.includes("?tab=variance") || /varianza|variance|gasto|estimado a lo gastado/.test(q))
    return "Variance / cost tracking";
  if (p.includes("/permits") || /permis|ogpe|firma|signat/.test(q))
    return "Permits / OGPe";
  if (p.includes("/ai") || /asistente ia|chat bot|chatbot|asistente|ai assistant/.test(q))
    return "AI assistant";
  if (p.includes("/team") || /equipo|nainoshka|team member/.test(q))
    return "Team directory";
  if (p.includes("/materials") || /materiales|material library|lista de materi/.test(q))
    return "Materials library";
  if (p.includes("/leads") || /lead|interesad|solicitante/.test(q))
    return "Leads intake";
  if (p.includes("/dashboard") && /logo/.test(q)) return "Branding / logo";
  if (/logo|branding|paleta|color de marca|negro|gris konti/.test(q))
    return "Branding / logo";
  if (
    /foto|video|imagen|gallery|galería|photo|captur|screenshot|punchlist/.test(q) &&
    !/punchlist con|punchlist que|punchlist y/.test(q)
  )
    return "Site photos / gallery";
  if (/notific|popup|alert|aviso|status update/.test(q))
    return "Notifications / status";
  if (/mobile|responsive|móvil|movil|tablet|telefono|teléfono/.test(q))
    return "Mobile / responsive";
  if (/pdf|reporte (descarg|imprim|generad)|report\.pdf|exportar reporte|descargarlo/.test(q))
    return "PDF report export";
  if (
    /document|archivo|drive|repositorio|version|versión|contrato|acuerdo|carga de archivo|subir/.test(
      q,
    )
  )
    return "Documents / files";
  if (
    /fase|cronograma|cliente vea|cliente ve|client view|client portal|vista del cliente|vista cliente|portal del cliente|cliente puede|el cliente|del cliente|el client|client report/.test(
      q,
    )
  )
    return "Client view / portal";
  if (/proyecto|project|crear|fase|sub-pas|hito|deliverable/.test(q))
    return "Project creation / phases";
  return "Other / cross-cutting";
}

// Manual cluster overrides (review pass over keyword heuristic).
const CLUSTER_OVERRIDES: Record<number, ClusterKey> = {
  // Item 4 / 14 / 23 / 69 are photos & notes — site photos cluster.
  4: "Site photos / gallery",
  14: "Site photos / gallery",
  23: "Site photos / gallery",
  69: "Site photos / gallery",
  // Items 5 (clickable activities) and 7 (audit log) — cross-cutting nav/audit, not a cluster.
  5: "Other / cross-cutting",
  7: "Other / cross-cutting",
  // Items 16 (client upload), 19 (per-invoice columns), 26 (version history client-only), 27 (client-visibility flag), 48 (per-project dashboard), 67 (categories vs BOM), 76 (private to who), 82 (cannot upload), 92 (client report categories) — client portal scope.
  16: "Client view / portal",
  19: "Client view / portal",
  26: "Client view / portal",
  27: "Client view / portal",
  48: "Client view / portal",
  67: "Client view / portal",
  76: "Client view / portal",
  82: "Client view / portal",
  91: "Client view / portal",
  92: "Client view / portal",
  // Item 11 (Contratos / Acuerdos grouping) — documents.
  11: "Documents / files",
  // Item 80 (document categorization) — documents.
  80: "Documents / files",
  // Items 49, 53, 56, 57, 58, 59 — calculator content/data model.
  49: "Calculator / estimating",
  53: "Calculator / estimating",
  55: "Calculator / estimating",
  56: "Calculator / estimating",
  57: "Calculator / estimating",
  58: "Calculator / estimating",
  59: "Calculator / estimating",
  // Item 52 — calculator (lump sum vs hourly).
  52: "Calculator / estimating",
  // Item 35 — calculator labor rates from receipts.
  35: "Calculator / estimating",
  // Item 34 — calculator report-format upload.
  34: "Calculator / estimating",
  // Item 66 — calculator (management fee field) even though feedback was filed on the report page.
  66: "Calculator / estimating",
  // Item 79 — punchlist categories alignment + drive photo links — site photos.
  79: "Site photos / gallery",
  // Item 93 — phase pie chart on the report — PDF report cluster.
  93: "PDF report export",
  // Item 94 — phase numbering on the report — PDF report cluster.
  94: "PDF report export",
  // Item 95 — copy on the report — PDF report cluster.
  95: "PDF report export",
  // Item 97 — report logo size — branding.
  97: "Branding / logo",
  // Item 98 — report color palette — branding.
  98: "Branding / logo",
  // Item 18 — KONTi gray — branding.
  18: "Branding / logo",
  // Item 12 — copy ("Cronograma del proyecto") — cross-cutting copy.
  12: "Other / cross-cutting",
  // Item 87 — copy ("Permit Documentation") — permits.
  87: "Permits / OGPe",
  // Item 88 — split permits by type.
  88: "Permits / OGPe",
  // Item 89 — legal header on permits page.
  89: "Permits / OGPe",
  // Item 61 — contractor directory upload — team.
  61: "Team directory",
  // Item 74 — lead score legend — leads.
  74: "Leads intake",
  // Item 40 — AI chat questions to notes — AI assistant.
  40: "AI assistant",
  // Item 43 — punchlist as gate — project phases.
  43: "Project creation / phases",
  // Item 21 — receipts persistence — calculator.
  21: "Calculator / estimating",
  // Item 17 — Gastos no facturables tab.
  17: "Client view / portal",
  // Items 8 + 3 — report download history & light mode — PDF report.
  8: "PDF report export",
  3: "PDF report export",
  // Item 15 — contractor monitoring narrative — site photos cluster (overlaps with weekly report).
  15: "Site photos / gallery",
  // Item 20 — client profile fields — client portal.
  20: "Client view / portal",
};

function clusterOf(num: number, q: string, p: string): ClusterKey {
  if (CLUSTER_OVERRIDES[num]) return CLUSTER_OVERRIDES[num];
  return detectCluster(q, p);
}

const fullRows: FullRow[] = [];
for (let i = 0; i < inboxItems.length; i++) {
  const itemNum = i + 1;
  const inbox = inboxItems[i];
  const rep = reportMap.get(itemNum);
  if (!rep) throw new Error(`Missing report row for Item ${itemNum}`);
  const page = shortenPage(inbox.currentPage);
  const cluster = clusterOf(itemNum, inbox.feedbackText, inbox.currentPage);
  fullRows.push({
    ...rep,
    page,
    topic: TOPIC_LABEL[inbox.topic] ?? inbox.topic,
    quote: inbox.feedbackText,
    cluster,
  });
}

// ---- Compute cluster counts (over actionable rows = pending + in_progress) -
const actionableRows = fullRows.filter(
  (r) => r.statusKey === "pending" || r.statusKey === "in_progress",
);
if (actionableRows.length !== 51) {
  throw new Error(`Expected 51 actionable rows, got ${actionableRows.length}`);
}
const oosRows = fullRows.filter((r) => r.statusKey === "out_of_scope");
if (oosRows.length !== 28) {
  throw new Error(`Expected 28 out-of-scope rows, got ${oosRows.length}`);
}

const clusterCounts = new Map<ClusterKey, number>();
const clusterMembers = new Map<ClusterKey, number[]>();
for (const r of actionableRows) {
  clusterCounts.set(r.cluster, (clusterCounts.get(r.cluster) ?? 0) + 1);
  if (!clusterMembers.has(r.cluster)) clusterMembers.set(r.cluster, []);
  clusterMembers.get(r.cluster)!.push(r.itemNum);
}

// ---- Per-row Proposed fix, Effort, ETA, Priority -----------------------
type Manual = {
  fix: string;
  effort: "S" | "M" | "L" | "XL" | "XXL";
  eta: EtaBucket;
  priority?: Priority; // optional override; otherwise computed.
};

// Highest-traffic pages for the P1 rule.
const HIGH_TRAFFIC_PAGES = new Set(
  [
    "/projects/proj-1",
    "/projects/proj-2",
    "/projects/proj-1/report",
    "/projects/proj-2/report",
    "/projects/proj-1776983841174",
    "/projects/proj-1776983841174/report",
    "/calculator",
    "/ai",
    "/dashboard",
  ].map((p) => p.toLowerCase()),
);

function isBugLike(quote: string, topic: string): boolean {
  const q = quote.toLowerCase();
  if (topic === "Bug report (Reporte de bug)") return true;
  return /no me deja|no me lo|no me|deformad|broken|roto|no funciona|no aparece|no encuentro/.test(q);
}

function computePriority(row: FullRow, clusterSize: number): Priority {
  if (row.statusKey === "in_progress") return "P1";
  if (isBugLike(row.quote, row.topic)) return "P0";
  // The "Other / cross-cutting" bucket is a catch-all of unrelated items
  // (navigation, audit log, copy tweaks). Those are not a repeated theme, so
  // they should not benefit from cluster-size-driven priority inflation —
  // treat each as a singleton for ranking purposes.
  const effectiveSize =
    row.cluster === "Other / cross-cutting" ? 1 : clusterSize;
  if (effectiveSize >= 5) return "P0";
  if (effectiveSize >= 3) return "P1";
  if (HIGH_TRAFFIC_PAGES.has(row.page.toLowerCase()) && effectiveSize <= 2) {
    if (effectiveSize === 1) return "P1";
  }
  if (effectiveSize === 2) return "P2";
  return "P3";
}

// Per-item Proposed fix / Effort / ETA. Keyed by the report's Item # (= inbox position).
// Covers exactly the 51 actionable items (45 Pending + 6 In progress).
const MANUAL: Record<number, Manual> = {
  // ---- /materials ----
  2: { fix: "Add an 'AÑADIR MATERIALES' (Add Materials) button at the top of the materials library page.", effort: "S", eta: "≤ 1 day" },
  35: { fix: "On the materials page, accept the contractor's last 3 receipts and update the labor-rate list automatically.", effort: "L", eta: "1 week" },
  52: { fix: "Switch the labor model from hourly to lump-sum so the calculator matches Jorge's report — restructure the labor tabs accordingly.", effort: "L", eta: "1 week" },
  // ---- /projects/proj-1/report ----
  3: { fix: "Add a light-mode option for the project report (default the background to white) so it reads cleanly when shared.", effort: "M", eta: "2–3 days" },
  66: { fix: "Add an editable management-fee field in the calculator and feed it through to the client report.", effort: "M", eta: "2–3 days" },
  67: { fix: "Restructure the client view of the report to show categories instead of the raw BOM.", effort: "M", eta: "2–3 days" },
  91: { fix: "Embed the 'Client Punch list' (with photo links) and the 'Contractor Monitoring' narrative on the report so the client sees both.", effort: "L", eta: "1 week" },
  92: { fix: "Re-key the client-report categories so they match the team's spreadsheet one-to-one (single source of truth).", effort: "L", eta: "1 week" },
  93: { fix: "Add a phase pie-chart vs. budget visualization to the project report (mirroring the punchlist phase chart).", effort: "M", eta: "2–3 days" },
  94: { fix: "Drop the numeric prefix from the macro phases on the report so they no longer collide with the construction-phase numbering.", effort: "S", eta: "≤ 1 day" },
  95: { fix: "Rename the 'weather status' label on the report header to the agreed copy.", effort: "S", eta: "≤ 1 day" },
  97: { fix: "Increase the report logo size and tighten the header layout so it doesn't look squashed.", effort: "S", eta: "≤ 1 day" },
  98: { fix: "Repaint the report from solid black to the KONTi brand palette (Excel reference) for a softer client-facing look.", effort: "S", eta: "≤ 1 day" },
  // ---- /projects/proj-1 ----
  4: { fix: "Add a Photos & Notes section inside the project page (upload, comment, link from the report).", effort: "L", eta: "1 week" },
  7: { fix: "Add a client-action audit log on the project page (who did what and when).", effort: "L", eta: "1 week" },
  11: { fix: "Group project documents into 'Contratos' and 'Acuerdos de compra' categories (today the list is flat).", effort: "M", eta: "2–3 days" },
  12: { fix: "Rename the timeline label on the project page to 'Cronograma del proyecto'.", effort: "S", eta: "≤ 1 day" },
  14: { fix: "Add a Photos & Comments block to the project detail view alongside the existing tabs.", effort: "L", eta: "1 week" },
  15: { fix: "Expand the contractor-monitoring report to surface delays, weather, issues, changes, breaches, and rework.", effort: "L", eta: "1 week" },
  16: { fix: "Add client-side document upload (or document where the client can upload), since today only the team uploads.", effort: "L", eta: "1 week" },
  17: { fix: "Add a 'Gastos no facturables' (non-billable expenses) tab to the project finances panel.", effort: "M", eta: "2–3 days" },
  18: { fix: "Soften the dark-gray header on the project page to the KONTi brand gray (per the brand-asset folder).", effort: "S", eta: "≤ 1 day" },
  19: { fix: "Add per-invoice columns to the client invoices view (total, paid, balance, status).", effort: "M", eta: "2–3 days" },
  20: { fix: "Make phone, postal address, and physical address editable in the client configuration screen.", effort: "S", eta: "≤ 1 day" },
  21: { fix: "Persist KONTi-side receipts across server restarts and cross-check them against the report (continuation of #22).", effort: "L", eta: "1 week", priority: "P1" },
  23: { fix: "Make the photo/notes gallery self-administrable so the team can upload images directly without engineering help.", effort: "L", eta: "1 week" },
  26: { fix: "Keep only the latest version of each document downloadable, but expose a read-only version history alongside it.", effort: "M", eta: "2–3 days" },
  27: { fix: "Add a per-document/per-section 'visible to client' toggle so the team controls exactly what the client sees.", effort: "L", eta: "1 week" },
  // ---- /projects/proj-2/report ----
  8: { fix: "Make report dates editable and list every previously generated report alongside the page for re-download/print (Task #29 underway).", effort: "L", eta: "1 week", priority: "P1" },
  // ---- /dashboard ----
  5: { fix: "Make the activity-feed entries clickable so they deep-link to the related project / activity detail.", effort: "M", eta: "2–3 days" },
  48: { fix: "Restructure the dashboard to show only Active Projects + Recent Activity, and move the aggregated stats into each project page (#18 covers the construction-status card portion).", effort: "L", eta: "1 week", priority: "P1" },
  // ---- /calculator ----
  34: { fix: "Accept the team's report-template upload and render the calculator output in that exact format.", effort: "M", eta: "2–3 days" },
  53: { fix: "Build a CSV import endpoint that translates the team's estimating-sheet column names into the calculator's schema (so imports stop coming in 'medio algarete').", effort: "M", eta: "2–3 days" },
  55: { fix: "Re-label the 'contractor calculator' fields as 'Project Information' (bathrooms, sq ft, contingency, margin, kitchens, etc.) so the model matches the team's mental model.", effort: "M", eta: "2–3 days" },
  56: { fix: "Show the calculator output with the team's full estimate sections (design costs, permits, taxes & gov fees, summaries) — today key sections are missing.", effort: "L", eta: "1 week" },
  57: { fix: "Auto-populate every imported material in the calculator (today the team thinks they have to pick one-by-one after import).", effort: "M", eta: "2–3 days" },
  58: { fix: "Replace the ambiguous 'effective' column header with a self-explanatory label (or add a tooltip explaining what it means).", effort: "S", eta: "≤ 1 day" },
  59: { fix: "Make base price and quantity editable inline in the calculator line-item table.", effort: "M", eta: "2–3 days" },
  // ---- /calculator?projectId=proj-1&tab=variance ----
  49: { fix: "Surface the receipts-upload entry point on the dashboard (today Naino has to dig through /calculator?tab=variance to upload + categorize them).", effort: "M", eta: "2–3 days" },
  69: { fix: "Add a site-photos importer for the weekly report and punchlist with categories (process photos = internal, punchlist photos = client-visible).", effort: "L", eta: "1 week" },
  // ---- /team ----
  61: { fix: "Add an upload flow for new contractor records so the directory grows beyond platform users.", effort: "M", eta: "2–3 days" },
  // ---- /ai ----
  40: { fix: "Auto-summarize the client's chat questions and persist them as project notes (Task #23 shipped UI; #30 schedules persistence).", effort: "L", eta: "1 week", priority: "P1" },
  43: { fix: "Promote the punchlist as the formal phase-advance gate and persist it across restarts (Task #25 shipped gate; #32 schedules persistence).", effort: "L", eta: "1 week", priority: "P1" },
  // ---- /leads ----
  74: { fix: "Add an inline legend on the leads list explaining what each score means (e.g., temperature, BANT components).", effort: "S", eta: "≤ 1 day" },
  // ---- /projects/proj-1776983841174 (newer demo project) ----
  76: { fix: "Default 'private' notes/documents to team-only and never expose them to the client (overlaps with #27).", effort: "S", eta: "≤ 1 day" },
  79: { fix: "Align the punchlist categories/items with the team's 'Client Punch list' spreadsheet and surface Drive photo links so the client can browse without visiting the site.", effort: "L", eta: "1 week" },
  80: { fix: "Add a document categorization picker on upload (permits, punchlist, drawings, etc.).", effort: "M", eta: "2–3 days" },
  82: { fix: "Investigate why upload fails on the demo project ('no me deja upload nada') and fix the regression.", effort: "M", eta: "2–3 days", priority: "P0" },
  // ---- /permits ----
  87: { fix: "Rename the permits header to 'Permit Documentation'.", effort: "S", eta: "≤ 1 day" },
  88: { fix: "Split the permits view by permit type (PCOC, USO, Consulta de Ubicación, etc.) to mirror the team's spreadsheet.", effort: "M", eta: "2–3 days" },
  89: { fix: "Surface the legal/engineer header (project legal data + engineers of record) at the top of the permits view so the team can fill it in.", effort: "M", eta: "2–3 days" },
};

// ---- Out-of-scope deferred notes (one line each, keyed by Item #) ------
const OOS_DEFER_NOTE: Record<number, string> = {
  13: "Parallel-phase visualization — needs design walkthrough; current model assumes serial phases.",
  22: "'Update once a week' — process expectation, not a product change.",
  24: "Asana sync request — defer until the integration plan is approved.",
  25: "Drive as the canonical document store — third-party integration (Drive API, auth, mirroring rules) needs scoping.",
  47: "Demo-video recording — operations request, not a product change.",
  50: "Variance-tab purpose unclear — needs walkthrough to confirm intent.",
  51: "Variance-tab purpose unclear — needs walkthrough to confirm intent.",
  54: "Workflow ('we fill the template, you build it?') needs a walkthrough before scoping.",
  60: "Single shared calculator with per-project copies — large data-model change; needs design walkthrough.",
  62: "Asana sync question for the project page — defer until integration plan is approved.",
  63: "Copy clarification ('what does this mean?') — needs walkthrough to identify which element.",
  64: "Client-view vs. KONTi-view question on the report — already supports both; needs walkthrough to confirm closed.",
  65: "Source-of-categories question on the report — needs walkthrough to confirm closed.",
  68: "'Is this page the punchlist?' — needs walkthrough to confirm intent.",
  70: "Scope of the AI assistant (KONTi-only vs. client-facing) — product decision needed.",
  71: "Where info-requests get sent to the client — workflow decision needed.",
  72: "AI assistant for change orders / material specs — workflow decision needed.",
  73: "Leads page purpose (CRM vs. Asana mirror) — product decision needed.",
  75: "Asana mirror confirmed — defer until Asana integration scope is approved.",
  77: "Zoning-based calculator unclear — needs walkthrough to confirm intent.",
  78: "Punchlist 'special items' question — needs walkthrough to confirm intent.",
  81: "Auto-email on signature request — depends on the notifications integration plan; defer.",
  83: "'Pick each material individually?' — overlaps with #57 import auto-populate; revisit after that lands.",
  84: "Drive-permits read — depends on the Drive integration; defer.",
  85: "Signature source / Drive read for permits — depends on Drive + signatures integration; defer.",
  86: "Final-document hand-off and download flow for permits — needs walkthrough.",
  90: "Client-instructions section on the report — needs walkthrough to confirm intent.",
  96: "Asana-read question for the report — defer until the integration plan is approved.",
};

// Fill any missing OOS notes with a generic placeholder so the sheet is dense.
for (const r of oosRows) {
  if (!OOS_DEFER_NOTE[r.itemNum]) {
    OOS_DEFER_NOTE[r.itemNum] = "Deferred — needs a walkthrough to confirm intent and scope.";
  }
}

// ---- Compose the Priorities sheet rows ---------------------------------
type PriRow = {
  num: number;
  priority: Priority;
  status: string;
  page: string;
  topic: string;
  cluster: ClusterKey;
  repetition: number;
  quote: string;
  fix: string;
  effort: string;
  eta: EtaBucket;
  refs: string;
};

const ETA_DAYS: Record<EtaBucket, number> = {
  "≤ 1 day": 1,
  "2–3 days": 3,
  "1 week": 5,
  "2 weeks": 10,
  "3+ weeks": 15,
};

const ETA_ORDER: EtaBucket[] = [
  "≤ 1 day",
  "2–3 days",
  "1 week",
  "2 weeks",
  "3+ weeks",
];

const PRIORITY_FILL: Record<Priority, string> = {
  P0: "FFC0392B", // red
  P1: "FFE67E22", // orange
  P2: "FFF1C40F", // yellow
  P3: "FFBDC3C7", // grey
};

// Verbatim status labels — these are the exact strings used by the Item card
// headings in feedback-vs-changelog.md.
const STATUS_LABEL_SHORT: Record<ReportRow["statusKey"], string> = {
  completed: "✅ Completed (Completado)",
  in_progress: "🟡 In progress / scheduled (En progreso / programado)",
  pending: "⏳ Pending (Pendiente)",
  out_of_scope: "🚧 Out of scope (Fuera de alcance)",
};

// Page values in the source report use the full URL form (e.g.
// `https://konti-demo.replit.app/projects/proj-1`). Inbox items only carry the
// pathname, so prefix the base host to keep the Page column verbatim with the
// report's "By page" headings.
const PAGE_BASE = "https://konti-demo.replit.app";
function fullPageUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return PAGE_BASE + path;
}

const priRows: PriRow[] = [];
for (const r of actionableRows) {
  const m = MANUAL[r.itemNum];
  if (!m) {
    throw new Error(
      `Missing manual fix/effort/ETA for actionable Item ${r.itemNum}: "${r.quote.slice(0, 60)}…"`,
    );
  }
  const clusterSize = clusterCounts.get(r.cluster) ?? 1;
  const priority = m.priority ?? computePriority(r, clusterSize);
  priRows.push({
    num: r.itemNum,
    priority,
    status: STATUS_LABEL_SHORT[r.statusKey],
    page: fullPageUrl(r.page),
    topic: r.topic,
    cluster: r.cluster,
    repetition: clusterSize,
    quote: r.quote,
    fix: m.fix,
    effort: m.effort,
    eta: m.eta,
    refs: r.refs,
  });
}

// Sort: P0→P3, then by repetition desc, then by item #.
const PRI_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
priRows.sort(
  (a, b) =>
    PRI_ORDER[a.priority] - PRI_ORDER[b.priority] ||
    b.repetition - a.repetition ||
    a.num - b.num,
);

// ---- Workbook ----------------------------------------------------------
const wb = new ExcelJS.Workbook();
wb.creator = "KONTi Dashboard tooling";
wb.created = new Date();

const HEADER_FILL = "FF1F2D3D";
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;
const ALT_ROW_FILL = "FFF5F7FA";

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  row.height = 32;
}

// 1. Priorities sheet
const sPri = wb.addWorksheet("Priorities (Prioridades)", {
  views: [{ state: "frozen", ySplit: 1 }],
});
const PRI_HEADERS = [
  ["#", 6],
  ["Priority (Prioridad)", 14],
  ["Status (Estado)", 24],
  ["Page (Página)", 36],
  ["Topic (Tema)", 22],
  ["Cluster (Grupo)", 26],
  ["Repetition n (Repetición)", 14],
  ["Quote — verbatim (Cita textual)", 60],
  ["Proposed fix (Solución propuesta)", 60],
  ["Effort (Esfuerzo)", 12],
  ["ETA bucket (Bucket ETA)", 14],
  ["Linked task ref (Tarea ligada)", 22],
] as const;
sPri.columns = PRI_HEADERS.map(([h, w]) => ({
  header: h,
  width: w,
}));
styleHeader(sPri.getRow(1));
for (const r of priRows) {
  sPri.addRow([
    r.num,
    r.priority,
    r.status,
    r.page,
    r.topic,
    r.cluster,
    r.repetition,
    r.quote,
    r.fix,
    r.effort,
    r.eta,
    r.refs,
  ]);
}
sPri.eachRow((row, rowNum) => {
  if (rowNum === 1) return;
  const priCell = row.getCell(2);
  const pri = String(priCell.value) as Priority;
  if (PRIORITY_FILL[pri]) {
    priCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIORITY_FILL[pri] } };
    priCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    priCell.alignment = { horizontal: "center", vertical: "middle" };
  }
  if (rowNum % 2 === 0) {
    row.eachCell((cell, colNum) => {
      if (colNum === 2) return; // keep priority fill
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_FILL } };
    });
  }
  row.eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: "top", wrapText: true };
  });
  row.height = Math.max(28, Math.min(120, Math.ceil(String(row.getCell(8).value ?? "").length / 70) * 14 + 28));
});
sPri.autoFilter = { from: { row: 1, column: 1 }, to: { row: priRows.length + 1, column: PRI_HEADERS.length } };

// 2. Clusters sheet
const sCl = wb.addWorksheet("Clusters (Repetición)", {
  views: [{ state: "frozen", ySplit: 1 }],
});
sCl.columns = [
  { header: "Cluster (Grupo)", width: 28 },
  { header: "# of items (Cantidad)", width: 14 },
  { header: "Member item #s (Ítems miembros)", width: 50 },
  { header: "Highest priority (Prioridad máxima)", width: 18 },
  { header: "Recommended track (Vía recomendada)", width: 60 },
];
styleHeader(sCl.getRow(1));
const RECOMMENDED_TRACK: Record<ClusterKey, string> = {
  "Client view / portal":
    "Carve out a dedicated 'Client Portal' epic — a single, opinionated client view with controlled visibility, uploads, and per-section toggles.",
  "Project creation / phases":
    "Group the project-page enhancements (phase parallelism, sub-phases, naming, photos) into one project-detail polish pass.",
  "Calculator / estimating":
    "Treat the calculator as a master template (categories, units, labor, contractor side, report format) and ship in one focused sprint.",
  "Site photos / gallery":
    "Build a self-administrable gallery (upload, captions, links from report) — single feature, single owner.",
  "AI assistant":
    "Polish the assistant's output rendering and persist client-question notes (already in motion via #23/#30).",
  "Variance / cost tracking":
    "Add per-category variance + inline edits on the variance tab.",
  "Permits / OGPe":
    "Refresh the permits page (legal header, per-type split, design subsection) in a single visual pass.",
  "Notifications / status":
    "Add a notifications popup for the client and tie it into the construction-status changes.",
  "Mobile / responsive":
    "Continue the mobile audit (already tracked) for project detail panels and modals.",
  "PDF report export":
    "Ship the saved-report-template work (Task #29) and add re-download history on the report page.",
  "Branding / logo":
    "Single design pass: logo size, brand grays, light mode, palette consistency across report + project pages.",
  "Documents / files":
    "Add categories (Contratos / Acuerdos), client-side upload, and version history; defer Drive integration.",
  "Team directory":
    "Quick copy fix (rename to Nainoshka) — bundle with any next team-page change.",
  "Materials library":
    "Add 'Add Material' affordance + price history per material.",
  "Leads intake":
    "Tighten the leads list copy to read as a pipeline.",
  "Other / cross-cutting":
    "Triage individually — each item is a small, isolated change.",
};
const sortedClusters: ClusterKey[] = Array.from(clusterCounts.keys()).sort(
  (a, b) => (clusterCounts.get(b) ?? 0) - (clusterCounts.get(a) ?? 0) || a.localeCompare(b),
);
for (const c of sortedClusters) {
  const members = clusterMembers.get(c) ?? [];
  const highest = priRows
    .filter((r) => r.cluster === c)
    .reduce<Priority>((acc, r) => (PRI_ORDER[r.priority] < PRI_ORDER[acc] ? r.priority : acc), "P3");
  sCl.addRow([
    c,
    clusterCounts.get(c) ?? 0,
    members.sort((a, b) => a - b).join(", "),
    highest,
    RECOMMENDED_TRACK[c],
  ]);
}
sCl.eachRow((row, rowNum) => {
  if (rowNum === 1) return;
  row.eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: "top", wrapText: true };
  });
  row.height = 36;
});

// 3. Roadmap sheet
const sRm = wb.addWorksheet("Roadmap (Hoja de Ruta)", {
  views: [{ state: "frozen", ySplit: 1 }],
});
sRm.columns = [
  { header: "ETA bucket (Bucket ETA)", width: 18 },
  { header: "# of items (Cantidad)", width: 14 },
  { header: "Estimated days (Días estimados)", width: 18 },
  { header: "Cumulative days (Días acumulados)", width: 20 },
  { header: "Item #s in bucket (Ítems en bucket)", width: 60 },
  { header: "Highest priority (Prioridad máxima)", width: 18 },
];
styleHeader(sRm.getRow(1));
let cumulative = 0;
for (const bucket of ETA_ORDER) {
  const inBucket = priRows.filter((r) => r.eta === bucket);
  if (inBucket.length === 0) continue;
  const days = inBucket.length * ETA_DAYS[bucket];
  cumulative += days;
  const highest = inBucket.reduce<Priority>(
    (acc, r) => (PRI_ORDER[r.priority] < PRI_ORDER[acc] ? r.priority : acc),
    "P3",
  );
  sRm.addRow([
    bucket,
    inBucket.length,
    days,
    cumulative,
    inBucket.map((r) => r.num).sort((a, b) => a - b).join(", "),
    highest,
  ]);
}
sRm.eachRow((row, rowNum) => {
  if (rowNum === 1) return;
  row.eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: "top", wrapText: true };
  });
  row.height = 30;
});

// 4. Out-of-scope deferred sheet
// Excel caps worksheet names at 31 characters; the bilingual long form
// ("Out-of-scope deferred (Fuera de alcance)" = 40 chars) does not fit, so
// "OOS deferred" stands in for "Out-of-scope deferred" in the tab label.
const sOos = wb.addWorksheet("OOS deferred (Fuera de alcance)", {
  views: [{ state: "frozen", ySplit: 1 }],
});
sOos.columns = [
  { header: "#", width: 6 },
  { header: "Page (Página)", width: 36 },
  { header: "Topic (Tema)", width: 22 },
  { header: "Quote — verbatim (Cita textual)", width: 60 },
  { header: "Why deferred (Por qué se difiere)", width: 60 },
  { header: "Linked task ref (Tarea ligada)", width: 22 },
];
styleHeader(sOos.getRow(1));
for (const r of [...oosRows].sort((a, b) => a.itemNum - b.itemNum)) {
  sOos.addRow([
    r.itemNum,
    fullPageUrl(r.page),
    r.topic,
    r.quote,
    OOS_DEFER_NOTE[r.itemNum],
    r.refs,
  ]);
}
sOos.eachRow((row, rowNum) => {
  if (rowNum === 1) return;
  row.eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: "top", wrapText: true };
  });
  row.height = Math.max(28, Math.min(120, Math.ceil(String(row.getCell(4).value ?? "").length / 70) * 14 + 24));
});

// 5. Methodology sheet
const sMe = wb.addWorksheet("Methodology (Metodología)");
sMe.columns = [
  { header: "Section (Sección)", width: 32 },
  { header: "Detail (Detalle)", width: 110 },
];
styleHeader(sMe.getRow(1));
const METHODOLOGY: Array<[string, string]> = [
  [
    "Source (Fuente)",
    "Built from the 98-item KONTi feedback inbox and the existing report at attached_assets/reports/feedback-vs-changelog.md. Status, page, refs, and quote are reused verbatim from the inbox and report — this workbook does not re-classify them.",
  ],
  [
    "Scope (Alcance)",
    "The Priorities sheet covers every actionable item (45 Pending + 6 In progress = 51 rows). The 19 Completed items are intentionally not re-listed; see the existing report's Completed appendix. The 28 Out-of-scope items are kept on their own sheet so nothing is lost.",
  ],
  [
    "Priority rubric (Rúbrica de prioridad)",
    "P0 — Critical: confirmed bug reports, broken core flows, or items in a cluster of size ≥ 5. P1 — High: items already In progress, single items on a high-traffic page (Project Detail, Calculator, AI, Dashboard, Report), or cluster size 3–4. P2 — Medium: cluster size 2. P3 — Low: cluster size 1 outside critical paths.",
  ],
  [
    "Repetition counting (Conteo de repetición)",
    "Two-pass: a keyword/page heuristic groups items into clusters (Client view / portal, Calculator, Site photos, etc.); a manual review pass re-buckets the obvious mis-classifications. The cluster size is the count of *actionable* items (Pending + In progress) in the cluster — Out-of-scope items are not counted toward cluster repetition.",
  ],
  [
    "ETA buckets (Buckets ETA)",
    "≤ 1 day (1d): copy / labels / small CSS. 2–3 days (3d): single-component refactor or small UI feature. 1 week (5d): page-level feature or small backend route. 2 weeks (10d): feature spanning multiple pages or new persistence. 3+ weeks (15d+): new module (Client Portal, Calculator master template).",
  ],
  [
    "Roadmap totals (Totales de hoja de ruta)",
    "The Roadmap sheet multiplies the bucket count by its representative day-cost (1, 3, 5, 10, 15) so the team has a back-of-envelope estimate per bucket and a cumulative-days column to scope a sprint.",
  ],
  [
    "Quotes (Citas)",
    "All quotes are preserved verbatim — Spanish stays Spanish, English stays English. Item numbers match the existing report's per-item cards (Item 1 = oldest by creation time; Item 98 = newest).",
  ],
  [
    "Out of scope (Fuera de alcance)",
    "Doing the actual fixes — this workbook is the prioritized plan only. Editing inbox state. Replacing the existing feedback-vs-changelog report. Re-generating the PDF report (already delivered).",
  ],
  [
    "How to use (Cómo usar)",
    "(1) Filter the Priorities sheet by Priority + ETA bucket to scope the next sprint. (2) Open the Clusters sheet to spot the largest themes. (3) Use the Roadmap sheet to commit a sprint by cumulative days. (4) Keep the Out-of-scope sheet visible so deferred items get walked through later.",
  ],
];
for (const [k, v] of METHODOLOGY) {
  const row = sMe.addRow([k, v]);
  row.height = Math.max(36, Math.ceil(v.length / 95) * 18 + 18);
  row.eachCell((cell) => {
    cell.alignment = { vertical: "top", wrapText: true };
  });
  row.getCell(1).font = { bold: true };
}

// ---- Write outputs -----------------------------------------------------
const outDir = resolve(ROOT, "attached_assets/reports");
mkdirSync(outDir, { recursive: true });
const xlsxPath = resolve(outDir, "critical-feedback-priorities.xlsx");
const csvPath = resolve(outDir, "critical-feedback-priorities.csv");

await wb.xlsx.writeFile(xlsxPath);

// CSV of the Priorities sheet (manual — exceljs CSV stringifier would re-open the workbook).
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
const csvHeader = PRI_HEADERS.map(([h]) => csvCell(h)).join(",");
const csvBody = priRows
  .map((r) =>
    [
      r.num,
      r.priority,
      r.status,
      r.page,
      r.topic,
      r.cluster,
      r.repetition,
      r.quote,
      r.fix,
      r.effort,
      r.eta,
      r.refs,
    ]
      .map(csvCell)
      .join(","),
  )
  .join("\n");
writeFileSync(csvPath, `${csvHeader}\n${csvBody}\n`, "utf8");

// ---- Self-check --------------------------------------------------------
const checks: string[] = [];
checks.push(`Priorities rows: ${priRows.length} (expected 51)`);
checks.push(`Out-of-scope rows: ${oosRows.length} (expected 28)`);
const dupes = priRows.filter((r, i, arr) => arr.findIndex((x) => x.num === r.num) !== i);
checks.push(`Duplicate item #s on Priorities: ${dupes.length} (expected 0)`);
const missingFix = priRows.filter((r) => !r.fix?.trim()).map((r) => r.num);
checks.push(`Rows missing Proposed fix: ${missingFix.length} (expected 0) ${missingFix.join(",")}`);
const missingEta = priRows.filter((r) => !r.eta).map((r) => r.num);
checks.push(`Rows missing ETA: ${missingEta.length} (expected 0) ${missingEta.join(",")}`);
const priCount = priRows.reduce<Record<string, number>>((a, r) => {
  a[r.priority] = (a[r.priority] ?? 0) + 1;
  return a;
}, {});
checks.push(`Priority distribution: ${JSON.stringify(priCount)}`);
checks.push(`Cluster distribution: ${JSON.stringify(Object.fromEntries(clusterCounts))}`);
checks.push(`xlsx: ${xlsxPath}`);
checks.push(`csv: ${csvPath}`);
console.log(checks.join("\n"));
