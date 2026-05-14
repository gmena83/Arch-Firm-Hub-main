# KONTi Dashboard — Development Roadmap

_Generated 2026-04-23 from a code + logs + test-result audit of the KONTi MVP._

This roadmap captures the gaps, fixes, and optimizations identified during a sweep of the codebase, the running workflows' logs, and the most recent end-to-end test results. It is organized into eight Dev Phases (A–H), in roughly the order you'd want to attack them. Each item lists the files involved and a one-line fix hint so an engineer can pick it up directly. The appendix lists the follow-up tasks that have already been proposed in the project, mapped to the phases below.

The phases are ordered by risk-to-confidence ratio: the earliest phases protect the data you've already collected and the API contract, the middle phases harden security and tests, and the later phases are about polish, performance, and operations. Within each phase the bullet items can be picked up in any order — the phase ordering only matters across phases, not inside one.

---

## Executive summary

- **Status:** All three artifacts (api-server, konti-dashboard, mockup-sandbox) are running in development. The dashboard typecheck is clean. The most recent production deploy succeeded — what looked like a crash in the deploy logs is just normal Autoscale cool-down (the server idled, then received `SIGTERM`).
- **Biggest gap (Phase A):** Most mutable data (notes, receipts, contractor estimates, report templates, punchlist edits, project mutations) lives in plain in-memory arrays in `seed.ts` and route modules. Anything entered after deploy is lost on restart, so any "real" usage is currently a demo.
- **Second-biggest gap (Phase B):** Roughly six client panels still call the legacy `customFetch` helper instead of the typed hooks generated from the OpenAPI spec, and several routes are not in `lib/api-spec/openapi.yaml` at all. The contract drifts every time a route is added.
- **Hardening (Phase C):** A handful of read-only project routes are still public; the role + ownership pattern from earlier tasks should be applied consistently. Error response shape is also inconsistent across routes.
- **Test coverage (Phase D):** AI, notifications, leads, and dashboard routes have no integration tests; one estimating test has a brittle hardcoded tolerance that drifts when seed data changes.
- **AI / PDF / OCR (Phase E):** Receipt OCR and the report-template PDF export are still mocked or short-circuited. They look real to the user, but they're not.
- **Performance (Phase F):** API bundle is 2.1 MB with a build-time warning; Vite has a slow cold start; production source maps are 5 MB.
- **UX freshness, i18n, a11y (Phase G):** Phase-advance doesn't fully refresh dependent panels; a few hard-coded English strings remain; a few forms lack accessible labels.
- **Ops (Phase H):** Currently `autoscale` (cheap, cold starts). Switch to Reserved VM if always-on latency matters; add a static health probe for the dashboard artifact.

The project is in good shape for an MVP demo and is already deployed. To convert it into something teams use day-to-day, Phase A is the unblocker — without persistent storage, every "save" the user performs is a lie, and that erodes trust faster than any cosmetic bug.

---

## How to read each phase

Each phase below uses the same lightweight structure so the document can be skimmed:

1. **Why this phase comes here.** A one-paragraph rationale for the ordering.
2. **The bullet list of findings.** Each bullet is a concrete file location, a description of the gap, an arrow (→) pointing to the recommended fix, and (where one exists) a reference to the project task that already tracks it.
3. **Sequencing tip.** When the items inside the phase have an obvious internal order, it's called out. When they don't, the bullets can be done in any order.
4. **User-facing outcome.** What the user will actually notice once the phase is complete. For some engineering-only phases this is "nothing directly," and that's flagged honestly.
5. **What "done" looks like.** A short, verifiable definition of done so the team can confidently strike the phase off the list.

If you only have time to read one phase, read Phase A. If you only have time to read two, read A and B.

---

## Phase A — Persistence (data durability)

**Why first:** every other improvement is undermined while data disappears on restart. A user who enters a receipt and finds it missing the next morning will not enter another one. Once the data layer is durable, the rest of the roadmap compounds: tests can assert state across restarts, performance work can rely on stable seed data, and AI features can quote previously-saved notes.

