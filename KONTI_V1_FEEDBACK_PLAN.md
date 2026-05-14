# KONTi Dashboard — V1 Feedback Implementation Plan

> **Source:** Walkthrough call with KONTi Design (Carla Gautier, Jorge Rosa, Michelle Telon, Nainoshka Pagan) on **2026-05-11**. Notes by Gemini — file: `Meeting Konti - Walkthorugh 2da entrega - 2026_05_11 14_58 GMT-03_00 - Notes by Gemini (Spanish).md`.
>
> **Trial window:** 2026-05-13 → 2026-06-11 (Month 1, KONTi runs the platform with Menatech support) → 2026-07-11 (Month 2, KONTi takes admin keys and runs solo).
>
> **Repo:** `C:\Menatech\03_Client_Work\Arch-Firm-Hub-main`
>
> **Companion document:** [CODEBASE_FINDINGS.md](./CODEBASE_FINDINGS.md) — bugs and code-quality issues to address in parallel with the feedback work.
>
> **Canonical source spreadsheets** (supplied by the client; used as the source of truth for taxonomy, master materials, contractors, permit checklist, punchlist, and report layout). All six are also mirrored in `attached_assets/` already:
> | # | File | Use |
> |---|------|-----|
> | 0 | `0) KONTI DESIGN PRE-DESIGN CONSTRUCTION ESTIMATE - CLIENT NAME.xlsx` | Template for new-project estimates. Sheets: `DATA / OVERVIEW / MATERIALS / LABOR / COST BY CATEGORY / Wall Calculator`. |
> | 1a | `1a) Permits Checklist Template 2.0 - Benito Colon.xlsx` | Permit checklist per type (PCOC / PUS / DEA / REA) + engineer info + General Information form. |
> | 1b | `1b) KONTI DESIGN CONSTRUCTION ESTIMATE - BENITO COLON.xlsx` | **Jorge's canonical estimate.** Sheets: `DATA / PRODUCT LABOR & SUBCONTRACT / PRODUCT PHASES 1-5 / EXTERIOR & ADD-ONS / PROJECT ESTIMATE / CONTAINERS ESTIMATE / WBS / PRESENTATION / BUDGET`. |
> | 2a | `2a) Construction Report Benito Colon.xlsx` | Live construction report. Sheets: `SEPTIC SYSTEM / DECK / TIMESHEET / VENDORS / PURCHASES / DEPOSITS / PIVOT / ESTIMATE / PROJECT REPORT / BALANCE REPORT / INVOICE / BALANCE STATEMENT / KPI / LODGING ANALYSIS / PERMITS`. Has the **`Class: Included \| Excluded`** column = the meeting's "Non-Chargeable" label. |
> | 2b | `2b) CONTRACTOR MONITORING REPORT - BENITO COLON.xlsx` | One sheet per contractor with rows for `NOTABLE DELAYS / CHANGE ORDERS / CLIMATE CONDITIONS / BREACH OF CONTRACT / CORRECTIVE ACTIONS`. |
> | 2c | `2c) KONTI DESIGN PUNCHLIST BY PHASE - BENITO COLON.xlsx` | Per-phase punchlist with `Phase / Done / Category / Description / Status / Stakeholder / Notes / Link`. Includes a `ProgressReport` rollup. |
>
> The full canonical taxonomy extracted from these files lives in **[Appendix A](#appendix-a--canonical-konti-taxonomy)** at the bottom of this document. Every reference in the phases below points back to a specific row of Appendix A so implementers don't guess.

---

## 0. How to read this plan

The plan is split into **9 phases (P0 → P8)** ordered by **trial-risk-to-deliver ratio**, NOT alphabetical priority. The earlier the phase, the more likely it is to block the trial team's daily flow if it slips. Every phase has the same shape:

- **Why now** — what risk is mitigated by doing it in this phase
- **Scope** — concrete, verifiable items mapped to **(a)** meeting transcript bullet(s) and **(b)** files to touch
- **Acceptance criteria** — what "done" looks like, verifiable on the running app
- **Out of scope** — what is deliberately deferred (and to which phase)

Each scope item carries a `[U1]` / `[U2]` / `[V2]` tag matching the urgency buckets Gonzalo introduced on the call:
- `[U1]` — **Urgency block** (must land before trial Day 1 — 2026-05-13)
- `[U2]` — **Quality-of-life** (optimize the trial; land during the first half of Month 1)
- `[V2]` — **Version 2 proposal** (out of V1 scope; capture in Phase 2.0 proposal)

The "Pre-Trial Critical Path" is **P0 + P1 + P2 + P3**. Everything else can land mid-trial.

---

## Timeline at a glance

| Phase | Window | Theme | U1 items | U2 items |
|------:|--------|-------|---------:|---------:|
| **P0** | **2026-05-12 → 2026-05-13** | Pre-trial hardening (env, seed, smoke test) | 4 | 0 |
| **P1** | **2026-05-12 → 2026-05-14** | Calculator overhaul: 5-bucket reorder, master-material default load, manual labor entry, container qty, 3-tier estimation | 7 | 1 |
| **P2** | **2026-05-13 → 2026-05-15** | Reports & Photos (visibility toggles, defaults, cover-photo flow, audio/video uploads) | 6 | 1 |
| **P3** | **2026-05-14 → 2026-05-17** | Site Visit module (audio/video/notes + Whisper transcription + Drive sync) | 3 | 2 |
| **P4** | **2026-05-18 → 2026-05-22** | Category + Contractor + Stakeholder seeding from Appendix A + Field Admin role | 0 | 5 |
| **P5** | **2026-05-22 → 2026-05-28** | Real-Invoice Upload (PDF.co OCR) + Variance auto-comparison + Non-Chargeable `Class` column | 0 | 4 |
| **P6** | **2026-05-25 → 2026-05-31** | Permits Checklist module (PCOC/PUS/DEA/REA) + Contractor Monitoring expansion + Asana phase filter | 0 | 4 |
| **P7** | **2026-06-01 → 2026-06-07** | Tutorials, API-key rotation guide, refreshed bilingual user manual, feedback Excel | 0 | 4 |
| **P8** | **2026-06-08 → 2026-06-11** | Mid-trial review, Month 2 admin handoff, deploy-mode decision | 0 | 3 |
| **Appendix A** | _reference_ | **Canonical KONTi taxonomy** (buckets, phases, categories, contractors, stakeholders, permit checklist columns) | — | — |
| **Appendix B** | _post-trial_ | V2 proposal items captured for Carla & Fernando | — | — |

---

## P0 — Pre-trial hardening

**Why now:** every other phase is undermined if Day 1 of the trial discovers a startup crash, a missing env var, or a broken seed migration. P0 is *the* go/no-go gate for the trial.

### Scope

| # | Item | Tag | Files |
|---|------|-----|-------|
| **P0.1** | Set the trial environment baseline: confirm `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PDF_CO_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, Asana managed secret, and Postgres connection string are present in the Replit Autoscale deploy. | `[U1]` | `.replit`, `artifacts/api-server/src/lib/managed-secrets.ts`, `artifacts/api-server/src/lib/integrations-config.ts` |
| **P0.2** | Run `pnpm --filter @workspace/api-server run test:e2e` clean against staging before the cutover. Document any flakes for Phase D fix-forward. | `[U1]` | `artifacts/api-server/e2e/run.ts` |
| **P0.3** | Confirm the seed-migration idempotency markers (`lifecycle-seed-2026-05`, `estimating-json-2026-05`) are present in `lifecycle_migrations` / `estimating_migrations` in the prod DB. If not, run a one-shot boot in `NODE_ENV=production` against the prod DB to seed. **Do not run against a populated DB.** | `[U1]` | `artifacts/api-server/src/lib/lifecycle-store.ts`, `artifacts/api-server/src/lib/estimating-persistence.ts` |
| **P0.4** | Sanity check: create a throwaway lead via the public intake form, accept it as `admin`, advance it past `pre_design`, restart the workflow, and verify the project survives. This validates Phase A persistence end-to-end before real KONTi data touches the system. | `[U1]` | `artifacts/konti-dashboard/src/pages/intake.tsx`, `artifacts/api-server/src/routes/leads.ts` |

### Acceptance

- Deploy is healthy at `/api/health`.
- E2E suite is green (or every failing test has a written-down known-issue with an issue link).
- Restart-survives smoke test passes against the trial DB.

### Out of scope

- Switching from Autoscale to Reserved VM — deferred to **P8** as a deliberate cost/latency decision after we see trial usage patterns.

---

## P1 — Calculator overhaul

**Why now:** this is the single biggest meeting complaint ("la calculadora no resultó tan intuitiva" — Gonzalo) and touches more daily tasks than any other module. Carla and Jorge will pick it up in week 1 of the trial; if it's still confusing, the rest of the feedback channel gets flooded with calculator tickets.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P1.1** | **Reorder the Calculator page** to match the team's mental model: a single linear flow `Project setup → Materials (defaults loaded) → Labor & Contractors → Overview/Summary → Variance`. Today's tab order is `Estimate / Contractor / Imports / Variance` which is engineering-led, not workflow-led. | `[U1]` | `artifacts/konti-dashboard/src/pages/calculator.tsx` — rebuild the `<Tabs>` order; rename `Imports` → `Materials Library`. Add a top step-rail with the four steps highlighted. |
| **P1.2** | **Default-load all master materials into the per-project calculator on project creation.** Source the master list from the **MATERIALS** sheet of `attached_assets/0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_-_CLIENT_NAM_*.xlsx` (~110 rows, 19 categories — see [Appendix A.3](#a3--master-materials-list-extracted-from-the-materials-sheet-of-0-pre-design-estimate)). Schema per row: `category, description, qtyPerContainer, qtyTotal, materialCost, ivu, contingency, materialTotal, comment` (IVU = 11.5% sales tax, contingency = 20% on base). Materials are loaded at `qtyPerContainer` from the master sheet and `qtyTotal = qtyPerContainer × containerCount` (P1.3); the team uses **Delete** or sets qty to 0 for non-applicable items. | `[U1]` | New module `artifacts/api-server/src/data/master-materials.ts` exporting `KONTI_MASTER_MATERIALS_2026` (parsed once from XLSX → embedded as a typed array — **do NOT edit `seed.ts`** per `replit.md` preference). Extend `CalculatorEntry` schema with `ivuPercent: number, contingencyPercent: number, qtyPerContainer: number`. On `POST /api/leads/:id/accept`, call new helper `seedCalculatorWithMasterMaterials(projectId)` which inserts rows and `await`s `persistCalculatorEntriesForProject`. |
| **P1.3** | **Container quantity field** + auto-multiplication. The DATA sheet of file `1b)` carries `Qty of Product = 3` as a project-level field — adopt that exact name. Material lines store `qtyPerContainer` (immutable per material) and `qtyTotal = qtyPerContainer × project.containerCount` (computed). Changing `containerCount` re-runs the multiplication server-side; the user can still override `qtyTotal` per line (manual override wins). | `[U1]` | New field on `projects` lifecycle schema: `containerCount: integer default 1, minimum 1, maximum 50`. UI: prominent input at top of Estimate tab. Server: `PATCH /api/projects/:id { containerCount }` recomputes `qtyTotal` for every non-overridden line. Variance report respects the override flag. |
| **P1.4** | **Visible manual labor & margin entry** in the Contractor step. Today the contractor estimate is generated from invoice history; per the meeting Jorge and Carla expected an obvious field. Show two adjacent inputs on the same window as the contractor estimate: `Manual hourly rate` and `Margin %`. When the user types a manual rate, that rate **overrides** the auto rate for the rest of the line items in that contractor's estimate. | `[U1]` | `artifacts/konti-dashboard/src/components/estimating/contractor-calculator.tsx`. Add `manualLaborOverride?: number` and `manualMarginOverride?: number` to `ContractorEstimate` (server-side) and a `PATCH /api/projects/:id/contractor-estimate/overrides` route. UI: two `<Input>`s in the existing inputs card, labeled clearly. |
| **P1.5** | **Editable block: add new materials or contractors inline.** A small `+ Add custom line` button at the bottom of Materials and Contractor steps. Opens a modal with `Item`, `Category` (dropdown — must use the standardized categories from P4), `Unit`, `Base price`, `Quantity`. Custom lines are tagged `source: "custom"` so they can be filtered out of the master library. | `[U1]` | `artifacts/konti-dashboard/src/pages/calculator.tsx` already has an `AddMaterialModal`; extend it to accept `source: "master" \| "custom"`. Persist via existing `POST /api/projects/:id/calculator/entries`. |
| **P1.6** | **Black contrast box** in the calculator UI. Per the meeting feedback ("agregar un cuadro negro para dar contraste"). The current Estimate step has a low-contrast `bg-muted/30` summary row at the bottom. Replace with a `bg-konti-dark text-konti-light` rounded panel for the **Grand Total** and **Plus Management Fee** rows so they pop. | `[U1]` | `artifacts/konti-dashboard/src/pages/calculator.tsx` summary section. Confirm WCAG AA contrast against text (use `text-konti-light` `#E6EAEB` on `bg-konti-dark` `#1C1814` — already in the brand palette). |
| **P1.7** | **Decimal-tolerance & negative-guard fixes** noticed during scan: the calculator's inline-edit `saveLineEdit` rejects negative but doesn't trim trailing-period decimal partial inputs (e.g. `"12."` becomes `12` silently, which is fine, but `".5"` is also accepted as `0.5` — confirm intent). Add a min-step validation hint in the `<input type="number">` and use `step="0.01"` for prices, `step="1"` for qty. | `[U2]` | `artifacts/konti-dashboard/src/pages/calculator.tsx:362-389` |
| **P1.8** | **3-tier labor estimation** (`WORST CASE / MOST LIKELY / BEST CASE`). File `0)` LABOR sheet stores labor hours as three columns per category (e.g. Structural Prep = 60/50/40 hrs at $50/hr). Adopt this exact schema for labor lines: each labor line has `hoursWorstCase, hoursMostLikely, hoursBestCase` and the contractor estimate reports an `AVERAGE` (= MOST LIKELY by default). On the Contractor tab, render the 3 scenarios side-by-side with toggle to switch the active scenario for the estimate. | `[U1]` | Extend `ContractorEstimateLine` (server) with the three fields. Variance compares `actual` against `MOST LIKELY` by default; the report tooltip shows all three for context. |
| **P1.9** | **Risk Classification field** on the project. The DATA sheet of file `1b)` defines four risk levels that multiply the contingency reserve: `Paint by Numbers (1.05)`, `Quest (1.10)`, `Making a Movie (1.15)`, `Lost in the Fog (1.20)`. Default = `Making a Movie` (1.15). Display the active classification as a pill near the project header alongside Phase. | `[U2]` | `projects` schema field `riskClassification: enum`. UI on project metadata. Used by the server-side estimator to set `contingencyPercent`. See [Appendix A.5](#a5--risk-classification). |

### Acceptance

- A fresh project created from an accepted lead has every material from Jorge's master list pre-loaded at qty=0, in the canonical category order.
- Typing a container count of `3` produces a Grand Total exactly 3× the per-container total (after manual overrides are applied).
- The Contractor step has visible manual labor rate + margin fields, and editing either is reflected in the next contractor-estimate regenerate.
- The team can add a custom material from inside the calculator without leaving the page.
- The black contrast panel passes WCAG AA per axe-core scan on the page.

### Out of scope

- Reorder/rename inside the Materials Library (Imports tab) — handled in **P4** when categories are standardized.
- Persisting "Field Admin"-only restrictions on custom material creation — covered in **P4**.

---

## P2 — Reports & Photos

**Why now:** Carla called this out twice on the call — the "Client Report" button is hard to find, and photos behave unpredictably between the gallery and the report. Both surface on every weekly client update, so they compound user frustration fast.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P2.1** | **Promote the "View Report" entry-point.** Today it's a tiny text link in the top-right of the project hero (`project-detail.tsx:1535-1541`) with `[text-shadow]` against a busy photo background — Carla literally couldn't find it. Move it to a primary `<Button>` adjacent to the phase pill, with the icon + label `View Client Report` / `Ver Reporte del Cliente`. Add a second entry-point: a sticky right-rail card on `project-detail.tsx`. | `[U1]` | `artifacts/konti-dashboard/src/pages/project-detail.tsx:1535-1541` + `project-detail.tsx:1815+` (right column). |
| **P2.2** | **All report sections ON by default** for the client view. Today the client report renders the same template as the team view; the meeting asked: every field defaults to visible, and Carla manually toggles fields off per-project. Add a `reportSectionVisibility: Record<SectionKey, boolean>` map to the project record (default all `true`) and a settings drawer on the report page where Carla can toggle sections. The toggle persists per project. | `[U1]` | New schema field on `projects` (lifecycle.ts). New endpoint `PATCH /api/projects/:id/report-visibility`. UI: a gear icon in the report header opening a side drawer with one row per section: `Project metadata`, `Status sentence`, `Phase timeline`, `Milestones Gantt`, `Cost-Plus budget`, `Variance report`, `Punchlist`, `Site photos`, `Contractor monitoring`, `Documents`, `Client questions`. Render each section gated on the toggle. |
| **P2.3** | **Cover-photo flow.** Today the report defaults to the latest construction-progress photo unless a team member explicitly flags one as `featuredAsCover`. The meeting asked: when the team flags a photo as cover, that photo always wins on the report, and the same photo is used for the project card. Audit the current logic — `site-photos-gallery.tsx:160-205` already implements this; what's missing is the **client report's** photo-section using the same picker. | `[U1]` | `artifacts/konti-dashboard/src/pages/project-report.tsx`. Replace the "latest construction-progress" fallback with: `(1) featuredAsCover photo, else (2) latest construction-progress photo`. |
| **P2.4** | **Photo upload: add category + punchlist toggle on upload.** The meeting flagged that today the team must upload first, then go edit the doc to add category. Move both fields (`photoCategory` dropdown and a new `goesToPunchlist: boolean` toggle) into the **upload modal**, so the choice is made before commit. | `[U1]` | `artifacts/konti-dashboard/src/pages/project-detail.tsx:147-700` (`UploadModal`). Already has `photoCategory` — add the `goesToPunchlist` toggle and surface both prominently when `photoMode === true`. |
| **P2.5** | **Audio / Video / Text upload buttons** alongside the photo dropzone in the upload modal (per the meeting: "Implementar botones para subir audio, video y texto"). These are file-upload chips: `Audio` accepts `audio/*`, `Video` accepts `video/*`, `Text` opens an inline textarea dialog that creates a Document with `type: "note"`. | `[U1]` | Same `UploadModal`. Extend `ACCEPTED_MIME` and `ACCEPTED_EXTENSIONS`. Add `type: "audio" \| "video" \| "note"` to the Document enum (already has `pdf, excel, pptx, photo, other`). Update Drive sync to handle audio/video upload (Drive supports both natively). |
| **P2.6** | **Generated-PDF preview before send.** The meeting flagged that today the client report renders inside the dashboard, but the team wants a "preview" they can confirm before exporting/sending. Add a `Preview PDF` button on the report page that triggers the server-side PDF render (already wired via `/api/projects/:id/spec-updates-report/pdf` — extend to a `/client-report/pdf` endpoint that runs the actual report template, not screenshot). | `[U2]` | New server route `POST /api/projects/:id/client-report/pdf` that renders the **saved report template** server-side (resolves Phase E task #29). Client renders the resulting PDF inline in a `<dialog>` using the browser's PDF viewer. |

### Acceptance

- "View Client Report" is reachable in ≤1 click from anywhere on the project detail page.
- Toggling a section off and refreshing keeps it off; the toggle survives a restart.
- A photo flagged as cover appears at the top of the report's photo gallery AND on the project card image — both invalidated on the cover-flip mutation.
- Audio and video uploads land in Drive under the project's folder; the document list shows the new file with a play affordance.
- The PDF preview matches the saved report template (not the dashboard screenshot).

### Out of scope

- Audio-to-text transcription (lives in **P3** under Site Visits, where the meeting actually placed it).
- Brand watermark/header on the exported PDF — captured for V2.

---

## P3 — Site Visit module

**Why now:** the meeting described site visits as the **highest-frequency** team operation (Jorge does multiple a week). Today the "Log site visit" button only captures a visitor name + date + optional text note. The team needs photos, audios with transcription, videos, and an internal-vs-client visibility flag — *for each item*. This is the single largest UX change in the trial.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P3.1** | **Promote site visit to a first-class panel** on `project-detail.tsx` (not just a modal that closes after save). When you click `Log site visit`, you land on a working pad: visitor + date + channel header at top, then a **multi-row capture grid** where you tap `+ Photo`, `+ Audio`, `+ Video`, `+ Note` to add items. Each row has its own `internal-only` toggle (per the user clarification: per-item visibility). | `[U1]` | New component `artifacts/konti-dashboard/src/components/site-visit-panel.tsx`. Wire from `project-team-actions.tsx`. New schema table `site_visits` on lifecycle.ts with child `site_visit_items` (one row per item, with `type`, `documentId | text`, `clientVisible`, `transcriptText?`). |
| **P3.2** | **Audio capture in-browser** using `MediaRecorder` (Web Audio API). Recording produces a WebM/Opus blob that is uploaded via the same Document API as a `type: "audio"` upload. No native app needed for V1 (that lives in the V2 proposal). | `[U1]` | New `useAudioRecorder` hook. Falls back to file-upload if `MediaRecorder` isn't available. |
| **P3.3** | **Audio → text transcription via OpenAI Whisper.** Per user clarification: use OpenAI's `audio.transcriptions` endpoint (already have `OPENAI_API_KEY` in `managed-secrets.ts`). On upload of any `type: "audio"` document, enqueue a background job that posts to Whisper, stores the result in `documents.transcriptText` (new column), and emits an audit-log entry on completion. The transcript is rendered below the audio player on the site-visit row. **Spanish input is the common case** — pass `language: "es"` when the project's `defaultLanguage === "es"`. | `[U1]` | `artifacts/api-server/src/lib/transcribe.ts` (new). Use the `openai` SDK already pulled in by `routes/ai.ts`. Background job queue: simple in-process `setImmediate` for V1 (the API is fast enough — typical site-visit audio is <3 min). Persistence: add `transcript_text` and `transcript_status` columns to `project_documents`. |
| **P3.4** | **Per-item internal-vs-client toggle.** Each captured item carries `clientVisible: boolean` (default depends on type — see acceptance). The client view hides any item with `clientVisible === false`. | `[U2]` | Site-visit schema fields and panel UI. The report's Site Visits section reads `clientVisible` and filters. |
| **P3.5** | **Save site-visit bundle to Drive.** All photos, audios, videos, and a generated `site-visit-summary.md` (containing the notes + transcripts) land in the project's Drive folder under `/site-visits/{visit-date}-{visitor}/`. This is the meeting's "Todos los archivos quedarán ordenados por proyecto en Google Drive" promise. | `[U2]` | Extend `artifacts/api-server/src/lib/drive-sync.ts` with `uploadSiteVisitBundleToDrive(visitId)`. Idempotent: if the folder exists, append; if a file with the same hash exists, skip. |

### Acceptance

- A team member can complete a full site visit in the field (assuming a Chrome-on-Android session): visitor + date + 5 photos + 1 audio + 2 text notes, with the audio transcribed in <30s and rendered inline.
- Each item has its own visibility toggle; toggling one item off doesn't affect siblings.
- The same items appear in the project's Drive folder under `/site-visits/2026-05-15-jorge/` within 60 seconds of saving.
- Default visibility on creation: photos → `clientVisible: true`, audios → `clientVisible: false` (internal-only by default, since they often contain candid commentary), videos → `clientVisible: true`, notes → `clientVisible: false`. The team can flip at any time.

### Out of scope

- Native mobile app — captured for V2.
- Offline-first capture (recording while disconnected then syncing on reconnect) — V2.
- Speaker diarization in transcripts — V2 (would require AssemblyAI/Deepgram per the original options).

---

## P4 — Category Standardization + Field Admin role

**Why now:** every category drift between the platform, Drive folders, and Asana board creates a reconciliation cost on every weekly report. The meeting agreed to standardize using Jorge's Excel nomenclature ("Usar la nomenclatura de las categorías del Excel de Jorge"). The role gating ensures the standard stays stable.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P4.1** | **Confirm Jorge's category taxonomy already matches** `lib/report-categories/src/index.ts`. The 5 top-level buckets in the code (Design & Data Collection, Permits & Service Fees, Product (Containers), Exterior & Add-Ons, Construction Contingency) **exactly match** the BUDGET sheet of file `1b)`. **The work is not a rename — it's filling in the gaps.** Specifically: (a) add the **Phase 1–5 sub-categories** for PRODUCT (CONTAINERS) (see [Appendix A.1](#a1--5-top-level-buckets--phase-1-5-product-containers-sub-categories)); (b) add the EXTERIOR & ADD-ONS sub-categories (Foundation / Site Electric / Site Plumbing / Bio Garden / Decking / Site Work / Steel Structure / Outdoor Kitchen / Pergola / Appliances); (c) extend `TRADE_TO_BUCKET` with the new keys; (d) backfill `TRADE_LABELS` EN/ES. **No migration needed** — the existing key map already routes the new keys correctly. | `[U2]` | `lib/report-categories/src/index.ts`. Add unit tests for each new key. |
| **P4.2** | **Match platform categories to Drive folder names.** The meeting flagged that the Drive folders and the platform's `DOC_CATEGORY_OPTIONS` must agree (`Nainoshka: "si subo a la plataforma, ¿se sube a Drive?"`). Confirm `drive-sync.ts`'s folder picker uses the bilingual label from the standardized taxonomy. Specifically, the Drive folder structure should mirror the 5 buckets from A.1 with the Phase 1–5 substructure. | `[U2]` | `artifacts/api-server/src/lib/drive-sync.ts` + `project-detail.tsx:105-114` (`DOC_CATEGORY_OPTIONS`). Reconcile against `REPORT_BUCKET_LABELS`. |
| **P4.3** | **Introduce a `field_admin` role.** Sits between `team` and `admin`. Per the meeting and user clarification: Jorge (and only Jorge for now) gets `field_admin`. Only `field_admin`, `admin`, and `superadmin` can create new master materials, new contractor records, or new categories. Team users can still add to a project's calculator. | `[U2]` | `lib/db/src/schema/lifecycle.ts` — extend the role enum. `artifacts/api-server/src/middlewares/require-role.ts` — already takes a role array. Update `routes/contractors.ts:25-82`, `routes/estimating.ts:152` (`materials/import`), and the new "add custom line" endpoint from P1.5. Add a self-service "Promote to Field Admin" in `pages/integrations.tsx` (superadmin-only). |
| **P4.4** | **Master material/contractor/categories add UI** for the field admin. New page `artifacts/konti-dashboard/src/pages/field-admin.tsx` with three tabs (`Materials`, `Contractors`, `Categories`) and an audit log of recent additions. Each tab is a CRUD surface over the corresponding master table. | `[U2]` | Wire from sidebar (visible only when `role === "field_admin" \|\| "admin" \|\| "superadmin"`). |
| **P4.5** | **Pre-seed canonical contractor directory.** File `1b)` DATA sheet enumerates ~14 contractors KONTi works with regularly (JF Broker, MF Solution, Soldadura Rizoma, North Steel, Solid Doors, AR Construction, Henry Mercedes / H&G Construction, Geraldo Velez, Edgardo Javier, D&G Air Conditioning, Air Max, Jose Perez Lisboa, JP Exterminating, Ing. Carlos Quiñones) plus the 4 internal stakeholders with bill rates (Carla $75, Jorge $50, Michelle $25, Andrea $50). See [Appendix A.4](#a4--canonical-stakeholdercontractor-directory). Pre-seed these into `CONTRACTORS` on first boot via an idempotent migration. | `[U2]` | New `artifacts/api-server/src/data/canonical-contractors.ts`. Migration in `lifecycle-store.ts` keyed by `contractors-seed-2026-05` so it runs once. Existing `requireRole` on `routes/contractors.ts` already gates additions correctly. |

### Acceptance

- All 5 surfaces (calculator categories, document categories, Drive folder names, Asana board sections per P6, report bucket labels) use the exact same EN/ES strings sourced from `lib/report-categories/src/index.ts`.
- A `team` user is denied with a 403 on `POST /api/estimating/materials/master`; a `field_admin` user succeeds. Both are audit-logged.
- The migration from old → new category keys runs idempotently; running it twice is a no-op.

### Out of scope

- Per-area sub-admins (the meeting floated a "super-admin who delegates by area" idea) — V2.

---

## P5 — Real-invoice upload & variance auto-comparison

**Why now:** this is the meeting's "subir facturas reales para generar la comparación" workstream. It's the bridge between estimates and actuals — once it works, the Variance report becomes the team's single source of truth instead of a spreadsheet shadow process. Today's receipt OCR is mocked (Phase E #28 in `development.md`).

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P5.1** | **Real receipt OCR via PDF.co**. Replace the mocked CSV-parsing logic in `artifacts/api-server/src/lib/receipt-ocr.ts` with a real PDF.co call (key already in `managed-secrets`). For each line item the OCR returns, run a small Claude/GPT prompt to classify into the standardized categories from P4. Persist line items to a new `receipt_line_items` table. | `[U2]` | `lib/receipt-ocr.ts`, new schema table. Reuse the AI provider fallback pattern from `routes/ai.ts:422`. |
| **P5.2** | **Multi-item invoice support.** Jorge raised this on the call: "una factura de Home Depot puede incluir varios materiales" — today the upload form assumes one item per invoice. After P5.1's line-item extraction, render a confirmation table where the team can correct the AI's category assignment per line before committing. | `[U2]` | `artifacts/konti-dashboard/src/components/estimating/imports-panel.tsx` — extend the OCR result panel to a multi-row form. |
| **P5.3** | **Auto-comparison with estimate**. When a confirmed line item lands, the variance report's `actual` totals refresh automatically. The `Δ vs Estimated` and `Δ vs Invoiced` deltas already exist; this work plumbs the new line items into the same aggregation. Wire React Query invalidation. | `[U2]` | `artifacts/api-server/src/routes/estimating.ts` — variance report endpoint should compute from `receipt_line_items` once they exist. `artifacts/konti-dashboard/src/components/estimating/variance-report.tsx` — already renders the deltas. |
| **P5.4** | **`Class: Included \| Excluded` column on every receipt line.** File `2a)` VENDORS and PURCHASES sheets carry a `Class` column that toggles whether the line is included in the client invoice (= chargeable) or excluded (= non-chargeable / KONTi-absorbed). This is the meeting's "Non-Chargeable as a label, not a module" — already half-implemented in `cost-plus-budget.tsx`'s `nonBillable` tab. Make `class` the authoritative field: each receipt and each cost-plus line stores `chargeable: boolean` (true = included). The variance report excludes non-chargeable lines from billable totals but keeps them visible. | `[U2]` | Schema: add `chargeable: boolean default true` to `receipt_line_items` and `project_cost_plus_lines`. UI: toggle in the receipt confirmation form (P5.2) and on every cost-plus row. Default = `true` (chargeable); toggling to `false` moves the row to the Non-Billable tab automatically. |

### Acceptance

- Uploading the sample `attached_assets/2a)_Construction_Report_Benito_Colon_*.xlsx` produces a structured line-item table that the team can edit before commit.
- Each line is auto-classified into a P4 bucket with ≥80% accuracy on a 20-receipt regression set.
- The variance report refreshes within 2s of confirming a multi-line invoice.

### Out of scope

- E-signature attached to receipts — V2.

---

## P6 — Permits Checklist module + Contractor Monitoring expansion + Asana phase filter

**Why now:** the deep-dive on the spreadsheets revealed two large KONTi workflows that are not yet first-class in the app: the **Permits Checklist** (file `1a)`) and the **Contractor Monitoring** sheets per contractor (file `2b)`). Both are weekly-touched surfaces and both currently live entirely in Excel — the trial will surface this gap immediately if not addressed. The Asana phase filter is the smaller third item.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P6.1** | **Permits Checklist module** — first-class implementation of file `1a)`. Each project gets four permit checklists (PCOC, PUS, DEA, REA) with the same row structure: `description, comments, docFilledOut: bool, sent: bool, received: bool, fileUploadLink`. Plus a General Information form (Project Name, Address, Catastro Number, OGPE Number, Zoning, Coordinates, Catastro polygon, Construction Cost, Capacity, Sqft, Principal Use, Type of Residence) and an Engineer Info section (Proyectista, Structural, Survey, Septic, Soil Study) with bill rate and license expiration. See [Appendix A.6](#a6--permits-checklist-module). The existing `permits-panel.tsx` is the shell; this work fleshes it out. | `[U2]` | New tables `project_permits` + `permit_checklist_items` + `permit_engineers`. New routes under `routes/projects.ts`. New panel component `components/permits-checklist-panel.tsx` with one tab per permit type. |
| **P6.2** | **Contractor Monitoring expansion**. File `2b)` has 5 standardized sections per contractor: `Notable Delays / Change Orders / Climate Conditions / Breach of Contract / Corrective Actions`. Today `contractor-monitoring-section.tsx` is a single status pill. Expand into a full per-contractor monitoring view with those 5 sections, each row carrying `date, description, status (Approved \| Denied), days, notes, evidenceLink`. Tracks initial finish date vs new finish date (after approved delays). | `[U2]` | New tables `contractor_monitoring_entries` (FK to contractor + project). New route group `/api/projects/:id/contractors/:contractorId/monitoring`. Extend `contractor-monitoring-section.tsx` (currently in `components/`) into a tabbed panel. |
| **P6.3** | **Filter Asana tasks by current phase.** Today `asana-sync.ts` reads every task on the board. The meeting agreed to scope tasks shown in the project to the active phase. The 5-phase model from PRODUCT (CONTAINERS) maps naturally to Asana sections (Phase 1 / Phase 2 / Phase 3 / Phase 4 / Phase 5, plus EXTERIOR & ADD-ONS). | `[U2]` | `artifacts/api-server/src/lib/asana-sync.ts` — add a `phase` filter parameter. `artifacts/konti-dashboard/src/pages/project-detail.tsx` — tasks panel filters. |
| **P6.4** | **Urban vs Rural cost lists.** The meeting mentioned that the backend can differentiate listings for urban vs rural projects. Add a `costListVariant: "urban" \| "rural"` field on projects, defaulting to `urban`. On lead-acceptance (P1.2's `seedCalculatorWithMasterMaterials`), pick the matching variant — for now, both variants ship with identical pricing; the field is forward-compatible until Jorge supplies the rural-only price adjustments. | `[U2]` | `projects.costListVariant` schema field, `master-materials.ts` exports `KONTI_MASTER_MATERIALS_2026_URBAN` and `_RURAL` (same data initially), `intake.tsx` carries the choice through, `field-admin.tsx` page (from P4) gets a toggle to edit per variant. |

### Acceptance

- A new project automatically gets four blank permit checklists; each row in PCOC matches the canonical list in [Appendix A.6](#a6--permits-checklist-module).
- Logging a 3-day weather delay on Soldadura Rizoma's monitoring sheet shifts the "New Finish Date" forward by 3 days automatically.
- Switching a project's phase reduces the visible Asana task list to the matching Asana section.
- A new project created with `costListVariant: "rural"` uses the rural materials list; switching variants on an existing project does NOT silently rewrite existing line items (it warns the user first).

### Out of scope

- Auto-generating the permit application PDFs (the actual government forms) — V2.
- Custom monitoring sections beyond the 5 standard ones — V2.

---

## P7 — Tutorials, API-key rotation guide, refreshed user manual

**Why now:** the meeting's biggest non-technical request was an updated manual that lands with the trial invitation, plus a written walkthrough of the API-key rotation flow so KONTi can take admin in Month 2 without needing Menatech every quarter.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P7.1** | **API-key rotation guide.** Markdown doc + screencast. Walks through `/integrations` → click `Update` on each managed secret → paste new key → click `Test` → audit log entry. Covers Anthropic, OpenAI, PDF.co, Gamma, Google Client ID/Secret, Asana. | `[U2]` | New `docs/api-key-rotation.md`. Embed an `<iframe>` to a Loom or Drive video link inside the app at `/integrations` (top of page banner). |
| **P7.2** | **Refreshed user manual** covering: (a) lead intake → project creation, (b) calculator full flow with P1's overhaul, (c) site visits with the P3 module, (d) reports & client view toggles, (e) photo cover-flow, (f) Asana phase filter, (g) field-admin daily duties (Jorge). | `[U2]` | New `docs/user-manual.md`. Mirror as an in-app page at `/help` (extend the existing `Help` link in the sidebar). Bilingual (EN/ES) via the `t()` helper. |
| **P7.3** | **Excel feedback-tracker template.** The meeting agreed feedback will flow through "una plantilla de Excel unificada" with columns `ID, Module, Severity, Description, Status (Open / In Progress / Needs Decision / Closed), Reporter, Date, Notes`. Ship it as `docs/feedback-template.xlsx` plus a Drive copy shared with KONTi. | `[U2]` | Generate via the `anthropic-skills:xlsx` skill at implementation time, or hand-author and check in. |
| **P7.4** | **Daily-summary email scaffolding.** Out-of-scope for V1 builds, BUT include the manual's "what's coming next" section noting that automated daily/weekly client summary emails are a V2 item, so KONTi doesn't expect them in the trial. | `[U2]` | `docs/user-manual.md` — a "Roadmap" section. |

### Acceptance

- The manual is accessible from the sidebar of the running app and from a public docs link shared with KONTi over email.
- The API-rotation guide has been validated by Tatiana attempting a key rotation without coaching.
- The Excel feedback tracker is shared on the project's Drive, with the first 3 known issues from this trial pre-populated.

### Out of scope

- Translation of the manual to a 3rd language — N/A.

---

## P8 — Mid-trial review & Month 2 handoff prep

**Why now:** the meeting's deliberate structure is Month 1 = Menatech-led, Month 2 = KONTi-led. P8 is the handoff harness. It lands in the final week of Month 1.

### Scope

| # | Item | Tag | Files / Approach |
|---|------|-----|------------------|
| **P8.1** | **Run the mid-trial review meeting** (Tatiana + Gonzalo + Carla + Jorge). Inputs: the feedback Excel from P7.3. Outputs: (a) confirmed list of issues fixed during Month 1, (b) issues queued for Month 2 (KONTi to triage themselves), (c) Month 2 ops decisions: cron-frequency for emailed reports, Drive folder permission audit, Asana board owner. | `[U2]` | Calendar invite goes out at trial start (P0); meeting on 2026-06-09. |
| **P8.2** | **Transfer admin keys.** Walk through P7.1's rotation guide with Carla as the operator; rotate every managed secret to a KONTi-owned value, audit-log captures the actor change. Issue a fresh `superadmin` token for KONTi's primary admin. | `[U2]` | `/integrations` page. Tracked entirely in the audit log. |
| **P8.3** | **Deployment-mode decision (Autoscale vs Reserved VM).** Per the `development.md` Phase H note: Autoscale incurs cold-start latency. After 4 weeks of trial data, decide jointly whether to keep Autoscale (cheap, occasional 2s cold-start) or move to Reserved VM (always-on, ~3× cost). Document the decision in `replit.md`. | `[U2]` | `.replit`, `replit.md`. |

### Acceptance

- All managed secrets are owned by a KONTi email by 2026-06-11.
- The feedback Excel has every Month 1 issue marked `Closed` or `Carried to Month 2` with a rationale.
- Deployment mode decision is captured with a one-paragraph reasoning in the README.

### Out of scope

- Anything past 2026-07-11 (end of Month 2) — that's the V2 proposal's scope.

---

## Appendix A — Canonical KONTi Taxonomy

> Extracted verbatim from the 6 spreadsheets on 2026-05-13. This is the source of truth referenced by P1, P4, P5, P6 above. When the implementer reads "use the Phase 2 sub-categories" — these tables are what they mean.

### A.1 — 5 top-level buckets + Phase 1-5 PRODUCT (CONTAINERS) sub-categories

Confirmed against file `1b)` PROJECT ESTIMATE sheet (Benito Colon) and matches `lib/report-categories/src/index.ts` already.

| # | Bucket | EN label | ES label | Sub-categories |
|---|--------|----------|----------|----------------|
| 1 | `design_data_collection` | Design & Data Collection | Diseño y Recolección de Datos | Plans and Construction Documents · Soil Study · Survey and Topography · Bio-Garden Design · Solar System Design |
| 2 | `permits_service_fees` | Permits & Service Fees | Permisos y Tasas de Servicio | Municipal Patent (5%) · Permit Services (First 50%) · Permit Services (Last 50%) · State Insurance Fund (CFSE) · Permit 1 (Ex. Categórica / REA/DEA) · Permit 2 (Construction / PCOC) · Permit 3 (Use / PUS) · Liability Insurance · Construction Inspection Fee |
| 3 | `product_containers` | Product (Containers) | Producto (Contenedores) | *See Phase 1–5 below* |
| 4 | `exterior_add_ons` | Exterior & Add-Ons | Exterior y Complementos | Foundation · Site Electric · Site Plumbing · Bio Garden · Decking · Site Work · Steel Structure · Outdoor Kitchen Build · Pergola · Appliances |
| 5 | `construction_contingency` | Construction Contingency | Contingencia de Construcción | — (reserve only) |

**PRODUCT (CONTAINERS) — 5 Phases:**

| Phase | Categories (with canonical descriptions from the 2c punchlist) |
|-------|----------------------------------------------------------------|
| **Phase 1** | Container Purchase (Purchase + Transport to Shop) · Structural Prep (W&D framing cuts + Frames Installation + Acrylic Primer + Red Oxide Primer + Container Fumigation) · Exterior Windows & Doors (Build start) |
| **Phase 2** | Exterior Windows & Doors (Installation) · Interior Infrastructure (Metal framing + Insulation + Blocking + Gypsum Board + Wood Posts) · Plumbing Infrastructure · Electrical Infrastructure · Kitchen (Build) |
| **Phase 3** | Interior Build (Finish Gypsum + Mudding & Sanding + Priming + Flooring) · HVAC (AC Units Purchase + Installation) · Bathroom (Tiles + Saddle + Drain + Shower) · Kitchen (Installation of cabinets, top, sink, stove) |
| **Phase 4** | Plumbing Finishes · Electrical Finishes (Lighting fixtures + Ceiling fans) · Container Finishes (Interior painting + Roof sealing + Exterior painting) · Container Installation (Transport to Site) |
| **Phase 5** | Container Installation (Welding) · Detailing (Vanity + Toilet + Sink Faucet + Interior Doors + Last Punchlist) · Post Construction Cleanup |

### A.2 — Project metadata schema

From file `1b)` DATA + PROJECT ESTIMATE sheets:

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `client` | string | "Benito Colon" | |
| `date` | date | 2026-01-21 | |
| `version` | string | "1.0" | |
| `productModel` | enum | `L1 / L2 / L3 / Custom` | Container model |
| `permitModel` | enum | `M1 / M2 / M3 / Custom` | Permit/property model (1a List sheet) |
| `riskClassification` | enum | `paint_by_numbers / quest / making_a_movie / lost_in_the_fog` | See A.5 |
| `marginPercent` | number | 20 | Default 20% |
| `contingencyPercent` | number | 15 | Default 15%; multiplied by risk multiplier |
| `containerCount` | integer | 3 | Renamed from "Qty of Product"; multiplier for all qty |
| `productSquareFeet` | number | 960 | |
| `costPerSquareFoot` | number | derived | `estimatedCost / productSquareFeet` |

### A.3 — Master materials list (extracted from the MATERIALS sheet of `0)` PRE-DESIGN ESTIMATE)

19 unique categories with ~110 line items total. Each line carries:

```ts
interface MasterMaterialLine {
  category: string;           // one of the 19 categories below
  description: string;        // human-readable item name
  qtyPerContainer: number;    // canonical qty per container (= 1)
  materialCost: number;       // base price in USD
  ivuPercent: number;         // 11.5% (Puerto Rico sales tax)
  contingencyPercent: number; // 20% baseline
  comment?: string;           // optional note (e.g. "For Metal Frames")
}
```

The 19 categories in their canonical order (some map directly to Phase 1–5 sub-categories from A.1):

1. Container Purchase
2. Structural Prep
3. Cut & Frames
4. Interior Build
5. Exterior Windows and Doors
6. Plumbing
7. Electrical
8. Painting
9. Consumables
10. Bathroom
11. Kitchen
12. Finishes
13. Interior Staircase
14. Exterior Steel Structure
15. Exterior Staircase
16. Decking
17. Pergola
18. Appliances
19. Gas Connection

Implementer note: the full ~110-row list lives in `attached_assets/0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_-_CLIENT_NAM_*.xlsx`, sheet `MATERIALS`, rows 6–113. Parse once at build time into `master-materials.ts` (do NOT edit `seed.ts`).

### A.4 — Canonical stakeholder/contractor directory

**Internal stakeholders (with bill rates):**

| Name | Role | Bill rate |
|------|------|-----------|
| Carla Gautier | Architect | $75/hr |
| Jorge Rosa | Project Manager (= Field Admin) | $50/hr |
| Michelle Telon | Lead Designer | $25/hr |
| Andrea Camacho | Construction Manager | $50/hr |
| Nainoshka Pagan | Construction Manager (per file `2c)` ProgressReport) | $50/hr |

**External contractors (seeded as the canonical directory):**

| Name | Trade / Specialty | Source file |
|------|-------------------|-------------|
| JF Broker Unlimited Corp | Container Purchase | `1b)` DATA |
| MF Solution Corp | Container Transport | `1b)` DATA |
| North Steel | Structural Reinforcement | `1b)` DATA |
| Soldadura Rizoma (Jordy Medina) | Welding, Cuts & Frames, Container welding | `2b)` Soldadura Rizoma |
| Edgardo Javier | Painting, Primer | `1b)` PRODUCT LABOR & SUBCONTRACT |
| Jose Super Exterminating / JP Exterminating | Site & Container Fumigation | `1b)` DATA, `2a)` VENDORS |
| Solid Doors / All Screens Doors & Windows | Exterior Windows & Doors | `2c)` Punchlist |
| Henry Mercedes / H&G Construction | Plumbing, Interior Build, Bathroom, Foundation | `2b)` Henry Mercedes |
| Geraldo Velez | Electrical | `1b)` DATA |
| AR Construction PR LLC | Kitchen Build + Installation | `2a)` VENDORS |
| D&G Air Conditioning | HVAC Installation | `1b)` DATA |
| Air Max | AC Units (Purchase) | `2c)` Punchlist |
| Jose Perez Lisboa (Ing. Jose Perez) | Foundation (engineer) | `2a)` VENDORS |
| Ing. Carlos Quiñones | Civil/Structural Engineer (Designer) | `1a)` General Information |
| Ing. Jose Cabiya | Survey & Topography | `1a)` General Information |
| Ing. Carlos Pacheco | Septic Engineer | `1a)` General Information |
| Ing. Juan Mejias | Soil Engineering | `1a)` General Information |
| Ing. Jose Aponte | Inspector | `2b)` Ing Jose Aponte |
| Jose Rivera | Site Stakeout / Foundation | `2a)` VENDORS |
| Gilberto Feliciano Mattei | W&D Purchases | `2a)` VENDORS |

### A.5 — Risk classification

From file `1b)` DATA sheet, rows 35-38. Applied as a multiplier on the contingency reserve.

| Name | Multiplier | Risk level | Definition |
|------|-----------:|-----------|------------|
| Paint by Numbers | 1.05 | **Low** | KONTi and stakeholders are sure of what needs to happen and how. |
| Quest | 1.10 | **Medium** | KONTi and stakeholders are sure of what but unsure of how. |
| Making a Movie | 1.15 | **Medium** *(default)* | KONTi and stakeholders are certain about the goal but not the path. |
| Lost in the Fog | 1.20 | **High** | KONTi and stakeholders do not know what or how. |

### A.6 — Permits Checklist module

From file `1a)` General Information sheet:

**Project property metadata** (in addition to A.2):
- `address` (full street address, city, state, zip)
- `ogpeNumber` (OGPE permit identifier)
- `catastroNumber` (Puerto Rico catastro / cadastral code, e.g. `069-014-203-36`)
- `coordinates` (lat,lng — e.g. `18.401214, -67.168104`)
- `zoning` (enum: AD = Área Desarrollada, Vial, etc.)
- `principalUse` (Residential / Commercial / Industrial / Institutional / Telecommunications / Renewable Energy / Tourist / Agricultural)
- `typeOfResidence` (Single Family Home / Multifamily / Apartment / Condohotel / Patio Houses / Row Houses / Housing / One or two family Home / Common Areas)
- `typeOfStructure` (New Structure / Expansion or Remodel)
- `potableWaterSupply` (Public / Private / Communal)
- `sewageDisposal` (Septic Tank Collective / Collective Private / Sanitary Sewer Collective / Septic Tank Private / Sanitary Sewer Private)
- `existingInfrastructure` (multi-select: Acueductos, Electricidad AEE, Via Estatal, Via Municipal, Telecommunications, Alcantarillado)
- `structureMaterial` (Reinforced Concrete, Steel, Wood, Mixed)
- `totalCapacityCuerdas` (square meters of developable land)
- `constructionCost` (estimated)

**Four permit checklists** (PCOC = Permiso de Construcción, PUS = Permiso de Uso, DEA = Determinación de Ámbito, REA = Recomendación de Endoso Ambiental). Each is a list of rows:

```ts
interface PermitChecklistItem {
  description: string;        // e.g. "Deed or Property Title or Lease Agreement"
  comments?: string;          // e.g. "Template Library"
  docFilledOut: boolean;
  sent: boolean;
  received: boolean;
  fileUploadLink?: string;    // Drive link
}
```

The canonical PCOC rows (from file `1a)` PCOC sheet, with the standard sub-rows for each engineer):

1. Deed or Property Title or Lease Agreement
2. Photograph of the property
3. Authorization of the owner of the project
4. Explanatory memorandum
5. GES Report / Soil study
6. Certification for percolation of land
7. CRIM certification (indicating the catastro number)
8. Certification of graphic file, official map, etc.
9. Digital plan, in polygon, of project measurements
10. Designer's certification (Proyectista)
11. Evidence of designer's licenses
12. Specialist certification (Structural — Carlos Quiñones · Survey — Jose Cabiya · Inspector — Ing. Aponte · Soil/GES — Juan Mejías)
13. Evidence of specialist licenses (one row per specialist)

### A.7 — Punchlist by Phase schema

From file `2c)`. The current `punchlist_items` schema already supports `phase` + `label` + `owner` + `status`. The xlsx adds two fields worth surfacing:

- `referenceLink` — the "Link" column ("Container Photos", "Fumigation Warranty", "Windows & Doors Purchase Agreement Signed"). Maps to a Drive or platform document.
- `category` is **already** per-phase organized in the xlsx; keep the same structure.

Statuses observed: `DONE`, blank (= Open), `Pending`. Map to existing `open / in_progress / done / waived`.

### A.8 — Construction Report / Vendors + Purchases schema

From file `2a)` VENDORS and PURCHASES sheets:

```ts
interface ProjectFinancialEntry {
  class: "Included" | "Excluded";  // chargeable flag from the meeting
  status: "Paid" | "Pending";
  subCategory?: string;             // e.g. "Structural Cuts & Frames"
  category: string;                 // top-level — maps to A.1 sub-categories
  date: string;                     // ISO yyyy-mm-dd
  transactionOrigin: "ATH MOVIL" | "ACH" | "Credit Card: Capital One" | string;
  vendor: string;
  amount: number;
  description: string;
}
```

The `class` column is the meeting's "Non-Chargeable" toggle — see P5.4.

### A.9 — Contractor Monitoring schema

From file `2b)`. One sheet per contractor; each sheet has:

- Header: `Contractor Name`, `Start Date`, `Today's Date`, `Approved Delay Days`, `New Days`, `Initial Finish Date`, `New Finish Date`, `Actual Days`
- 5 standardized sections, each with rows of shape:
  ```
  Date | Description | Status (Approved | Denied) | Days (#) | Notes | Link (Evidence)
  ```
  Sections: **I. Notable Delays / II. Change Orders / III. Climate Conditions / IV. Breach of Contract / V. Corrective Actions**

---

## Appendix B — V2 backlog (for Carla & Fernando proposal)

These items came up on the call and were explicitly tagged `[V2]`. They belong in the Phase 2.0 proposal Gonzalo committed to sending separately.

1. **Drone recording module** — auto-capture aerial site progress on a schedule.
2. **Blueprint reader** — OCR / floor-plan recognition that turns plans into the material calculator's qty inputs.
3. **Native mobile app** — offline-first capture for site visits; queue uploads on reconnect; persistent material-line drafts.
4. **Standardized error catalog** — replace stack-trace strings with bilingual, code-tagged messages across every module.
5. **Real-time messaging by project** — read-receipted threads, replacing WhatsApp/email for project comms.
6. **Branded PDF preview** — apply KONTi logo, colors, fonts to exported PDFs before send.
7. **Subcontractor portal** — limited-access login for subcontractors to upload invoices and update task statuses.
8. **Automated client emails** — daily/weekly summary digests with photo cover, milestone deltas, open punchlist count.
9. **Milestone billing via Stripe** — invoice + collect against contract milestones in-app.
10. **E-signature integration** — DocuSign/HelloSign for change orders.
11. **Cross-project calendar** — detect resource conflicts (a contractor double-booked on two projects).
12. **Data migration** — import historical KONTi project data from existing spreadsheets/Drive into the platform.

---

## Cross-cutting engineering reminders

These come from the parallel codebase scan ([CODEBASE_FINDINGS.md](./CODEBASE_FINDINGS.md)) and apply to every phase above:

- **Always `await` the matching `persist*ForProject(projectId)` before sending a 200 OK.** The pattern is documented in `replit.md`'s "Lifecycle Persistence" section. Easy to forget when adding new mutating routes (especially for P1.5, P3.5, P5.x).
- **Every new mutating route needs an OpenAPI spec entry + codegen + typed-hook usage.** Don't ship a new server route without running `pnpm --filter @workspace/api-spec run codegen`. This is `development.md` Phase B but applies forward.
- **Every new mutating route needs `requireRole` + `enforceClientOwnership`.** Default to "allow only the smallest role set that needs it." Even read routes — `development.md` Phase C lists 4 currently-public routes that should be gated.
- **Every new persisted entity needs a `__tests__/` integration test** that creates, restarts the server, and reads — to prove persistence isn't lying.
- **Every UI text string must use `t(en, es)`.** Spanish is half the user base.
- **Every new query-key needs `queryClient.invalidateQueries` in the matching mutation's `onSuccess`.** Particularly relevant for P2.1 (cover-photo flip cascades to 3 cards) and P5 (variance feeds from receipt commit).

---

## Verification gates

Before declaring a phase "done":

1. `pnpm typecheck` is green.
2. `pnpm --filter @workspace/api-server run test:e2e` is green.
3. The route under test survives a server restart (validates Phase A persistence is intact for the new state).
4. Each new UI feature passes a manual smoke test in both `Team View` and `Client View`, in both EN and ES.
5. `osv-scanner` shows no new high/critical vulnerabilities introduced by any added dependency.

---

_Generated 2026-05-13 by Claude during the post-meeting walk-through. Update this doc as scope changes — every line traces back to a specific bullet in the 2026-05-11 meeting notes._
