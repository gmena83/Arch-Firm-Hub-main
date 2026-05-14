# KONTi Dashboard — Codebase Findings (V1 Trial Prep Scan)

> **Generated:** 2026-05-13
>
> **Scope:** Bugs, security gaps, code smells, and quality issues discovered during the post-meeting code audit of `C:\Menatech\03_Client_Work\Arch-Firm-Hub-main`. Items already tracked in `development.md` Phase A–H are noted with a cross-reference but **not duplicated**.
>
> **Companion document:** [KONTI_V1_FEEDBACK_PLAN.md](./KONTI_V1_FEEDBACK_PLAN.md) — the client-feedback implementation plan. Many of the items below should be fixed opportunistically while doing the feedback work in that plan; the "Recommended phase" column maps each finding to a phase in the plan.
>
> **How to use this doc when fixing:**
> 1. Pick an item by severity, starting Critical → High → Medium → Low → Nit.
> 2. Read the file at the exact path:line.
> 3. Implement the fix hint.
> 4. Add a regression test before considering it closed.
> 5. Strike the line with `~~...~~` and link the commit/PR. Don't delete history.

---

## Summary

| Severity | Count |
|----------|------:|
| **Critical** | 5 |
| **High** | 8 |
| **Medium** | 12 |
| **Low** | 10 |
| **Nit** | 8 |
| **Total** | **43** |

By category (across all severities):

| Category | Count |
|----------|------:|
| Runtime defects / real bugs | 11 |
| Security / authorization gaps | 5 |
| Data integrity (persistence races, missing awaits) | 7 |
| UI / UX bugs (stale data, missing invalidation) | 4 |
| i18n / a11y | 4 |
| Tests (missing or brittle) | 5 |
| Performance / bundle | 3 |
| Type safety leaks | 3 |
| Dead code / stale logic | 1 |

---

## CRITICAL — fix before trial starts

### C-1. `POST /api/leads` is fully public

