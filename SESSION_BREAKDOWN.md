# KONTi Dashboard — 4-Session Execution Plan

> **What this is:** the consolidation of [KONTI_V1_FEEDBACK_PLAN.md](./KONTI_V1_FEEDBACK_PLAN.md) (9 phases P0–P8) plus [CODEBASE_FINDINGS.md](./CODEBASE_FINDINGS.md) (43 findings) into **4 work sessions**, one session per Claude Code working pass. Everything from both source docs is covered — nothing is dropped.
>
> **Cadence:** one session per working day (or one long focused block per session). At the end of each session, the app should typecheck and the tests that exist for the touched surface area should pass.
>
> **Deployment target:** **Vercel** for the dashboard, **Railway** (recommended) or Render for the api-server, **Neon** or Supabase Postgres for the database. See [Deployment recommendation](#deployment-recommendation) at the bottom.
>
> **Session sequencing rule:** sessions are strictly serial — Session 2 assumes Session 1's persistence + id-helper landed; Session 3 assumes Session 2's site-visit module is in place; Session 4 assumes everything else.

---

## Session 1 — Pre-trial hardening + Calculator overhaul

**Theme:** make the trial safe to start and rebuild the calculator into the workflow KONTi actually uses.

**Source phases & findings:** plan P0, P1 · findings C-1 → C-5, H-1, H-3, H-4, M-5, M-7, M-9, M-10, N-1, N-6

### Server-side (api-server)

| Task | Source | Files |
|------|--------|-------|
| C-4 / N-1 — Centralized `nextId(prefix)` helper using `crypto.randomUUID()`. Replace all `Date.now() + Math.random()` IDs across `ai.ts`, `leads.ts`, `estimating.ts`, `contractors.ts`. | findings | new `artifacts/api-server/src/lib/id.ts` + 4 route files |
| C-2 — `await` the 4 `void persist*()` calls in `ai.ts`. Respond 500 `persist_failed` on failure. | finding | `artifacts/api-server/src/routes/ai.ts:338, 377, 406, 570` |
| C-3 — Stream error handler on the AI fallback `pipe(res)`. | finding | `artifacts/api-server/src/routes/ai.ts:514` |
| C-5 — Add `requireRole` to `GET /projects/:projectId/weather` (the only remaining ungated read; the other 3 are already gated). | finding | `artifacts/api-server/src/routes/projects.ts:369` |
| C-1 — `express-rate-limit` (5 req / 15 min / IP) + honeypot field on `POST /leads`. | finding | `artifacts/api-server/src/routes/leads.ts:47`, intake form |
| H-3 — Validate `clientUserId` in `POST /leads/:id/accept` against requester identity. | finding | `artifacts/api-server/src/routes/leads.ts` |
| H-4 — Wrap multi-statement `accept` persistence in a Drizzle transaction. | finding | `artifacts/api-server/src/routes/leads.ts` |
| M-5 — Null-safe `lead.location.split()`. | finding | `artifacts/api-server/src/routes/leads.ts:252` |
| M-7 — Project-metadata bounds (`squareMeters ∈ [0,100_000]`, `bathrooms ∈ [0,50]`, etc.). | finding | `artifacts/api-server/src/routes/projects.ts:1440-1450` |
| M-9 — `persistPunchlistForProject` inside `advance-phase`. | finding | `artifacts/api-server/src/routes/projects.ts:1475` |
| M-10 — Lead-accept concurrency serialization. | finding | `artifacts/api-server/src/routes/leads.ts:149-170` |
| P1.2 — Parse master MATERIALS xlsx into `master-materials.ts`. Embed as typed array; **do NOT touch `seed.ts`** (N-6). | plan + Appendix A.3 | new `artifacts/api-server/src/data/master-materials.ts` |
| P1.2 — Seed calculator on lead-accept: `seedCalculatorWithMasterMaterials(projectId)`. | plan | `routes/leads.ts` accept handler, calls `persistCalculatorEntriesForProject` |
| P1.3 — `containerCount` field on `projects` schema (default 1, min 1, max 50) + multiplication helper. | plan | lib/db schema + new endpoint `PATCH /projects/:id { containerCount }` |
| P1.4 — Manual labor + margin overrides on contractor estimate. | plan | new `PATCH /projects/:id/contractor-estimate/overrides` |
| P1.5 — Custom material/contractor line endpoint. | plan | `routes/estimating.ts` |
| P1.8 — Add `hoursWorstCase / hoursMostLikely / hoursBestCase` to `ContractorEstimateLine`. | plan | `routes/estimating.ts` types |
| P1.9 — `riskClassification` enum field on `projects`. | plan | lib/db schema |
| H-1 — Replace hardcoded labor-rate tolerance in test. | finding | `routes/__tests__/estimating.test.ts:120` |

### Client-side (konti-dashboard)

| Task | Source | Files |
|------|--------|-------|
| P1.1 — Calculator step-rail reorder: Estimate → Contractor → Materials Library → Variance. | plan | `pages/calculator.tsx` |
| P1.4 — Visible manual labor rate + margin inputs in Contractor step. | plan | `components/estimating/contractor-calculator.tsx` |
| P1.5 — "Add custom line" UI inside Materials + Contractor steps. | plan | `pages/calculator.tsx` |
| P1.6 — Black contrast panel (`bg-konti-dark text-konti-light`) for Grand Total + Plus Fee. | plan | `pages/calculator.tsx` summary section |
| P1.7 — Number-input step + min validations. | plan | `pages/calculator.tsx:362-389` |
| P1.8 — 3-tier scenarios card in Contractor step. | plan | `components/estimating/contractor-calculator.tsx` |
| P1.9 — Risk Classification pill near phase header. | plan | `pages/project-detail.tsx` header |
| Intake honeypot field (companion to C-1 server side). | finding | `pages/intake.tsx` |

### Verification gate

- [ ] `pnpm typecheck` clean
- [ ] `pnpm --filter @workspace/api-server run test:e2e` green (or known-flaky list)
- [ ] Manual smoke: accept a lead, confirm calculator pre-populated with master materials, change container count, see qty multiply
- [ ] Manual smoke: trigger an AI chat, confirm restart preserves the note

---

## Session 2 — Reports, Photos, Site Visits

**Theme:** rebuild the surfaces the team uses every day — client report, photo flow, and the on-site capture pad.

**Source phases & findings:** plan P2, P3 · findings H-2, H-6, H-7, M-1, M-2, L-7, L-8

### Server-side

| Task | Source | Files |
|------|--------|-------|
| P2.2 — `reportSectionVisibility` map on projects + `PATCH /projects/:id/report-visibility`. | plan | schema + new route |
| P2.5 — Extend `Document.type` enum to include `audio`, `video`, `note`. Update Drive sync. | plan | schema + `lib/drive-sync.ts` |
| P2.6 — `POST /projects/:id/client-report/pdf` rendering saved template server-side. | plan + dev.md #29 | new route, html→pdf renderer |
| P3.1 — `site_visits` + `site_visit_items` schema. | plan | lib/db schema |
| P3.1 — `POST /projects/:id/site-visits` (already exists, extend with items[]). | plan | `routes/projects.ts` |
| P3.3 — Whisper transcription job: `lib/transcribe.ts` + new columns `transcript_text`, `transcript_status`. | plan + user clarification | new lib + schema |
| P3.5 — Drive bundle sync `uploadSiteVisitBundleToDrive(visitId)`. | plan | `lib/drive-sync.ts` |
| M-2 — Wire `DELETE /projects/:id/inspections/:inspectionId` (already a route per finding — verify). | finding | `routes/projects.ts` |

### Client-side

| Task | Source | Files |
|------|--------|-------|
| P2.1 — Promote "View Report" entry-point from text-shadow link → primary Button. Add sticky right-rail card. | plan | `pages/project-detail.tsx:1535-1541` + `:1815+` |
| P2.2 — Report-section toggles drawer (gear icon on report header). | plan | `pages/project-report.tsx` |
| P2.3 — Cover-photo flow: report's photo section reads `featuredAsCover` first, then falls back. | plan | `pages/project-report.tsx` |
| P2.4 — Photo upload modal: `photoCategory` + `goesToPunchlist` toggle at upload time. | plan | `pages/project-detail.tsx:147+` `UploadModal` |
| P2.5 — Audio / Video / Text upload chips in the upload modal. | plan | `UploadModal` |
| P2.6 — "Preview PDF" button on report page rendering server-side PDF. | plan | `pages/project-report.tsx` |
| P3.1 — New `components/site-visit-panel.tsx` with multi-row capture grid. | plan | new component |
| P3.2 — `useAudioRecorder` hook using `MediaRecorder`. | plan | new hook |
| P3.4 — Per-item `clientVisible` toggle on each capture row. | plan | `site-visit-panel.tsx` |
| M-1 — Centralize cover-photo invalidation set in `refreshDocs()`; call from all 3 handlers including toggle-cover. | finding | `components/site-photos-gallery.tsx:178-183` |
| M-2 — Trash-icon UI on each inspection row, gated to `team / admin / field_admin`. | finding | `components/inspections-section.tsx` |
| H-2 — `await handleFiles(...)` with try/catch in UploadModal. | finding | `pages/project-detail.tsx:438, 445` |
| H-6 — `aria-label` on icon-only buttons across sidebar, gallery, calculator HelpCircle. | finding | sidebar.tsx, site-photos-gallery.tsx, calculator.tsx |
| H-7 — Magic-byte sniff for empty-MIME uploads. | finding | `pages/project-detail.tsx:188-220` |
| L-7 — Use Radix `<Dialog>` for photo lightbox (focus trap). | finding | `components/site-photos-gallery.tsx` |
| L-8 — Strip oversized `data:` URLs from photo list responses. | finding | `routes/projects.ts` document handler |

### Verification gate

- [ ] Cover-photo flip on a project updates the dashboard project card AND the report in one mutation.
- [ ] A 90-second Spanish audio recorded in browser produces a Whisper transcript inline within 30s.
- [ ] Each site-visit item has its own internal/client toggle and the client view honors it.
- [ ] Manual a11y scan via axe-core on `/projects/:id` returns zero label-pair violations.

---

## Session 3 — Categories, Field Admin, Real-Invoice, Variance, Permits

**Theme:** standardize the data backbone and unlock the financial reconciliation workflow.

**Source phases & findings:** plan P4, P5, P6 · findings H-5, H-8, M-3, M-4, M-6, M-8, L-1, L-2, L-3, L-4, L-6, L-9, L-10

### Server-side

| Task | Source | Files |
|------|--------|-------|
| P4.1 — Add Phase 1–5 sub-categories + EXTERIOR & ADD-ONS sub-keys to `TRADE_TO_BUCKET` + `TRADE_LABELS`. (No migration — keys are additive.) | plan + Appendix A.1 | `lib/report-categories/src/index.ts` |
| P4.3 — `field_admin` role in `lib/db/src/schema/lifecycle.ts` enum. | plan | schema + `middlewares/require-role.ts` |
| P4.5 — Canonical contractor seed (~20 contractors + 5 internal stakeholders from Appendix A.4). Idempotent migration `contractors-seed-2026-05`. | plan + Appendix A.4 | new `data/canonical-contractors.ts` + `lifecycle-store.ts` |
| P5.1 — Real receipt OCR via PDF.co `/v1/pdf/convert/to/text`, then Claude/GPT structured-extraction. | plan + finding H-8 + dev.md #28 | `lib/receipt-ocr.ts` |
| P5.2 — Multi-item line confirmation endpoint. | plan | `routes/estimating.ts` |
| P5.3 — Variance aggregation reads from `receipt_line_items`. | plan | `routes/estimating.ts` |
| P5.4 — `chargeable: boolean` (= `Class: Included/Excluded`) on `receipt_line_items` + `project_cost_plus_lines`. | plan + Appendix A.8 | schema |
| P6.1 — Permits Checklist module: `project_permits` + `permit_checklist_items` + `permit_engineers` tables + routes. | plan + Appendix A.6 | new schema + routes |
| P6.2 — Contractor Monitoring expansion: `contractor_monitoring_entries` table + 5-section routes. | plan + Appendix A.9 | new schema + routes |
| P6.3 — `phase` filter param in `asana-sync.ts`. | plan | `lib/asana-sync.ts` |
| P6.4 — `costListVariant` field on projects. | plan | schema |
| H-5 — Adopt `zod` `validateBody(schema)` middleware across all mutating routes. Wire `lib/api-zod/src/generated/` schemas. | finding | new middleware + every mutating route |
| H-8 — Real OCR (covered by P5.1). | finding | — |
| M-3 — Audit-log actor/entity cache. | finding | `routes/audit.ts:57-60` |
| M-4 — Guard `typeof req.query["phase"] === "string"`. | finding | `routes/projects.ts:1627` |
| M-6 — Unique `(email, day-bucket)` index on leads. | finding | schema + `routes/leads.ts` |
| M-8 — Single error middleware → `{ code, message, messageEs }`. | finding + dev.md #39 | new `middlewares/error.ts` |
| L-1 — Future-date check on lead booking. | finding | `routes/leads.ts:101` |
| L-2 — Test for orphan branch OR remove. | finding | `routes/leads.ts:195-203` |
| L-3 — Wire or delete `__resetAcceptedLeadProjectsCacheForTest`. | finding | `routes/leads.ts:155` |
| L-4 — Persist full location + parsed city. | finding | `routes/leads.ts:252` |
| L-6 — Marked verified-safe; no action. | finding | — |
| L-10 — Augment Express `req.user` types in `lib/api-server/types.d.ts`. | finding | new ambient types |

### Client-side

| Task | Source | Files |
|------|--------|-------|
| P4.2 — Drive folder names match standardized category labels. | plan | `lib/drive-sync.ts` + `pages/project-detail.tsx:105-114` |
| P4.4 — New `pages/field-admin.tsx` with Materials / Contractors / Categories tabs + audit log. | plan | new page + sidebar entry |
| P5.2 — Multi-item OCR confirmation table in `imports-panel.tsx`. | plan | `components/estimating/imports-panel.tsx` |
| P5.4 — `chargeable` toggle per cost-plus row and per receipt line. | plan | `components/cost-plus-budget.tsx` |
| P6.1 — Permits checklist panel (one tab per PCOC/PUS/DEA/REA). | plan | new `components/permits-checklist-panel.tsx` |
| P6.2 — Expanded contractor monitoring panel with 5 sections. | plan | `components/contractor-monitoring-section.tsx` (rename to `-panel.tsx`) |
| P6.3 — Asana task list filtered by current phase. | plan | `pages/project-detail.tsx` tasks panel |
| P6.4 — Urban/Rural picker on lead-acceptance + field-admin page. | plan | `pages/intake.tsx`, `field-admin.tsx` |
| L-9 — Add `lang` to `useMemo` deps where `t()` is captured. | finding | `pages/calculator.tsx:136-145` + other matches |

### Verification gate

- [ ] Field admin (Jorge's role) creates a new master material; team user gets 403 on the same call.
- [ ] Uploading a sample 3-line receipt produces a 3-row confirmation table; toggling `chargeable=false` on one row removes it from billable totals.
- [ ] Creating a new project automatically attaches 4 blank permit checklists with the canonical PCOC rows.
- [ ] Logging a 3-day weather delay on a contractor monitoring sheet shifts its New Finish Date by 3 days.

---

## Session 4 — Tutorials, Manual, Polish, Deployment

**Theme:** close out the trial prep with documentation, the final polish pass, and the actual Vercel + Railway deploy.

**Source phases & findings:** plan P7, P8 · findings M-11, M-12, L-5, all Nits (N-2 → N-8)

### Documentation

| Task | Source | Files |
|------|--------|-------|
| P7.1 — API-key rotation guide (markdown + Loom). Banner on `/integrations`. | plan | new `docs/api-key-rotation.md` |
| P7.2 — Bilingual user manual covering all surfaces. In-app `/help` page. | plan | new `docs/user-manual.md` + new `pages/help.tsx` |
| P7.3 — Excel feedback tracker template with first 3 pre-populated issues. Shared on Drive. | plan | `docs/feedback-template.xlsx` |
| P7.4 — Manual's "Coming next" section for V2 items. | plan | `docs/user-manual.md` |

### Polish + remaining findings

| Task | Source | Files |
|------|--------|-------|
| M-11 — Vite `manualChunks` for `lucide-react`, `recharts`, `@radix-ui/*`. | finding | `artifacts/konti-dashboard/vite.config.ts` |
| M-12 — Wrap remaining hard-coded English in sidebar with `t()`. | finding | `components/layout/sidebar.tsx` |
| L-5 — `htmlFor` pairing on punchlist Add Item dialog inputs. | finding | `components/punchlist-panel.tsx:79-115` |
| N-2 — Standardize `Task #NNN` comment style. | finding | repo-wide |
| N-3 — `pnpm exec prettier --write '**/*.{ts,tsx}'`. | finding | — |
| N-4 — `.localeCompare()` for string sort in audit. | finding | `routes/audit.ts:44` |
| N-5 — `pnpm exec cspell '**/*.{ts,tsx,md}'`. | finding | — |
| N-7 — Migrate test files off `customFetch`. | finding | `routes/__tests__/` |
| N-8 — Delete `lib/api-zod` if H-5 didn't pick it up. | finding | `lib/api-zod` |
| Sidebar i18n cleanup. | dev.md Phase G | sidebar.tsx |
| Source-map gating on `NODE_ENV` (dev.md Phase F quick win). | dev.md | api-server build script |

### Deployment

| Task | Source | Files |
|------|--------|-------|
| Create GitHub repo + push initial commit. | user req | repo root |
| Add `vercel.json` for dashboard (output `artifacts/konti-dashboard/dist`). | new | repo root |
| Add `Procfile` + `railway.json` for api-server. | new | `artifacts/api-server/` |
| Migrate from `.replit` env-var sourcing → Vercel env-vars (dashboard) + Railway env-vars (api-server). | new | docs + UI |
| Provision **Neon** Postgres (free tier) + run all Drizzle migrations against it. | new | `lib/db` |
| Wire managed-secrets backing store to a real KMS (Neon-encrypted column or AWS KMS). | new | `lib/managed-secrets.ts` |
| Update `replit.md` → `DEPLOYMENT.md` with the new platform topology. | new | `DEPLOYMENT.md` |
| End-to-end smoke against the live URLs: lead intake → accept → calculator → site visit → report. | new | manual |

### P8 — Mid-trial review prep (the actual review meeting is post-deploy)

| Task | Source |
|------|--------|
| P8.1 — Calendar invite + agenda for 2026-06-09 mid-trial review. | plan |
| P8.2 — Rehearse the API-key transfer flow with Carla as operator. | plan |
| P8.3 — Document Vercel + Railway tier decision in `DEPLOYMENT.md` (Vercel hobby is fine for the trial; Railway $5/mo developer plan is fine). | plan |

### Verification gate (final)

- [ ] Vercel build + deploy green.
- [ ] Railway build + deploy green; `/api/health` returns 200.
- [ ] Neon Postgres has every Drizzle migration applied; `lifecycle_migrations` table shows all idempotency markers.
- [ ] Lead intake on the live URL → notification email arrives → admin can accept → project exists with master materials seeded → calculator works → report renders.
- [ ] `pnpm typecheck` clean, `osv-scanner` no high/critical, `pnpm exec cspell` < 5 unknown words.
- [ ] User manual + API rotation guide shared with KONTi.

---

## Cross-session reminders

These apply to every session:

1. **Always `await` `persist*ForProject(projectId)` before responding 200.** This is the `replit.md` lifecycle persistence contract.
2. **Every new mutating route gets `requireRole` + (where appropriate) `enforceClientOwnership`.** Default to the smallest role set.
3. **Every new request body shape gets a `zod` schema** (post Session 3 H-5; before then, manual guards).
4. **Every UI text string uses `t(en, es)`.** No bare English in user-visible surfaces.
5. **Every mutation invalidates the right `queryClient.invalidateQueries` keys.** When in doubt, invalidate broadly.
6. **Never edit `artifacts/api-server/src/data/seed.ts` directly** (per `replit.md` user prefs). New data goes in new modules.
7. **Use `crypto.randomUUID()`** via the `nextId()` helper from Session 1 for every new entity ID.

---

## Deployment recommendation

**Vercel for the SPA + Railway for the api-server + Neon for Postgres.**

| Component | Platform | Why |
|-----------|----------|-----|
| `konti-dashboard` (Vite SPA) | **Vercel** | Industry-standard for Vite. Zero-config deploys from GitHub. Free tier covers the trial easily (100GB bandwidth/mo). Pinning `BASE_URL` to the Railway api URL via env-var. |
| `api-server` (Express + Drizzle + queues) | **Railway** | Long-running Node process with the same model as Replit, but cheaper and faster builds. $5/mo developer plan covers the trial. Supports the persistence queues, Whisper background jobs, Asana/Drive sync, and 10MB file uploads — all of which break on Vercel serverless. |
| Postgres | **Neon** | Built-in connection pooler (PgBouncer in Neon's stack) so the api-server's Drizzle pool plays nicely. Free tier: 0.5GB storage, fine for the trial. |
| Object storage (Drive replacement, if ever) | **Cloudflare R2** | Future — keep Drive for now since it's already wired. |

**Why not all-Vercel:**
- `setImmediate` queues in lifecycle-persistence.ts won't survive a serverless cold start.
- AI streaming (`Readable.fromWeb(...).pipe(res)`) exceeds Vercel hobby's 10s function timeout on long generations.
- 10MB photo uploads exceed Vercel's default 4.5MB body limit on hobby.
- Asana/Drive sync uses in-process timers — these die between invocations.

**If you really want all-Vercel later:** that's a V2 refactor — chunked uploads, swap `setImmediate` for Upstash QStash, move Whisper to a Vercel cron, accept the streaming limitation. Add ~3 days of engineering. Not worth it during the trial.

---

_This breakdown is the work-order companion to [KONTI_V1_FEEDBACK_PLAN.md](./KONTI_V1_FEEDBACK_PLAN.md). Open issues that come up during a session that don't fit in this plan go into the Session 4 polish list — don't let scope creep wreck the cadence._
