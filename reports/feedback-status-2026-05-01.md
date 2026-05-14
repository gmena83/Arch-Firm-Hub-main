# KONTi Dashboard — Feedback Status Report

  **Snapshot date:** May 1, 2026
  **Source workbook:** `attached_assets/KONTi_Dashboard_Feedback_Consolidated_v3_addressed.xlsx`
  **Prior snapshot:** `reports/feedback-status-reconciled.md` (Apr 30, 2026)

  ---

  ## At a glance

  | Bucket | Count | Notes |
  |---|---:|---|
  | ✅ **Fixed (Done)** | **42** | 41 closed and verified + 1 awaiting PM eyes-on (A-11). |
  | 📦 **Out of scope — V2 backlog** | **10** | 5 still Open (deferred), 5 awaiting product decision before any work. |
  | ⏳ **Pending — V1 in scope** | **5** | 3 Open + 2 Needs Decision. These are the only items that block calling V1 "feature-complete." |
  | **Total V1+V2 items tracked** | **57** | Plus inbox items #64 (file removal in upload dialog) and #122 (report bucket alignment + brand palette deepening) — already merged. |

  **V1 GA gate:** ship the 3 Open V1 items (B-02, C-01, I-04) and resolve the 2 V1 Needs-Decision items (A-10, H-02). Everything else is either Done, or scoped to V2.

  ---

  ## ⏳ Pending — V1 in scope (prioritise here first)

  These five items are the only things between the current build and a clean V1 sign-off. Urgency reflects how much they block the V1 GA story; complexity reflects engineering scope.

  | ID | Area | Issue | Urgency | Complexity | Notes |
  |---|---|---|---|---|---|
  | **B-02** | Cost Calculator > Labor Model | Labor today is hourly; the team works on lump-sum (suma alzada) contracts. Calculator must support both. | 🔴 **High** | 🟡 **Medium** | Schema + UI toggle. Touches calculator, contractor estimate, variance, and PDF export. Coordinate with Task #121 (B-05 contractor/project split) so the seam is clean. |
  | **C-01** | Project Report > Punchlist | Report's punchlist must match the team's "Client Punch List" Excel: categories, items, Drive photo links, contractor monitoring data. | 🔴 **High** | 🟡 **Medium** | Photo persistence already shipped (#105). Remaining work: align categories with the team's spreadsheet, surface Drive photo links inline, and join the punchlist rollup into the report. |
  | **I-04** | Demo Project > Client Notifications | No auto-email to clients when documents need their signature (and team gets no email when client signs). | 🟠 **Medium** | 🟠 **Medium-High** | Plan exists as inbox task "Email both sides of the signature handoff." Needs a mailer module wired through an integration (preferred) plus dedupe/failure isolation/activity-log plumbing. |
  | **A-10** | Project Detail > Phases / Timeline | Parallel phases not supported; timeline assumes strictly sequential phases. | 🟡 **Medium** *(decision-blocked)* | 🔴 **High** | **Decision needed first.** Real engineering scope is large (data model + Gantt-style UI). Until product confirms parallel phases are V1, leave queued. |
  | **H-02** | Leads / CRM > Page Purpose | Users confused whether the Leads page is a CRM or a mirror of Asana. | 🟢 **Low** *(clarification)* | 🟢 **Low** | Likely just copy + a help tooltip + (optionally) a hidden "View in Asana" link. ~2-hour task once product picks the framing. Not a code blocker. |

  ### Recommended sequencing for V1 close-out

  1. **Knock out the cheap Needs-Decision items first** — H-02 needs only a product call and a copy update. Resolve in the next planning meeting; assign to the next polish bundle.
  2. **Park A-10 explicitly** — write a one-line "V1.1 candidate, blocked on product" note so it stops drawing attention every backlog grooming.
  3. **Parallel-track B-02 and C-01** — both are mid-complexity, mostly isolated (calculator vs. report), and can be picked up by separate engineers.
  4. **Schedule I-04 last but allocate a real sprint for it** — the mailer plumbing is small, but you need to budget for transactional email infra setup, secrets, and a soak window before going to real client inboxes.

  ---

  ## 📦 Out of scope — V2 backlog

  These are intentionally deferred to V2. Listed here with the same urgency/complexity labels so when V2 planning kicks off you can size resources directly off this table without re-reading the workbook.

  ### V2 — Open (deferred, no blocker)

  | ID | Area | Issue | Urgency (V2) | Complexity | Notes |
  |---|---|---|---|---|---|
  | **A-02** | Project Detail > Financials | No "Gastos no facturables" (non-billable expenses) tab. | 🟠 Medium | 🟡 Medium | New tab + simple CRUD; needs a category taxonomy decision. |
  | **A-05** | Project Detail > Documents | No version history; only the latest file is accessible. | 🟠 Medium | 🔴 High | Touches storage layer, upload pipeline, UI, retention policy. Real V2-sized feature. |
  | **A-09** | Project Detail > Client Settings | Clients cannot self-administer their own images/media. | 🟡 Medium-Low | 🟡 Medium | Partial slice already shipped via #64 (clients can delete files they uploaded inside the dialog). Remaining: out-of-dialog gallery management + caption editing. |
  | **A-12** | Project Detail > Client Audit Log | No audit log of client actions. | 🟡 Medium-Low | 🟡 Medium | Admin-side audit log already shipped (#73). Remaining: scope to client actions + a reader view. |
  | **B-14** | Cost Calculator > Labor Rates | Labor rates do not auto-update from the last 3 uploaded receipts. | 🟢 Low | 🟡 Medium | Nice-to-have automation; depends on B-02 (labor model) shipping first. |

  ### V2 — Needs Decision (no work until product clarifies)

  | ID | Area | Issue | Urgency (V2) | Complexity | Notes |
  |---|---|---|---|---|---|
  | **D-02** | AI Assistant > Change Orders | Unclear whether AI assistant is the channel for change orders / material specs. | 🟢 Low | 🟡 TBD | Product framing question; minimal code until decided. |
  | **E-04** | Permits > Document Distribution | Unclear how approved permit docs are distributed (Drive sync? client download?). | 🟠 Medium | 🟠 Medium-High | Tied to J-01 (Drive integration). Resolve them together. |
  | **E-05** | Permits > Signature & Upload Flow | Unclear how permit docs requiring client signatures are uploaded/processed. | 🟠 Medium | 🔴 High | Overlaps with I-04 (signature email infra) — could share the mailer + signature-token plumbing if both ship in V2. |
  | **H-03** | Leads / CRM > Asana Integration | Unclear how accepting a CRM proposal creates a templated Asana project. | 🟡 Medium-Low | 🔴 High | Depends on whether the team keeps Asana long-term (see H-02). Re-evaluate after H-02 is decided. |
  | **J-01** | Drive Integration > Data Storage | Users expect project data to live in / sync with Google Drive. | 🟠 Medium | 🔴 High | Foundational V2 decision. Affects A-05 (versions), C-11 (already partial via Drive URL field), E-04, and the long-term storage strategy. |

  ---

  ## 🔍 Done — needs verification (1 item)

  | ID | Area | Issue | Why verification is suggested |
  |---|---|---|---|
  | **A-11** | Project Detail > Contractor Report | Contractor monitoring report lacked a consolidated view of delays, weather, issues, change orders, non-compliance, and rework. | Likely closed by #62 + #75 (Contractor Estimate Rollup). PM should walk through the live page and confirm every requested data point is present before promoting to plain Done. |

  ---

  ## ✅ Fixed (Done) — 41 items, grouped by area
  
### AI Assistant

| ID | Issue | Closed by |
|---|---|---|
| **D-01** | AI assistant notes and updates do not persist across server restarts. | Done in #30 (AI assistant notes/updates persist across restart). |

### Cost Calculator

| ID | Issue | Closed by |
|---|---|---|
| **B-01** | Importing the team's initial estimate CSV fails because column format does not match the calculator's expec… | Done in #75 (CSV header aliases: Description, UnitPrice, etc.). |
| **B-03** | Materials do not auto-populate from the project; all materials must be entered manually. | Done in #75 (calculator auto-populates from imported materials). |
| **B-04** | Base price and quantity fields are not editable in the calculator. | Done in #75 (inline edit + PATCH /projects/:id/calculations/:lineId persistence). |
| **B-05** | Contractor section shows project-level info (sq ft, bathrooms, contingency) instead of contractor-specific… | Done in #75 (Project Information panel with bathrooms/kitchens/margin/mgmt-fee inputs). |
| **B-06** | Calculator output does not show organized sections and summaries by category. | Done in #99 (Reviewer feedback bundle #2): calculator estimate table now groups by category with per-category subtotal cards, mirroring the team's external estimate format. |
| **B-07** | It is unclear whether the 'imports' line reflects the materials section or a separate cost category. | Done in #99 (Reviewer feedback bundle #2): renamed Imports tab to 'Imported Materials' / 'Materiales Importados' with hover tooltip describing CSV/Excel bulk import. |
| **B-08** | It is unclear what 'effective rate' means in the calculator. | Done in #75 (renamed to 'Effective Price' with tooltip + legend). |
| **B-09** | The variance tab is hard to find; users cannot easily navigate to receipts and categorize them. | Done in #99 (Reviewer feedback bundle #2): added 'Receipts & Variance' shortcut card on dashboard linking team users straight to /calculator?tab=variance. |
| **B-10** | Receipts and contractor estimates do not persist across server restarts (in-memory only). | Done in #27 (receipts and contractor estimates persist across restart). |
| **B-11** | Receipt OCR is mocked; real PDF/image extraction is not implemented. | Done in #28 (real PDF/image OCR replaces the mock). |
| **B-12** | PDF export does not use the saved report template; it generates a generic layout. | Done in #29 (PDF export now uses the saved report template). |
| **B-13** | No 'Add Material' button on the Materials Library page; it is read-only. | Done in #99 (Reviewer feedback bundle #2): Materials Library 'Add Material' button now opens a modal that POSTs a single material via the existing /api/estimating/materials/impo… |

### Dashboard

| ID | Issue | Closed by |
|---|---|---|
| **F-01** | Activity items in the dashboard feed are not clickable/linked to their detail pages. | Done in #71 (P1 quick wins: clickable activity). |
| **F-02** | Dashboard shows aggregated stats for all projects; client home should show only the construction status car… | Done in #61 (client home in client portal) and #72 (dashboard restructure). |

### Demo Project

| ID | Issue | Closed by |
|---|---|---|
| **I-01** | Uploads do not persist in the demo project; nothing saves after upload. | Done in #60 (file upload regression on the demo project fixed). |
| **I-02** | No way to categorize documents by type (permits, punchlist, drawings, etc.). | Done in #99 (Reviewer feedback bundle #2): document upload modal now requires a category dropdown so demo-project docs are sorted into the correct buckets. |
| **I-03** | Punchlist does not persist across server restarts. | Done in #32 (punchlist persists across restart). |

### Leads / CRM

| ID | Issue | Closed by |
|---|---|---|
| **H-01** | Lead score values have no explanation; users do not know what the scores mean. | Done in #99 (Reviewer feedback bundle #2): leads page now renders an inline lead-score legend (Hot / Warm / Cold / New thresholds) right next to the table. |

### Permits

| ID | Issue | Closed by |
|---|---|---|
| **E-01** | The legal/engineer header from the team's permit spreadsheet is not shown in the permits view. | Done in #106 (Permits page: legal header + split by permit type). |
| **E-02** | Permits are not separated by type (PCOC, USO, Consulta de Ubicación, etc.) as in the team's Excel. | Done in #106 (Permits page: legal header + split by permit type). |
| **E-03** | Section label reads incorrectly; should say 'Permit Documentation'. | Done in #71 (P1 quick wins: permits copy fixed). |

### Project Detail

| ID | Issue | Closed by |
|---|---|---|
| **A-01** | No per-invoice columns for client view (total amount, paid, balance, invoice status). | Done in #99 (Reviewer feedback bundle #2): project-invoices.tsx Total/Paid/Balance/Status columns now render from invoice data. |
| **A-03** | Client cannot upload files; it is unclear whether they can and in which section. | Done in #61 (client portal expansion: client uploads enabled). |
| **A-04** | Documents are flat; no 'Contratos y Acuerdos de compra' grouping exists. | Done in #63 (document organization: contracts/agreements grouping). |
| **A-06** | Team cannot control which documents are visible to the client. | Done in #61 (per-document client visibility) and reinforced by #88 (client ownership checks). |
| **A-07** | No photos, video, or photo-comment section exists inside the project. | Done in #105 (Site photos: upload, categorize, link them from the project report). |
| **A-08** | Client profile settings lack phone number, postal address, and physical address fields. | Done in #75 (ClientContactCard with phone, postal, physical addresses). |
| **A-13** | Dark gray color used in the project detail is too dark; does not match KONTi brand gray. | Done in #62 (KONTi brand pass) and #74 (header text readable on bright cover photos). |

### Project Report

| ID | Issue | Closed by |
|---|---|---|
| **C-02** | Client report shows BOM (Bill of Materials) instead of category-level summaries. | Done in #99 (Reviewer feedback bundle #2): contractor BOM detail now gated by !isClientView so client viewers only see the Cost-by-Category rollup and never the raw line items. |
| **C-03** | Phase numbers appear in the report chart; they should not show numbers. | Done in #99 (Reviewer feedback bundle #2): phase numbers no longer rendered anywhere in the project report (phase chips, timeline, donut all show labels only). |
| **C-04** | Phase chart should look like the 'phase pie chart' from the team's punchlist, not a budget chart. | Done in #99 (Reviewer feedback bundle #2): added Phase Progress donut on the project report mirroring the punchlist phase-pie style with per-phase % completion and an avg-comple… |
| **C-05** | Weather status field in the report is labeled ambiguously. | Done in #99 (Reviewer feedback bundle #2): renamed 'Site Conditions' to 'Weather Status' / 'Estado del Clima' in the report header tile and the dedicated weather section. |
| **C-06** | Client report data does not match the categories and information sent in the team's regular reports. | Done in #99 (Reviewer feedback bundle #2): Cost-by-Category card and the BOM detail are both driven from the same calc.subtotalByCategory data so totals always match. |
| **C-07** | Management fee source is unclear; users cannot edit it from the report page. | Done in #75 (mgmt fee editable from the project report; flows through to the rollup). |
| **C-08** | Report logo is too small. | Done in #71 (P1 quick wins: report logo enlarged). |
| **C-09** | Report uses an aggressive dark/black color palette that does not match the team's Excel color palette. | Done in #62 (KONTi brand pass replaced the dark/black palette). |
| **C-10** | Report dates cannot be edited; generated reports cannot be accessed side-by-side for printing/download. | Done in #99 (Reviewer feedback bundle #2): replaced auto-generated reportDate with an editable <input type='date'> in the sticky report header, persisted per project via localSt… |
| **C-11** | No place to import site photos for the weekly report and punchlist. | Done in #105 (Site photos: upload, categorize, link them from the project report — bulk upload + Drive-compatible URL field). |
| **C-12** | Report background is white; users want a white or light background option. | Done in #62 (light backgrounds across the project report). |

### Team Directory

| ID | Issue | Closed by |
|---|---|---|
| **G-01** | No way to upload new contractors/people to the team directory. | Already shipped despite V2 scope: ContractorUploadModal (single + CSV modes) in artifacts/konti-dashboard/src/pages/team.tsx (~L69-115). |


  ---

  ## 📒 Recently merged (post-reconciliation, not in workbook IDs)

  These items shipped after the original workbook was published, so they don't have V1/V2 IDs but are part of the same backlog.

  | Task | Area | What shipped | Affects |
  |---|---|---|---|
  | **#64** | Project Detail > Upload Dialog | Upload dialog stays open after success and shows a "Just uploaded" panel with thumbnails + per-file Remove button. New `DELETE /api/projects/:projectId/documents/:documentId` endpoint with ownership enforcement, optimistic UI, and `document_removed` activity entry. 10/10 API tests passing. | Partially closes the *delete-own-uploads* slice of **A-09** (still V2-tracked). |
  | **#121** | Cost Calculator > Contractor tab | Project metadata (sq m, bathrooms, kitchens, project type, contingency %) split out of the Contractor card into a read-only Project Info card backed by the canonical Project schema. | Refines **B-05** (already Done) — keeps the integration seam clean for **B-02** (lump-sum labor). |
  | **#122** | Project Report | Aligned the Cost-by-Category table with the team's 5-bucket PROJECT ESTIMATE spreadsheet (Design & Data Collection / Permits & Service Fees / Product (Containers) / Exterior & Add-Ons / Construction Contingency) including expandable trade-level sub-lines. New client-safe `GET /projects/:id/report-rollup` endpoint with ownership enforcement. Report theme tokens moved from inline JS to CSS variables under `[data-report-theme=…]` selectors driven by central KONTi brand vars (olive #4F5E2A, slate #778894, sage #A3B38C). | Deepens **C-06** and **C-09** (both already Done). |
  | **#137** | Cost Calculator > Variance | Inbox item *"Faltaria Invoice vs Actual. No necesariamente se le factura lo estimado. Necesitamos ver ambos."* — **Implemented**. The variance report on `/calculator?tab=variance` now shows three columns per bucket and per material category (Estimated / Invoiced / Actual), a third bar series in the chart, two delta pills (Actual−Invoiced as the primary signal, Actual−Estimated as secondary), and a five-up totals strip. Backend: `GET /api/projects/:id/variance-report` was extended in-place (no new endpoint) to roll up `PROJECT_INVOICES` by canonical bucket+category with an explicit "Unassigned (billed, not in cost plan)" bucket so design/closeout invoices aren't silently dropped. The headline `Δ vs Invoiced` math uses the matched-scope (in-plan only) base so totals are apples-to-apples. Client viewers continue to see the per-category rollup only. | Closes the inbox item. |
  | **#137** | Cost Calculator > i18n | Inbox item *"No me lo traduce a español."* — **Implemented**. Wrapped the remaining English literals on the calculator surface in the existing `t()` helper, including the `Remove` aria-label on contractor-estimate rows, the `DEFAULT_TEMPLATE_COLUMNS` fallback, the contractor-source default ("Preliminary project doc — site visit notes"), and the four template-form seed values in the Imports panel (name, columns, header, footer). Added a tiny lint script (`pnpm --filter @workspace/konti-dashboard run lint:translations`) that scans `pages/calculator.tsx` and `components/estimating/*.tsx` for hard-coded English string literals so future drift is caught in CI. | Closes the inbox item. |

  ---

  ## How to read the urgency / complexity labels

  **Urgency** (how much it blocks the bucket it's in — V1 GA for the pending list, V2 GA for the V2 list):
  - 🔴 **High** — blocks GA of its bucket; assign in the next sprint.
  - 🟠 **Medium** — meaningful UX gap; size it into the next 1–2 sprints.
  - 🟡 **Medium-Low** — nice to have but not blocking; pick up when capacity allows.
  - 🟢 **Low** — clarification, copy, or polish; can be batched into a polish bundle.

  **Complexity** (rough engineering scope):
  - 🟢 **Low** — under a day; copy / decision / single-file change.
  - 🟡 **Medium** — 2–5 days; touches one feature surface end-to-end.
  - 🟠 **Medium-High** — 1–2 weeks; touches multiple surfaces or needs new infra (e.g. mailer, search, persistence).
  - 🔴 **High** — 2+ weeks; cross-cutting feature, new data model, or external integration.

  ---

  ## Footnotes

  - Source rows: 57 V1+V2 items from the v3-addressed workbook. Counts in the *At a glance* table reflect post-#122 reality.
  - "Fixed" includes the 1 *Done — needs verification* row (A-11) so the headline number reflects engineering effort completed; the in-workbook breakdown still tracks A-11 separately.
  - V1 vs V2 follows the workbook's own `Scope` column. Items where engineering would be V2-sized but the *decision* is V1-relevant (A-10, H-02) are kept in the V1 pending list because product needs to call them before V1 ships.
  - This snapshot is read-only — it does not modify the workbook. The next regeneration of `reports/feedback-status-reconciled.md` (via `scripts/reconcile_feedback_status.py`) will continue to be the canonical machine-generated source.
  