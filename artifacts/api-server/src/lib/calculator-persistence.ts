// Per-project calculator-entry persistence (Task #141, extracted in
// post-review hardening to break a `routes/estimating.ts` ↔
// `routes/projects.ts` circular import).
//
// CALCULATOR_ENTRIES lives in seed.ts as a const-bound object whose keys
// are project IDs. Mutations happen in-place via the route handlers. At
// boot we hydrate the projects that have rows in
// `project_calculator_entries` (overriding the seed values for those
// keys), while projects with no rows continue to use the seed defaults —
// so adding a brand new project to seed.ts still works without touching
// the DB.
//
// Every mutating route calls `await persistCalculatorEntriesForProject(id)`,
// which is request-coupled and serialised through a per-project queue so
// two rapid edits cannot race to overwrite each other AND a 200 OK
// response cannot be sent before the row is committed (durability:
// crash-after-ack does not lose acknowledged writes).

import { CALCULATOR_ENTRIES } from "../data/seed";
import {
  loadCalculatorEntriesFromDb,
  saveCalculatorEntriesForProject,
  type CalculatorEntry,
} from "./estimating-store";
import { logger } from "./logger";

let _calcHydrationPromise: Promise<void> | null = null;

export function ensureCalculatorHydrated(): Promise<void> {
  if (_calcHydrationPromise) return _calcHydrationPromise;
  _calcHydrationPromise = (async () => {
    try {
      const fromDb = await loadCalculatorEntriesFromDb();
      const calc = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
      for (const [projectId, entries] of Object.entries(fromDb)) {
        calc[projectId] = entries;
      }
    } catch (err) {
      // Log AND rethrow: the bootstrap path in `index.ts` relies on this
      // promise rejecting so it can fail-fast in production rather than
      // serve traffic from seed defaults. Swallowing here would silently
      // bypass the documented hydration failure policy.
      logger.error({ err }, "calculator: hydration from Postgres failed");
      throw err;
    }
  })();
  // Attach a noop catch so an UNAWAITED call (e.g. accidental fire-and-forget
  // from a route handler) doesn't trigger an UnhandledPromiseRejection — but
  // the original promise we return still rejects so awaiters see the error.
  _calcHydrationPromise.catch(() => undefined);
  return _calcHydrationPromise;
}

export function __resetCalculatorHydrationForTest(): void {
  _calcHydrationPromise = null;
}

// Per-project serialised write queue. Two writes in quick succession to
// the SAME project will serialise; writes to different projects can run
// in parallel.
const _calcPendingByProject: Map<string, Promise<unknown>> = new Map();

export function persistCalculatorEntriesForProject(projectId: string): Promise<void> {
  const calc = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
  // Deep-clone the entries SYNCHRONOUSLY at enqueue time so a queued
  // write captures the state at this caller's request boundary, not
  // whatever the live in-memory list happens to look like when the
  // queue actually drains. Without this, two PATCH requests landing
  // in quick succession could both persist the second request's state
  // (because the first queued closure would re-read the now-mutated
  // shared array reference). `structuredClone` is in the Node global
  // since 17 and handles the plain `CalculatorEntry` shape correctly.
  const entries = structuredClone(calc[projectId] ?? []);
  const prev = _calcPendingByProject.get(projectId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => saveCalculatorEntriesForProject(projectId, entries));
  // Keep the chained promise on the queue so a follow-up call serialises
  // behind this one, but do NOT swallow its error: callers `await` the
  // returned promise to couple the route response to the DB commit, so
  // they need to see the failure (the route can then 500 instead of 200).
  _calcPendingByProject.set(projectId, next.catch(() => undefined));
  return next.then(() => undefined);
}

export function flushCalculatorPersistence(): Promise<void> {
  const all = Array.from(_calcPendingByProject.values());
  return Promise.allSettled(all).then(() => undefined);
}
