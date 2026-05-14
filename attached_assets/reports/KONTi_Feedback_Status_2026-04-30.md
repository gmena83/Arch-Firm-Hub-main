# KONTi Dashboard — Feedback Status

**Snapshot:** 2026-04-30  
**Source:** `attached_assets/reports/KONTi_Dashboard_Feedback_Consolidated_v4.xlsx`  
**Previous snapshot:** 2026-04-29

## Rollup

| Metric | Count |
|---|---:|
| Total feedback items | 57 |
| V1 — In Scope | 44 |
| V2 — Out of Scope | 13 |

| Status | Count |
|---|---:|
| Done | 31 |
| In Progress | 10 |
| Open | 9 |
| Needs Decision | 7 |

---

## Fixed (Done) — 31 items

Items shipped and verified. Each entry shows the issue ID, a short title, and a one-line note about what shipped (English; full bilingual notes live in the workbook).

### Cost Calculator (8)

- **B-01** — Importing the team's initial estimate CSV fails because column format does not match the calculator's expected schema. — CSV importer now uses smart EN/ES column mapping with override dropdowns, 5-row preview, skipped-row panel, and per-project mapping memory…
- **B-04** — Base price and quantity fields are not editable in the calculator. — updateLine() in components/estimating/contractor-calculator.tsx (~L52-56) makes quantity and unitPrice inline-editable.
- **B-07** — It is unclear whether the 'imports' line reflects the materials section or a separate cost category. — Imports tab renamed to "Imported Materials" with explainer banner (data-testid="imports-explainer") clarifying that imports merge into the…
- **B-08** — It is unclear what 'effective rate' means in the calculator. — Keyboard-focusable "?" button on the labor-baseline panel (data-testid="effective-rate-tooltip") + Effective Price tooltip on calculator…
- **B-09** — The variance tab is hard to find; users cannot easily navigate to receipts and categorize them. — Variance Snapshot card on project-detail (data-testid="variance-snapshot-link") deep-links to /calculator?projectId=…&tab=variance for…
- **B-10** — Receipts and contractor estimates do not persist across server restarts (in-memory only). — Receipts persistence — PROJECT_RECEIPTS and PROJECT_REPORT_TEMPLATE now hydrate from loadJSON on boot and persist via saveJSON on every…
- **B-12** — PDF export does not use the saved report template; it generates a generic layout. — PDF report uses saved template — renderTemplateCostReport now consumes PROJECT_REPORT_TEMPLATE[project.id] so the templated…
- **B-13** — No 'Add Material' button on the Materials Library page; it is read-only. — AddMaterialModal in artifacts/konti-dashboard/src/pages/calculator.tsx (~L24-102).

### Project Detail — Casa Solar Rincón (7)