**User-facing outcome:** when this phase lands, "save" actually means save. The user can close the tab, redeploy, restart the workflow, walk away for a week, and return to find every entry where they left it. That is the single biggest perceived-quality improvement in the entire roadmap, and it costs nothing to the user except waiting a few sprints.

**What "done" looks like:** the in-memory arrays in `seed.ts` are read-only, every mutation goes through Drizzle, and a fresh `pnpm --filter @workspace/api-server run dev` followed by an immediate restart shows the same data both times.

The pieces below are roughly grouped by feature area so they can be split among contributors without stepping on each other.

- **AI assistant in-memory state.** `artifacts/api-server/src/routes/ai.ts` keeps `PROJECT_NOTES` (~L23) and `SPEC_EVENTS` (~L26) as plain arrays. The handler at `POST /api/projects/:id/notes` (~L161) pushes into that array and returns success, but a redeploy or even a workflow restart wipes everything. → Move both to Drizzle tables, replace the array push with `db.insert`, and replace the array filter in the read path with a `db.select`. Tracked as **#30**.
- **Estimating in-memory state.** `artifacts/api-server/src/routes/estimating.ts` holds `EXTRA_MATERIALS` (~L81), `LABOR_RATES` (~L92), `PROJECT_RECEIPTS` (~L94), `PROJECT_REPORT_TEMPLATE` (~L95), and `PROJECT_CONTRACTOR_ESTIMATE` (~L96) all in process memory. → Persist with Drizzle so receipts, contractor estimates, and saved report templates survive a restart. The receipts table will need a parent-project foreign key and an `uploaded_at` index for the project-detail view. Tracked as **#27**.
- **Seed data is mutated in place.** `artifacts/api-server/src/data/seed.ts` exports `PROJECTS`, `PROJECT_TASKS`, `DOCUMENTS`, etc. as mutable arrays (~L54, L132, L398). Routes push into them as if they were a database. → Treat the seed as a read-only fixture and write deltas to the real database, or migrate the entire data layer behind a small repository abstraction so swap-out is a one-time cost.
- **Punchlist mutations.** Same pattern as above — punchlist edits live in the in-memory `PROJECT_PUNCHLIST` map populated from the seed. Once persisted, the punchlist gate from Task #25 becomes meaningful across restarts. Tracked as **#32**.

**Suggested sequencing inside the phase:** start with notes (smallest blast radius), then receipts (clearest user-visible win), then punchlist (touches the phase-advance gate), then the bulk seed migration (largest diff). Each step is independently shippable and independently testable.

---

## Phase B — API contract & type safety

This phase comes second because it's the cheapest insurance policy in the roadmap. Persistence (Phase A) makes the data real; type safety (Phase B) makes sure nobody accidentally breaks the way the dashboard reads or writes that real data.

The codegen workflow (`pnpm --filter @workspace/api-spec run codegen`) is the safest way to keep the dashboard in sync with the API. Every route added without a spec update bypasses it, and the dashboard ends up calling those routes through a hand-rolled `customFetch` that returns `unknown`. That's how silent regressions slip in.

This phase has two halves: catch the spec back up to the code, then migrate the remaining client panels onto the generated hooks.

- **Document the missing endpoints in `lib/api-spec/openapi.yaml`:**
  - `GET /api/projects/:id/notes` and `POST /api/projects/:id/notes` (`ai.ts` ~L151, L161)
  - `POST /api/ai/confirm-classification` (`ai.ts` ~L239)
  - `GET /api/projects/:id/spec-updates-report` (`ai.ts` ~L251)
  - `POST /api/projects/:id/spec-updates-report/pdf` (`ai.ts` ~L278)
  - `POST /api/estimating/materials/import` (`estimating.ts` ~L152)
  - `POST /api/projects/:id/receipts` (`estimating.ts` ~L246)
  - `POST /api/projects/:id/report-template` (`estimating.ts` ~L329)
  - The full punchlist endpoint family. Tracked as **#33**.