- **File:** `artifacts/api-server/src/routes/leads.ts:47`
- **Category:** Security / authorization
- **Recommended phase:** **P0** (pre-trial hardening) — must land before 2026-05-13.
- **What:** `router.post("/leads", ...)` has **no** `requireRole` middleware. Anyone can POST a lead. This is intentional for the public intake form, but it's also a DoS / spam vector with zero rate limiting and zero CAPTCHA. The same handler triggers an internal team notification (`/api/notifications`) and an Asana task creation, both of which cost real money or real attention per submission.
- **Fix:**
  1. Add rate limiting: in-process `express-rate-limit` with `{ windowMs: 15 * 60 * 1000, max: 5 }` keyed by IP. Block above the limit with `429`.
  2. Add a hidden honeypot field (`<input name="company_url" type="text" hidden>`) on the intake form — if the field is populated server-side, drop the request silently as a bot.
  3. Add the `messageEs` field to the rate-limit error response (Phase C #39 pattern).

### C-2. AI route persists state with `void`-discarded promises

- **File:** `artifacts/api-server/src/routes/ai.ts:377, 406, 570`
- **Category:** Data integrity
- **Recommended phase:** **P0** — this is the silent-data-loss footgun described in `replit.md` ("a crash between ack and queue drain cannot lose acknowledged writes"). Three sites in `ai.ts` violate the pattern that `replit.md` mandates for every other persistence-touching route.
- **What:** Calls like `void persistProjectNotes(projectId)` happen *after* the handler sends `200 OK`. If the server crashes in the next 50ms, the user sees "saved" but the row was never committed. `replit.md` is explicit: "every mutating handler `await`s `persist*` before sending its 200 response, so a 200 OK guarantees the row is durably committed."
- **Fix:** Replace `void persistProjectNotes(...)` with `await persistProjectNotes(...)`. On commit failure, respond `500 { code: "persist_failed", ... }` per the established pattern. Then add an integration test that mocks the DB to throw and asserts the response is 500, not 200.
- **Related:** This is the same shape as `development.md` Phase A #30, but #30 is about migrating AI state to Drizzle in general. C-2 is the narrower "we already have the persistence helper, we're just not awaiting it" subset that's free to fix now.

### C-3. Stream pipe in AI fallback has no error handler

- **File:** `artifacts/api-server/src/routes/ai.ts:514`
- **Category:** Runtime defect
- **Recommended phase:** **P0** — high blast radius (the AI chat is on the dashboard's home screen).
- **What:** `stream.pipe(res)` with no `.on("error", ...)`. If the upstream Anthropic/OpenAI stream errors mid-flight (network blip, upstream 5xx, rate limit), the response hangs forever from the browser's perspective. The user has to reload the page.
- **Fix:**
  ```ts
  stream
    .on("error", (err) => {
      logger.error({ err, projectId }, "AI stream error");
      if (!res.headersSent) {
        res.status(502).json({ code: "ai_stream_error", message: "AI provider stream failed.", messageEs: "Falló el stream del proveedor de IA." });
      } else {
        res.end();
      }
    })
    .pipe(res);
  ```

### C-4. Weak ID generation is collision-prone

- **Files:**
  - `artifacts/api-server/src/routes/ai.ts:325, 369, 404, 558`
  - `artifacts/api-server/src/routes/leads.ts:108, 245`
  - `artifacts/api-server/src/routes/estimating.ts:398, 405, 601, 713`
  - `artifacts/api-server/src/routes/contractors.ts:8`
- **Category:** Security / data integrity
- **Recommended phase:** **P1** (cherry-picked into the calculator work since P1.5 creates a new line-add endpoint that would otherwise duplicate the pattern).
- **What:** Every ID generator uses `Date.now() + Math.random().toString(36).slice(2, 7)` or a variant. Under low traffic this is fine; under burst load (multiple site visits saved simultaneously, P3) the `Date.now()` collides within the millisecond and the `Math.random()` suffix is only 5 chars (≈60M possibilities) — birthday-paradox collision becomes plausible at 8k IDs.
- **Fix:** Replace every site with `crypto.randomUUID()`. Add a `function nextId(prefix: string): string` helper in a single place (`artifacts/api-server/src/lib/id.ts`) and have every route import it. This is also a one-line review-able diff.

### C-5. Public read endpoints leak project data

- **File:** `artifacts/api-server/src/routes/projects.ts:88, 164, 173, 178`
- **Category:** Security / authorization
- **Recommended phase:** **P0** — already tracked as `development.md` Phase C task **#20**, but it's so closely tied to the trial that it can't wait.
- **What:** `GET /api/projects`, `GET /api/projects/:projectId`, `GET /api/projects/:projectId/tasks`, and `GET /api/projects/:projectId/weather` have no auth middleware. Once we share the dashboard URL with KONTi, anyone with the URL can hit these and enumerate every project's data.
- **Fix:** Add `requireRole(["team", "admin", "superadmin", "architect", "client"])` and `enforceClientOwnership` consistent with the rest of `projects.ts`. Standard pattern already exists in this file — use it. Test as in `routes/__tests__/client-ownership.test.ts`.

---

## HIGH — fix during P1–P3 phases

### H-1. Test uses brittle hardcoded labor-rate tolerance

- **File:** `artifacts/api-server/src/routes/__tests__/estimating.test.ts:120` (referenced in `development.md` as ~L104)
- **Category:** Tests
- **Recommended phase:** **P1** (small fix; touches the same module as P1.4).
- **What:** `Math.abs(carpAfter.hourlyRate - 41.61) < 0.05`. The expected value comes from the seed's `DEFAULT_LABOR_RATES`. If the seed changes — and P1.2 will change it — this test goes red on a totally unrelated PR.
- **Fix:** Compute the expected value from `DEFAULT_LABOR_RATES.find(r => r.trade === "Carpenter")!.hourlyRate` weighted by the receipt fixtures; or assert a tolerance relative to the input (`actual within 15% of input average`).

### H-2. File-upload handler is fire-and-forget

- **File:** `artifacts/konti-dashboard/src/pages/project-detail.tsx:438, 445` (inside `UploadModal`)
- **Category:** Runtime defect / UI bug
- **Recommended phase:** **P2** (touches the same modal as P2.4/P2.5).
- **What:** `void handleFiles(files, photoMode)` discards the promise. If `handleFiles` throws after `setUploading(false)` runs, the UI shows "success" while the upload actually failed. React Query invalidation also fires too eagerly.
- **Fix:** Convert to `try { await handleFiles(...); } catch (err) { toast({ variant: "destructive", ... }); }` and only invalidate queries on success.

### H-3. Unvalidated `clientUserId` in lead-accept

- **File:** `artifacts/api-server/src/routes/leads.ts:268`
- **Category:** Security / data integrity
- **Recommended phase:** **P0**.
- **What:** `clientUserId` is read straight from the request body and assigned to the synthesized project with no type or existence check. A malicious client could pass `clientUserId: "<some-other-clients-id>"` and create a project owned by someone else.
- **Fix:** Validate that `clientUserId` is either omitted, equal to the requester's own id, or (when requester is admin) refers to an existing user. Use the same `enforceClientOwnership` pattern's lookup.

### H-4. Multi-statement persistence has no transaction

- **File:** `artifacts/api-server/src/routes/leads.ts:299-306` (the `POST /leads/:id/accept` handler)
- **Category:** Data integrity
- **Recommended phase:** **P1** (lead-accept is the gateway to P1.2's calculator seeding — fixing this avoids partial-state on calculator-seed failure).
- **What:** The handler awaits multiple `persist*ForProject()` calls (lead status, project record, accepted-projects index, activity log) in sequence. If `persistProjectsToDb` succeeds but `persistAcceptedLeadProjects` fails, the system is left with a project that has no `lead_id` link — exactly the "accepted_orphan" condition that the handler 409s on next call.
- **Fix:** Wrap the persistence sequence in a Drizzle transaction (`db.transaction(async (tx) => { ... })`). Drizzle's adapter supports nested transactions; pass `tx` into each `persist*` call.

### H-5. `req.body` cast without runtime validation

- **Files:** `artifacts/api-server/src/routes/projects.ts:272, 393` and ~25 other mutating routes
- **Category:** Type safety / runtime defect
- **Recommended phase:** **P4** (when categories are standardized, a schema sweep is cheap to bundle in).
- **What:** `(req.body ?? {}) as Record<string, unknown>` followed by property access. If the client sends an array or null, the cast succeeds but later `.name` / `.email` / `.trade` access throws a `TypeError` and the handler returns an unhelpful 500.
- **Fix:** Adopt `zod` for inbound payloads. `lib/api-zod/src/generated/` already has generated zod schemas from the OpenAPI spec — wire them into the routes via a `validateBody(schema)` middleware. One-time investment that closes whole categories of bugs.

### H-6. `aria-label` missing on icon-only buttons

- **Files:**
  - `artifacts/konti-dashboard/src/components/layout/sidebar.tsx` (multiple icon buttons)
  - `artifacts/konti-dashboard/src/components/site-photos-gallery.tsx:160, 175, 185` (Star/Pencil/Trash icons)
  - `artifacts/konti-dashboard/src/pages/calculator.tsx:498` (HelpCircle next to Effective Price)
- **Category:** a11y
- **Recommended phase:** **P2** (photos overhaul touches the gallery anyway).
- **What:** Buttons rendered as `<button><Icon /></button>` with no accessible name. Screen-reader users hear "button button button" with no context.
- **Fix:** Add `aria-label={t("Set as cover", "Establecer como portada")}` etc., or pair with `<span className="sr-only">...</span>`. Wrapper components in `components/ui/button.tsx` could enforce this with an ESLint rule.

### H-7. Drag-and-drop file upload accepts unsupported MIMEs silently

- **File:** `artifacts/konti-dashboard/src/pages/project-detail.tsx:188-220` (`uploadFile` callback)
- **Category:** Runtime defect / UX
- **Recommended phase:** **P2.4 / P2.5**.
- **What:** When the user drops a file with an unrecognized MIME type AND an unknown extension, the toast fires correctly. But if MIME is empty (some platforms drop files with `""` MIME — e.g. Linux Firefox dragging a `.heic` from Files) and the extension is one of `ACCEPTED_EXTENSIONS`, the upload proceeds with `type: "other"`. Later the report can't render it.
- **Fix:** Treat empty MIME as a soft fail — sniff the first few bytes for a magic number (`%PDF`, `\xFF\xD8\xFF` for JPEG, `RIFF` for WebP, etc.) and only allow the upload if magic matches the extension.

### H-8. Receipt OCR is mocked

- **File:** `artifacts/api-server/src/routes/estimating.ts:265` (referenced in `development.md` Phase E task **#28**)
- **Category:** Stub code shipping as real
- **Recommended phase:** **P5** (this is the entire premise of P5).
- **What:** The receipt "OCR" splits CSV-like rows and looks for keywords. It cannot read an actual receipt PDF. The user sees plausible structured data because the seed receipt happens to be CSV-shaped. The first real receipt will produce garbage.
- **Fix:** Use PDF.co's `/v1/pdf/convert/to/text` endpoint (key already in `managed-secrets`). Then run a small Claude prompt to map the extracted lines into the schema. Full sequence is documented in P5.1.

---

## MEDIUM — fix during P4–P7 phases (or anytime)

### M-1. Cover-photo flip invalidates project queries but not project list cache

- **File:** `artifacts/konti-dashboard/src/components/site-photos-gallery.tsx:178-183`
- **Category:** UI / stale data
- **Recommended phase:** **P2** (P2.3 touches this exact area).
- **What:** The mutation invalidates `getGetProjectDocumentsQueryKey(projectId)` and `getGetProjectQueryKey(projectId)`, but the dashboard project-list card image (which renders `liveCoverImage`) lives under `getListProjectsQueryKey()`. Code at line 116-118 *does* invalidate the list — but only inside `refreshDocs` for `handleEditCaption` / `handleDeletePhoto`, not `handleToggleCover`. Inconsistent.
- **Fix:** Centralize the invalidation set into a single helper (`refreshDocs` already exists) and call it from all three handlers, including cover-toggle. Today's code does add it inside the toggle handler at L179-183 — but it's a duplicated set, not the helper. Refactor to call `refreshDocs()`.

### M-2. Inspection delete is gated to the calling user, not the role

- **File:** `artifacts/konti-dashboard/src/components/inspections-section.tsx` (referenced in `development.md` Phase G task **#17**)
- **Category:** UI / authorization
- **Recommended phase:** **P3** (inspections are part of the site visit narrative).
- **What:** No delete UI exists; the meeting confirmed staff need to remove inspections that were created in error. Today the list is append-only.
- **Fix:** Wire `DELETE /api/projects/:id/inspections/:inspectionId` (already a route — check) into a trash icon next to each row, gated to `team / admin / field_admin`.

### M-3. Audit endpoint scans the full log on every request

- **File:** `artifacts/api-server/src/routes/audit.ts:57-60`
- **Category:** Performance
- **Recommended phase:** **P5** or later.
- **What:** `for (const e of AUDIT_LOG) ...` builds the actor and entity filter dropdowns by iterating the entire log on every GET. At 10k entries this is ~50ms; at 100k entries it's ~500ms and noticeable.
- **Fix:** Maintain `Set<string>` caches for actors and entity types, updated on every `appendAuditEntry`. Invalidate the cache on store reload.

### M-4. `req.query["phase"]` typed-cast without check

- **File:** `artifacts/api-server/src/routes/projects.ts:1627`
- **Category:** Type safety / runtime defect
- **Recommended phase:** **P6** (P6.1 changes the phase filtering, so consolidating here is natural).
- **What:** `req.query["phase"] as string` succeeds even if the client passes `?phase=foo&phase=bar` (Express turns that into a string array). Downstream `.toLowerCase()` on the array throws.
- **Fix:** Guard with `typeof req.query["phase"] === "string"` before casting.

### M-5. Null-deref risk in lead location parsing

- **File:** `artifacts/api-server/src/routes/leads.ts:252`
- **Category:** Runtime defect
- **Recommended phase:** **P0** (cheap fix in a critical path).
- **What:** `lead.location.split(",")[0]?.trim() ?? lead.location` is mostly defensive, but `lead.location` itself can be `undefined` when the lead came from a legacy import that didn't have a location. Then `.split()` throws.
- **Fix:** `const loc = lead.location ?? ""; const city = (loc.split(",")[0] ?? "").trim() || "—";`

### M-6. Lead email uniqueness not enforced

- **File:** `artifacts/api-server/src/routes/leads.ts:85, 125`
- **Category:** Data integrity
- **Recommended phase:** **P4** (after the field-admin role is wired, the admin can manually deduplicate; the server-side guard can land at the same time).
- **What:** A user submitting the intake form twice creates two lead records. The team sees duplicate notifications and has to manually reconcile.
- **Fix:** Add a unique index on `(email, createdAt-day-bucket)` so the same email within 24h is rejected as `409 already_submitted_today`. Document in the user-facing error.

### M-7. Project metadata accepts negative / absurd values

- **File:** `artifacts/api-server/src/routes/projects.ts:1440-1450` (PATCH project metadata)
- **Category:** Data integrity
- **Recommended phase:** **P1** (P1.3's `containerCount` field is a natural place to add the bounds-check helper).
- **What:** `squareMeters`, `bathrooms`, `kitchens`, `zoningCode` are accepted with no bounds. A negative `squareMeters` produces a negative contractor estimate and a divide-by-zero downstream.
- **Fix:** Add a tiny `bounds(field, min, max)` validator and apply: `squareMeters ∈ [0, 100_000]`, `bathrooms ∈ [0, 50]`, `kitchens ∈ [0, 20]`, `containerCount ∈ [1, 50]`.

### M-8. Inconsistent error response shape

- **Files:** `artifacts/api-server/src/routes/` (most handlers)
- **Category:** UI / error handling (referenced in `development.md` Phase C task **#39**)
- **Recommended phase:** **P7** (the manual is the right place to document the canonical shape).
- **What:** Different handlers return `{ error: "..." }`, `{ error: "...", message: "..." }`, or just a string. The dashboard's toast component can't render a consistent bilingual message.
- **Fix:** Single error middleware that wraps every failure into `{ code: "machine_key", message: "Human EN", messageEs: "Humano ES", details?: ... }`. Migrate routes one-at-a-time.

### M-9. Punchlist edits don't persist on phase advance

- **File:** `artifacts/konti-dashboard/src/pages/project-detail.tsx` (advancePhase mutation; referenced in `development.md` Phase A task **#32**)
- **Category:** Data integrity
- **Recommended phase:** **P1** (calculator overhaul touches phase-advance gating because P1's flow assumes the calculator survives a phase change).
- **What:** Punchlist mutations live in `PROJECT_PUNCHLIST` in-memory map. Advance-phase reads from it but doesn't trigger persistence. After a redeploy, the punchlist resets to the seed.
- **Fix:** Call `persistPunchlistForProject(projectId)` inside the advance-phase handler before responding.

### M-10. Lead-accept race condition

- **File:** `artifacts/api-server/src/routes/leads.ts:149-170`
- **Category:** Data integrity
- **Recommended phase:** **P1** (when lead-accept gets the calculator-seeding work in P1.2).
- **What:** The in-memory `ACCEPTED_LEAD_PROJECTS` cache is consulted before the DB. Two concurrent accept requests can both miss the cache, both synthesize a new project, and both win. The DB then has two projects pointing to the same lead.
- **Fix:** Use a `Map<leadId, Promise<Project>>` to serialize concurrent accepts on the same lead. The second call awaits the first's promise.

### M-11. Vite chunk sizes are unoptimized

- **File:** `artifacts/konti-dashboard/vite.config.ts` (referenced in `development.md` Phase F)
- **Category:** Performance
- **Recommended phase:** **P8** (deploy-mode decision is the right moment to also tune chunks).
- **What:** `lucide-react`, `recharts`, `@radix-ui/*` are bundled into the main chunk. First paint ~5s on Replit.
- **Fix:** Configure `manualChunks` so chart code and Radix dialogs are async chunks. Doesn't change behavior — just shaves the first paint.

### M-12. Hard-coded English in the sidebar

- **File:** `artifacts/konti-dashboard/src/components/layout/sidebar.tsx` (referenced in `development.md` Phase G)
- **Category:** i18n
- **Recommended phase:** **P7** (manual is bilingual; the sidebar should match).
- **What:** Section headings and a few menu items are bare strings, not wrapped in `t()`.
- **Fix:** Wrap each visible string. Run a grep for `>[A-Z][a-z]+ [A-Z]` inside JSX and audit each match.

---

## LOW — fix opportunistically

### L-1. Lead booking accepts past dates

- **File:** `artifacts/api-server/src/routes/leads.ts:101`
- **Category:** Runtime defect
- **What:** `isNaN(Date.parse(body.booking.slot))` validates parseability, not future-ness. A user could book yesterday.
- **Fix:** `new Date(body.booking.slot).getTime() > Date.now()` check before accepting.

### L-2. Unused error branch in lead-accept

- **File:** `artifacts/api-server/src/routes/leads.ts:195-203` (the `already_accepted_orphan` branch)
- **Category:** Dead code
- **What:** Code path is technically reachable only when the persisted lead is `status: "accepted"` AND `findProjectForAcceptedLead()` returns null. In normal operation that's impossible (would require manual DB tampering between persistence calls). The branch is defensive but never exercised in tests.
- **Fix:** Add a regression test that simulates the state and asserts the 409 response; or remove with a comment.

### L-3. `__resetAcceptedLeadProjectsCacheForTest` is exported but uncalled

- **File:** `artifacts/api-server/src/routes/leads.ts:155`
- **Category:** Dead code
- **What:** Exported test helper has zero references.
- **Fix:** Either delete or wire into the test suite (the test fixtures could use it for isolation).

### L-4. `lead.location.split(",")[0]` collapses two-city PR addresses

- **File:** `artifacts/api-server/src/routes/leads.ts:252`
- **Category:** Edge case
- **What:** "Aibonito, PR — sector Asomante" splits into "Aibonito" silently. The user typed extra context that's now lost.
- **Fix:** Persist the full location verbatim AND the parsed city; use the city for filter UIs only.

### L-5. Form labels missing `htmlFor` pairing on custom panels

- **File:** `artifacts/konti-dashboard/src/components/punchlist-panel.tsx:79-115` (Add Item dialog)
- **Category:** a11y
- **What:** `<label>` tags don't have `htmlFor`; inputs don't have `id`. Screen readers fall back to placeholder text.
- **Fix:** Add `id` to each input, `htmlFor` on each label.

### L-6. Audit endpoint query param `limit` not validated against negative values

- **File:** `artifacts/api-server/src/routes/audit.ts:25`
- **Category:** Defensive coding
- **What:** `Math.min(Math.max(parseInt(req.query["limit"], 10) || 100, 1), 1000)` works correctly — `parseInt("-5")` is `-5`, `Math.max(-5, 1)` is `1`. So it's actually fine. Marking this as "verified safe" so it doesn't get re-flagged.

### L-7. Photo lightbox doesn't keyboard-trap focus

- **File:** `artifacts/konti-dashboard/src/components/site-photos-gallery.tsx` (lightbox JSX)
- **Category:** a11y
- **What:** Opening the lightbox doesn't trap focus inside; tab moves to elements behind the overlay.
- **Fix:** Use Radix `<Dialog>` (already in the codebase) or a small focus-trap library.

### L-8. Photo Document `imageUrl` may carry a `data:` URL of unbounded size

- **File:** `artifacts/api-server/src/routes/projects.ts` (document upload handler)
- **Category:** Performance / memory
- **What:** `data:image/png;base64,...` payloads up to 10MB are accepted and stored verbatim. The Drive proxy URL is preferred but the data URL is the fallback. Loading a project's photo list deserializes every data URL into memory.
- **Fix:** When Drive is configured, strip the data URL from the response (already done — verify); when Drive is not configured, return only a thumbnail.

### L-9. The `i18n` helper `t(en, es)` is called from inside `useMemo` factories without listing `lang` as a dep

- **Files:** several — e.g. `artifacts/konti-dashboard/src/pages/calculator.tsx:136-145`
- **Category:** UI / stale data
- **What:** `defaultTemplateColumns(t)` is called inside `useMemo(() => ..., [])` but `t` closes over `lang`. When the user switches language, the memoized value is stale until the parent re-renders.
- **Fix:** Add `lang` to dep arrays, or pull `lang` from `useLang()` and key the memo on `lang` instead of `t`.

### L-10. Unchecked `req.user` cast in contractors route

- **File:** `artifacts/api-server/src/routes/contractors.ts:36, 46`
- **Category:** Type safety
- **What:** `(req as { user?: { email?: string; name?: string; id?: string; role?: string } }).user` succeeds even if middleware didn't populate `req.user`. Subsequent `authUser?.email ?? "system"` papers over it but the route is supposed to be `requireRole`-gated, so `req.user` is always present in correct flows.
- **Fix:** Once `H-5` lands (zod-validated request shape), augment the Express types in `lib/api-server/types.d.ts` with the user object and remove the cast.

---

## NIT — code-style cleanups

### N-1. `Date.now().toString(36).slice(2, 7)` is verbose

- **Files:** several
- **Fix:** Centralize in `lib/id.ts` (see C-4).

### N-2. Comments mix `#127` and `Task #127` for task refs

- **Files:** `routes/projects.ts`, `routes/leads.ts`, `components/project-team-actions.tsx`
- **Fix:** Standardize to `Task #127`. ESLint custom rule could enforce, but probably overkill.

### N-3. Mixed quote styles

- **Files:** throughout
- **Fix:** Run `pnpm exec prettier --write '**/*.{ts,tsx}'`. Confirm `.prettierrc` enforces double-quotes (or single — pick one).

### N-4. Inconsistent ternary vs `.localeCompare`

- **File:** `artifacts/api-server/src/routes/audit.ts:44`
- **Fix:** Use `.localeCompare()` consistently for string sorts.

### N-5. Spell-check pass

- **Files:** comments throughout. Known typo: `comfirm` → `confirm` in at least one comment.
- **Fix:** Run `pnpm exec cspell '**/*.{ts,tsx,md}'` (cspell is fast and has a builtin English+code dict).

### N-6. `seed.ts` has been declared "do not edit" in `replit.md` user preferences

- **File:** `artifacts/api-server/src/data/seed.ts`
- **Note:** When implementing P1.2 (load all materials from Jorge's xlsx), DO NOT mutate `seed.ts` directly. Put the master list in a NEW module like `artifacts/api-server/src/data/master-materials.ts`. The `replit.md` preference is explicit.

### N-7. Test files use `customFetch` instead of typed hooks

- **Files:** various `routes/__tests__/*.test.ts` (referenced in `development.md` Phase B #16)
- **Fix:** Gradually migrate; each test migration is a small reviewable PR.

### N-8. `lib/api-zod` is generated but barely used

- **Files:** `lib/api-zod/src/generated/`
- **Note:** Already noted in H-5. Worth a follow-up to delete if it stays unused after H-5.

---

## Cross-referenced items (already in `development.md`)

The following findings overlap with `development.md` Phase A–H and are **not** restated above. When fixing the items above, also confirm these are still tracked:

- Phase A #27 — Persist receipts and contractor estimates (covers some of M-9's ground)
- Phase A #30 — AI assistant note persistence (covers C-2 conceptually but C-2 is narrower)
- Phase A #32 — Punchlist persistence (covered by M-9)
- Phase B #16 — Typed hooks migration (covered by N-7)
- Phase B #33 — Punchlist endpoints in OpenAPI spec
- Phase C #20 — Read-route role gating (covered by C-5)
- Phase C #39 — Standardize error responses (covered by M-8)
- Phase D #38 — CI wire-up for e2e suite
- Phase D #40 — Lead-to-project e2e coverage
- Phase E #28 — Real receipt OCR (covered by H-8 / P5.1)
- Phase E #29 — Saved report-template PDF export (covered by P2.6)
- Phase F — Bundle size + Vite chunking (covered by M-11)
- Phase G #17, #18, #34 — Inspection delete, client-home focus, post-advance refresh (covered by M-2 + see plan P2/P3)
- Phase H — Deployment mode + healthchecks (covered by P8.3)

---

_Maintained alongside `development.md`. New findings during the trial go into the Excel feedback tracker from P7.3; only codebase-quality findings (not feedback-driven feature work) belong in this file._