- **A-01** — No per-invoice columns for client view (total amount, paid, balance, invoice status). — Verified at artifacts/konti-dashboard/src/components/project-invoices.tsx (Total/Paid/Balance/Status columns + bilingual status badge).
- **A-03** — Client cannot upload files; it is unclear whether they can and in which section. — Client UploadModal in artifacts/konti-dashboard/src/pages/project-detail.tsx (~L138-320) with category picker.
- **A-04** — Documents are flat; no 'Contratos y Acuerdos de compra' grouping exists. — DOC_CATEGORY_OPTIONS in project-detail.tsx (~L96) includes 'contratos' and 'acuerdos_compra'.
- **A-06** — Team cannot control which documents are visible to the client. — isClientVisible flag on every document (seed.ts L436+); per-row toggle UI in project-detail.tsx (~L605-700).
- **A-07** — No photos, video, or photo-comment section exists inside the project. — Done in #105 — Photos & Media tab on project detail with bulk site-photo upload, category tags, and a per-project gallery rendered into the project report (site-photos-gallery.tsx + project-detail.tsx).
- **A-08** — Client profile settings lack phone number, postal address, and physical address fields. — phone, postalAddress, physicalAddress wired in artifacts/konti-dashboard/src/pages/settings.tsx (L15-46, L146-167).
- **A-13** — Dark gray color used in the project detail is too dark; does not match KONTi brand gray. — KONTi gray (#778894) defined in artifacts/konti-dashboard/src/index.css (L75) and consumed via konti-slate token.

### Project Report — Casa Solar Rincón (6)

- **C-03** — Phase numbers appear in the report chart; they should not show numbers. — Phase Timeline in project-report.tsx (~L387-416) renders dots/checkmarks + phase labels only — no numeric indices visible.
- **C-05** — Weather status field in the report is labeled ambiguously. — Weather card on the project report uses the label "Weather Status" (was "Weather Risk") in both Key Metrics and the dedicated weather panel.
- **C-07** — Management fee source is unclear; users cannot edit it from the report page. — Management Fee row on the project report now shows a focusable "?" tooltip with the calculation formula and an inline Edit → link to…
- **C-08** — Report logo is too small. — Report header logo bumped from h-14/16/20 to h-20/24/28 (~80/96/112 px) so it reads clearly on print and at the top of PDF exports.
- **C-11** — No place to import site photos for the weekly report and punchlist. — Site photos in report — site-photos-gallery component is rendered on the project report and PHOTO_CATEGORY_OPTIONS is wired into the…
- **C-12** — Report background is white; users want a white or light background option. — Added a "White background" preset (3rd state) to the report theme cycle (light → white → dark → light); legacy light preset retains…

### Permits (3)

- **E-01** — The legal/engineer header from the team's permit spreadsheet is not shown in the permits view. — Done in #106 — Permits page now renders the legal/engineer header block above the list, mirroring the team's spreadsheet (artifacts/konti-dashboard/src/pages/permits.tsx).
- **E-02** — Permits are not separated by type (PCOC, USO, Consulta de Ubicación, etc.) as in the team's Excel. — Done in #106 — Permits are grouped by type (PCOC, USO, Consulta de Ubicación, etc.) with separate sections per family, matching the team's permit Excel (artifacts/konti-dashboard/src/pages/permits.tsx).
- **E-03** — Section label reads incorrectly; should say 'Permit Documentation'. — Heading 'Permit Documentation' in artifacts/konti-dashboard/src/pages/permits.tsx (L34).

### Demo Project — General (2)

- **I-02** — No way to categorize documents by type (permits, punchlist, drawings, etc.). — Category dropdown in UploadModal in project-detail.tsx (~L274-288).
- **I-03** — Punchlist does not persist across server restarts. — Punchlist persistence — PROJECT_PUNCHLIST is hydrated from disk on boot and saved on every change, so punchlist entries (incl. photo…

### Leads / CRM (1)

- **H-01** — Lead score values have no explanation; users do not know what the scores mean. — SCORE_LEGEND with bilingual ranges/colors/hints in artifacts/konti-dashboard/src/pages/leads.tsx (~L57-62).

### AI Assistant (1)

- **D-01** — AI assistant notes and updates do not persist across server restarts. — AI assistant persistence — PROJECT_NOTES and SPEC_EVENTS now use the same loadJSON/saveJSON snapshot, so notes and AI spec events survive a…

### Dashboard (Inicio) (2)

- **F-01** — Activity items in the dashboard feed are not clickable/linked to their detail pages. — Activity feed items wrapped in router Link in artifacts/konti-dashboard/src/pages/dashboard.tsx (~L267-277).
- **F-02** — Dashboard shows aggregated stats for all projects; client home should show only the construction status card for their project. — isClientUser branch in dashboard.tsx (~L145-235) renders client-only project + activity feed.

### Team Directory (1)

- **G-01** — No way to upload new contractors/people to the team directory. — ContractorUploadModal (single + CSV modes) in artifacts/konti-dashboard/src/pages/team.tsx (~L69-115). NOTE: implemented despite being…

---

## Pending — 26 items

Items not yet Done, grouped by status. Each entry shows the issue ID, a short title, the area / module, and the priority.

### In Progress — 10

- **B-03** — Materials do not auto-populate from the project; all materials must be entered manually. — _Cost Calculator_ — _High_
- **B-06** — Calculator output does not show organized sections and summaries by category. — _Cost Calculator_ — _High_
- **B-11** — Receipt OCR is mocked; real PDF/image extraction is not implemented. — _Cost Calculator_ — _High_
- **I-01** — Uploads do not persist in the demo project; nothing saves after upload. — _Demo Project — General_ — _Critical_
- **I-04** — Auto-email to clients for signature requests is not implemented. — _Demo Project — General_ — _Medium_
- **A-11** — Contractor monitoring report lacks a consolidated view of delays, weather, issues, change orders, non-compliance, and rework. — _Project Detail — Casa Solar Rincón_ — _High_
- **C-01** — Report should show punchlist with photo links, categories, and items matching the team's 'Client Punch List' Excel. — _Project Report — Casa Solar Rincón_ — _High_
- **C-02** — Client report shows BOM (Bill of Materials) instead of category-level summaries. — _Project Report — Casa Solar Rincón_ — _High_
- **C-04** — Phase chart should look like the 'phase pie chart' from the team's punchlist, not a budget chart. — _Project Report — Casa Solar Rincón_ — _Medium_
- **C-10** — Report dates cannot be edited; generated reports cannot be accessed side-by-side for printing/download. — _Project Report — Casa Solar Rincón_ — _Medium_

### Open — 9

- **B-02** — Labor is calculated hourly, but the team works on lump-sum contracts. — _Cost Calculator_ — _High_
- **B-05** — Contractor section shows project-level info (sq ft, bathrooms, contingency) instead of contractor-specific data. — _Cost Calculator_ — _Medium_
- **B-14** — Labor rates in the calculator do not auto-update from the last 3 uploaded receipts. — _Cost Calculator_ — _Medium_
- **A-02** — No 'Gastos no facturables' (non-billable expenses) tab exists. — _Project Detail — Casa Solar Rincón_ — _Medium_
- **A-05** — No version history for documents; only the latest version is accessible. — _Project Detail — Casa Solar Rincón_ — _Medium_
- **A-09** — Images/media in the project are not self-manageable by the client. — _Project Detail — Casa Solar Rincón_ — _Medium_
- **A-12** — No audit log of client actions on the platform. — _Project Detail — Casa Solar Rincón_ — _Medium_
- **C-06** — Client report data does not match the categories and information sent in the team's regular reports. — _Project Report — Casa Solar Rincón_ — _High_
- **C-09** — Report uses an aggressive dark/black color palette that does not match the team's Excel color palette. — _Project Report — Casa Solar Rincón_ — _Medium_

### Needs Decision — 7

- **D-02** — It is unclear whether the AI assistant is the intended channel for change orders and material specs. — _AI Assistant_ — _Info_
- **J-01** — Users expect project data to be stored in or synced with Google Drive. — _Google Drive Integration_ — _Info_
- **H-02** — Users are confused about whether the Leads page is a CRM or an Asana mirror. — _Leads / CRM_ — _Info_
- **H-03** — It is unclear how accepting a proposal in the CRM creates a new project in Asana based on a template. — _Leads / CRM_ — _Info_
- **E-04** — It is unclear how approved final permit documents are distributed to the client or synced with Drive. — _Permits_ — _Info_
- **E-05** — It is unclear how permit documents requiring client signatures are uploaded and processed. — _Permits_ — _Info_
- **A-10** — Parallel phases are not supported; the timeline assumes sequential phases only. — _Project Detail — Casa Solar Rincón_ — _Info_

---

## How to read this

- **Done** items are shipped and verified against the listed files / behavior.
- **In Progress** items are partially landed (e.g. backend persistence done, UI rollup pending) — see the workbook's "Verification Note (2026-04-30)" column for details.
- **Open** items are scoped, prioritized, and waiting in the queue.
- **Needs Decision** items require product input from Tatiana / Gonzalo before they can be planned.
- The full bilingual notes (English + Spanish) live in the source workbook above.