- After documenting, run `pnpm --filter @workspace/api-spec run codegen` to regenerate the typed React Query hooks in `lib/api-client-react`. This is the moment where TypeScript will start flagging mismatches between routes and panels — that's the goal.
- **Migrate the remaining client panels off `customFetch`** so every call is typed end-to-end. Tracked as **#16**.
  - `artifacts/konti-dashboard/src/pages/project-detail.tsx` (multiple call sites)
  - `artifacts/konti-dashboard/src/components/punchlist-panel.tsx` (~L110)
  - `artifacts/konti-dashboard/src/components/design-panel.tsx` (~L110)
  - `artifacts/konti-dashboard/src/components/change-orders-panel.tsx` (~L88)
  - `artifacts/konti-dashboard/src/components/proposals-panel.tsx` (~L58)
  - `artifacts/konti-dashboard/src/components/inspections-section.tsx` (~L92)

**Sequencing tip:** document and codegen first as a single PR (no behavior change), then migrate panels one at a time. Each panel migration becomes a small reviewable diff that adds typed hooks and removes a `customFetch` call.

**User-facing outcome:** none directly — this is an engineering investment. The payoff is that the next time someone changes a request or response shape on the server, the dashboard will fail to compile instead of failing in the browser at the worst possible moment. Reduced bug rate and faster feature work are the visible signals.

**What "done" looks like:** the OpenAPI spec is the source of truth for every request the dashboard makes. A grep for `customFetch` in `artifacts/konti-dashboard/src/` returns zero matches in panels, and the codegen step is wired into the workflow definition so it can't be forgotten.

---

## Phase C — Authorization & ownership hardening

