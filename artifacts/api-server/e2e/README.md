# KONTi E2E Test Suite

## Scope — API Contract E2E (not browser UI automation)

This suite exercises the **KONTi API server** end-to-end via HTTP calls. It is
an **API-contract / integration test**, not a browser-based UI automation test.
No headless browser or Playwright is involved. All assertions are against JSON
responses, PDF binary artifacts, and derived state.

If you are looking for UI interaction tests (button clicks, form flows in the
React dashboard), those belong in a separate Playwright/Cypress harness.

## What it covers

| Area | What is proven |
|---|---|
| Lead intake | POST /api/leads → 201, booking slot captured, 400 on incomplete payload |
| Lead acceptance | POST /api/leads/:id/accept → 201 project created, clientUserId assigned |
| Phase lifecycle (Project A) | discovery → consultation → pre_design → schematic → design → CDs → permits → construction → completed |
| Phase lifecycle (Project B) | same path but left at ~80% construction; open punchlist blocks advance |
| Phase lifecycle (Project C) | left at ~30% pre_design; premature permit authorization rejected with `invalid_phase` (phase gate, not authz) |
| Client gate | `requireRole(["client"])` routes called by owning client only; tested positive + negative |
| Cross-tenant isolation | clientA cannot read Project B (owned by clientB) → 403; clientA can read own Project A → 200 |
| Punchlist gating | open items block construction→completed advance; closing all allows it |
| Permit auto-advance | all 7 permits approved → project auto-advances to construction |
| Calculator correctness | line-item totals within ±1% of hand-computed sum |
| Receipt OCR / scan | POST + GET receipts; response shape validated |
| AI photo classification | confirm-classification contract (ok=true, classified=3) |
| AI assistant quality | non-empty, project-bound responses; phase-asking prompt must mention phase keyword; no cross-project leakage |
| PDF generation | binary contract (Content-Type, %PDF- magic, size > 1 KiB) + semantic (project name, phase label in text) |
| Dashboard aggregation | projectsByPhase reflects ≥1 completed, ≥1 construction, ≥1 pre_design |
| Notifications | items array, ≥1 phase_change event, required fields on each item |
| Document completeness | API doc count derived from GET /documents (not local file count) |

## How to run

```sh
# From workspace root:
pnpm test:e2e

# Or from api-server package:
cd artifacts/api-server
pnpm test:e2e
```

The server is started automatically (in-process); no separate `pnpm dev` is needed.

## Artifacts produced

All artifacts land in `test-artifacts/<ISO-timestamp>/`:

```
test-artifacts/2026-04-23T23-53-34-405Z/
  run.log              — human-readable step-by-step log
  run.jsonl            — newline-delimited JSON, one record per step
  run.json             — consolidated JSON { timestamp, steps[], gateResults }
  SUMMARY.md           — markdown summary for reviewers
  fixtures/            — resolved fixture copies
  project-a/           — Project A artifacts (scorecard, transcripts, PDFs, uploads)
  project-b/           — Project B artifacts
  project-c/           — Project C artifacts
```

## Gates

| Gate | Requirement |
|---|---|
| Coverage | 41/41 tracked endpoints hit at least once |
| Matrix | All 22 named matrix items proven by a passing assertion |
| Functional | 100% of all assertion steps pass |
| Quality | Per-project AI quality score ≥ 90/100 |

A non-zero exit code means at least one gate failed.

## Identity matrix

| Alias | Email | Role | Owns |
|---|---|---|---|
| admin | demo@konti.com | admin | — |
| clientA | client@konti.com | client | Project A, Project C |
| clientB | client2@konti.com | client | Project B |