Earlier tasks (#15, #19) introduced an ownership pattern for client-facing project actions. This phase applies it consistently so the next time a security audit happens, every project route either explicitly allows public access (with a comment) or runs through the same role + ownership pipeline.

- **Public read routes that should require a role.** In `artifacts/api-server/src/routes/projects.ts`:
  - `GET /api/projects` (~L88)
  - `GET /api/projects/:projectId` (~L164)
  - `GET /api/projects/:projectId/tasks` (~L173)
  - `GET /api/projects/:projectId/weather` (~L178)

  → Wrap with `requireRole(["team", "admin", "superadmin", "architect", "client"])` and `enforceClientOwnership` so clients only see their own projects. Tracked as **#20**.
- **Standardize error responses.** Several handlers throw raw strings or send `{ error }` objects with no stable shape. The dashboard then renders inconsistent toast messages depending on which route failed. → Centralize in an error middleware so every failure ships `{ code, message, messageEs }` and the dashboard can render a single bilingual toast component for all of them. Tracked as **#39**.

The win here is mostly invisible to the user: nothing should change in normal operation. But the next time a malicious client tries to read another customer's project, the system will say "no" for the same reason it already says "no" on the actions covered by #15 and #19.

**User-facing outcome:** clients see only the projects they own, errors render with the same bilingual toast everywhere, and unauthorized requests fail with a clear message instead of a confusing 500.

**What "done" looks like:** every route handler in `routes/projects.ts` either explicitly opts out of auth (with a comment explaining why) or runs through `requireRole` + `enforceClientOwnership`. A single error middleware shapes every failure, and the dashboard's toast component reads `code`, `message`, and `messageEs` from a stable response shape.

---

## Phase D — Test coverage & CI gates

The end-to-end suite (Task #37) is the new safety net; this phase wires it tight and fills the remaining holes. The goal is to make a "green CI" badge actually mean "the demo flow still works end-to-end".

- **Missing route-level integration tests** in `artifacts/api-server/src/routes/`:
  - `ai.ts` — covered by **#31**
  - `dashboard.ts`
  - `notifications.ts`
  - `leads.ts`
- **Brittle existing test.** `artifacts/api-server/src/routes/estimating.test.ts` (~L104) hard-codes `Math.abs(carpAfter.hourlyRate - 41.61) < 0.05`. The expected value drifts whenever seed labor rates change. → Either compute the expected value from the seed in the test, or assert a relationship (e.g., "average is within 10% of the input rates") instead of a literal.
- **CI integration.** Wire the e2e suite into a GitHub Action (or equivalent) so every push runs the lifecycle gates. Tracked as **#38**.
- **Lead-to-project lifecycle in e2e.** Add the synthesized lead → project flow to the suite so the conversion path is regression-tested. Tracked as **#40**.

**Sequencing tip:** the brittle test should be the first thing fixed; it can mask other regressions while it flickers red on unrelated PRs. The CI wiring (#38) is best done after the new tests (#31) land, so the CI run starts out green.

**User-facing outcome:** none directly, but the team ships faster and breaks fewer things, which the user perceives as "the app keeps getting better and nothing keeps regressing."

**What "done" looks like:** every route under `artifacts/api-server/src/routes/` has at least one happy-path and one auth-failure test, the e2e suite runs on every push, and a red CI blocks merge.

---

## Phase E — AI assistant, PDF export, and OCR

These are the items where "demo magic" still hides behind a stub. They look real to the user and that's fine for an MVP, but each one is a known place where the product owner will eventually be surprised.

- **Receipt OCR is faked.** `artifacts/api-server/src/routes/estimating.ts` (~L265) "parses" receipts by splitting CSV-like rows and looking for keywords. → Replace with PDF.co (already configured via `PDF_CO_API_KEY`) for image/PDF text extraction, then a small structured-extraction call to the AI provider to map line items into the `PROJECT_RECEIPTS` schema. Tracked as **#28**.
- **Report-template PDF export bypasses the saved template.** `artifacts/api-server/src/routes/projects.ts` (~L354) generates the PDF by hitting a dashboard URL, ignoring the `PROJECT_REPORT_TEMPLATE` that the user customized in `estimating.ts` (~L95). The user's template edits never reach the exported PDF. → Render the saved template directly (server-side HTML → PDF) instead of screenshotting the dashboard. Tracked as **#29**.
- **Naive client-question detection.** `artifacts/api-server/src/routes/ai.ts` (~L385) uses a regex that misses questions without `?` or asked obliquely. → Either tighten the regex with a small list of intent verbs, or add a tiny classifier call ("is this a question? yes/no") at the top of the chat handler.
- **AI provider fallback has no retry/backoff.** `ai.ts` (~L422) only switches to OpenAI when the Anthropic SDK throws. → Add a short retry with exponential backoff before the fallback, so transient timeouts don't immediately cost a fallback round-trip.

**Risk note:** Phase E touches the highest-visibility features (AI, PDF, receipts). Pair these with the e2e tests from Phase D — every change here should land with a regression test that locks in the new behavior.

**User-facing outcome:** receipts that were previously typed by hand can be uploaded as a photo; the report PDF actually reflects the user's chosen template; the assistant catches questions it currently misses; transient AI provider hiccups stop showing as errors.

**What "done" looks like:** uploading a sample paper receipt produces a structured row in the receipts table; exporting a project report uses the saved template verbatim; an Anthropic timeout retries silently before falling back to OpenAI.

---

## Phase F — Performance & bundle

These are quality-of-life improvements. None of them block users, but each one shaves perceptible latency.

**Sequencing tip:** the source-map cleanup is a 5-minute change and should land first as a quick win. The bundle split is medium effort. The Vite chunking is the lowest priority — it shaves a perceived second off the cold start, not a measurable functional improvement.

- **API bundle is 2.1 MB.** The api-server build log explicitly warns about `dist/index.mjs`. The Anthropic and OpenAI SDKs dominate the size. → Either dynamic-import the AI router only when an `/api/ai/*` route is hit, or split AI into its own service so the rest of the API stays small. Either approach drops cold-start time.
- **Vite cold start ~5 s on Replit.** Configure `manualChunks` in `artifacts/konti-dashboard/vite.config.ts` for `lucide-react`, `recharts`, and `@radix-ui/*` so subsequent loads benefit from the browser cache and the first paint isn't dominated by chart code that the dashboard doesn't need on every page.
- **Source maps are 5 MB.** Make sure they ship only in development; gate generation on `NODE_ENV` in the build script. There's no reason production traffic should pay the bandwidth cost of debugging maps.

**User-facing outcome:** the dashboard feels snappier. First paint is faster after the chunk split, the API cold-starts faster after the AI router is dynamic-imported, and the network tab is no longer dominated by source maps.

**What "done" looks like:** the api-server build no longer prints the bundle-size warning; Vite's reported initial chunk for `/` is under 300 KB; production HTML responses don't reference `.map` files.

---

## Phase G — UX freshness, i18n, accessibility

This is the polish phase — small fixes the user will feel as "the app is sharper now" without being able to say exactly why.

**Sequencing tip:** real-time freshness (#34) is the highest-impact item because it removes a recurring "did it work?" moment from the user's flow. The i18n and a11y items are independently small and can be picked up by anyone with a free hour.

- **Real-time freshness after phase advance.** `artifacts/konti-dashboard/src/pages/project-detail.tsx`'s `advancePhase` mutation does not invalidate every dependent query (punchlist, milestones, design phases). The user advances a phase and sees stale data until they hard-refresh. → Add `queryClient.invalidateQueries({ queryKey: ["projects", id] })` in `onSuccess` and broaden the key to cover descendant panels so React Query refetches everything that depends on the project's phase. Tracked as **#34**.
- **Hard-coded English strings.** Spot checks found copy that should run through the `t(en, es)` helper:
  - `artifacts/konti-dashboard/src/components/layout/sidebar.tsx` — section headings and a couple of titles
  - `artifacts/konti-dashboard/src/pages/login.tsx` — supporting copy below the form
- **Accessibility polish.** Custom panels (e.g. `PunchlistPanel`) lack `aria-describedby` on their forms; some text inputs are missing a paired `<Label htmlFor>`. → Audit the consumers of `artifacts/konti-dashboard/src/components/ui/` and add labels. The Radix-based dialogs and selects are already good; the gap is mostly in custom panels written before the UI library was standardized.
- **Client home focus.** Show the construction status card on the client home for a more focused view, so the client lands on the most important fact first. Tracked as **#18**.
- **Inspection management.** Let staff remove inspections that were created in error. Today the inspection list is append-only, which trains people to be cautious instead of trusting the tool. Tracked as **#17**.

**User-facing outcome:** the dashboard feels current after every action, every screen reads correctly in both languages, and screen-reader users can fill in the same forms as everyone else.

**What "done" looks like:** advancing a phase updates the punchlist and milestone cards without a refresh; a Spanish-speaking user can navigate the whole sidebar and login screen in Spanish; running an automated a11y scan on the project-detail page returns zero label-pairing violations.

---

## Phase H — Deployment & ops

The app is deployed and reachable. This phase is about taking the operational defaults that worked for the demo and making deliberate decisions for sustained use.

- **Deployment target.** `.replit` deploys as `autoscale`. The production logs show the server idling and receiving `SIGTERM` ~2 minutes after the last request — that's normal Autoscale behavior, not a crash. The trade-off is: cheap when no one is using it, but every first-of-the-day visit pays a cold start. If predictable cold-start-free latency matters more than cost, switch to a Reserved VM. The decision is a product call, not a technical one.
- **Healthchecks.** `artifacts/api-server/src/routes/health.ts` covers the API. Add a static health probe (e.g. a 200 response on the dashboard's `/index.html`) for the dashboard artifact so deploy gates can verify the SPA shell loads, not just the API.
- **Logging.** Pino is configured but the worker thread shims (`pino-worker.mjs`, `pino-file.mjs`, `pino-pretty.mjs`) are bundled into production. Confirm that pretty-printing is dev-only and that the log level defaults to `info` in prod. The pretty-print transport is ~115 KB and slows the first log line; it should never run in production.

**User-facing outcome:** if the team chooses Reserved VM, the first visit of the day no longer hangs for a few seconds; either way, deploys fail loudly (and recoverably) when the dashboard SPA itself is broken, instead of silently shipping a white screen.

**What "done" looks like:** the deployment mode is documented as a deliberate decision (with the trade-off noted next to it); the dashboard healthcheck is wired into the deploy gate; production log lines are JSON, one per line, at `info` level, with no pretty-print artifacts.

---

## Appendix — Already-proposed follow-up tasks

These are the task references already on the project board, mapped to the phases above. New work should reference these by number rather than re-creating them. The two columns to the right are the phase the task belongs to and the work order line you'd see in standup.

| Ref | Phase | Title |
| --- | --- | --- |
| #16 | B | Make the rest of the project detail panels fully type-safe |
| #17 | G | Let staff remove inspections that were created in error |
| #18 | G | Show the construction status card on the client home for a more focused view |
| #20 | C | Lock down the team-only project actions with the same ownership pattern |
| #27 | A | Persist receipts and contractor estimates so they survive a server restart |
| #28 | E | Replace mocked receipt OCR with real PDF/image extraction |
| #29 | E | Use the saved report template when exporting project PDFs |
| #30 | A | Save AI assistant notes and updates so they survive restarts |
| #31 | D | Add automated tests for the new AI assistant endpoints |
| #32 | A | Persist punchlist edits so they survive a server restart |
| #33 | B | Show punchlist endpoints in the API documentation |
| #34 | G | Update the project page in real time after advancing a phase |
| #38 | D | Wire the e2e suite into CI so every push runs the lifecycle gates |
| #39 | C | Standardize error responses so every failure includes a human-readable message |
| #40 | D | Cover the synthesized lead-to-project lifecycle in the e2e suite |

---

## Quick wins (cherry-pick list)

For when there's an unexpected free hour and someone wants a small, satisfying landing without picking up a multi-day phase. None of these are new findings — they're items already listed in the phases above, gathered here by effort.

- **5–10 minutes each:**
  - Gate source-map generation on `NODE_ENV` (Phase F).
  - Replace the hard-coded labor-rate tolerance in `estimating.test.ts` (Phase D).
  - Wrap the few hard-coded English strings in `sidebar.tsx` and `login.tsx` with the `t(en, es)` helper (Phase G).
- **One afternoon each:**
  - Document one missing route in `openapi.yaml` and migrate one panel off `customFetch` (Phase B).
  - Add `requireRole` + `enforceClientOwnership` to the four public read routes in `projects.ts` (Phase C).
  - Add `queryClient.invalidateQueries` after `advancePhase` and any other phase-changing mutation (Phase G).
  - Add the static dashboard healthcheck and confirm Pino isn't pretty-printing in production (Phase H).

These are not a substitute for working through the phases in order — they're a way to keep momentum on a slow day.

---

## How to use this document

- **Picking up a phase:** start with the topmost unchecked item, read the linked file at the cited line range, and confirm the finding still applies (the codebase moves fast). Then either open the linked task ref or scope a new one.
- **Closing an item:** when a finding is addressed, link the task or PR next to it and strike the line through with `~~...~~`. Don't delete it — the history of which findings were closed is itself useful context.
- **Adding new findings:** add them under the relevant phase rather than starting a new doc. If a finding doesn't fit any phase, reconsider whether it's really a roadmap item or a one-off bug ticket.
- **Re-prioritizing:** the phase order here is a recommendation, not a contract. If the product calendar pushes (say) a payments integration to the front, that becomes Phase A1 and everything else slides down. Just keep the dependency arrows honest — don't try to do Phase D's CI wiring while Phase A is half-migrated, because the tests will be measuring the wrong thing.

_Maintained by the engineering team._
