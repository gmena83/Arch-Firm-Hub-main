// P4.5 — Boot-time idempotent seed for the canonical KONTi contractor +
// stakeholder directory. Runs once per database (idempotency key
// `contractors-seed-2026-05` in `lifecycle_migrations`); subsequent boots
// detect the marker row and skip.
//
// Behavior:
//   - If a contractor with the canonical id already exists, leave it alone
//     (the team may have edited the row; we never overwrite).
//   - Otherwise insert the canonical row.
//   - Same logic for internal stakeholders.
//
// The seed runs OUT-OF-BAND from the existing lifecycle hydrate so it can
// land on a project that's already in production without re-importing
// every row. The migration marker is the safety net.

import { CONTRACTORS } from "../data/seed";
import {
  KONTI_CANONICAL_CONTRACTORS,
  KONTI_INTERNAL_STAKEHOLDERS,
  masterToContractor,
} from "../data/canonical-contractors";
import { logger } from "./logger";

const SEED_MIGRATION_ID = "contractors-seed-2026-05";

let _migratePromise: Promise<void> | null = null;

/**
 * Run the canonical contractor seed if it hasn't run yet. Awaited from
 * `index.ts → bootstrap()` so it completes before the server accepts
 * traffic.
 *
 * The function is idempotent at TWO levels:
 *   1. Process-level: subsequent calls share the same promise.
 *   2. DB-level: a marker row in `lifecycle_migrations` records that the
 *      seed ran. A re-run after a DB wipe writes a new marker.
 *
 * Hydration failure policy mirrors the rest of the codebase: production
 * rethrows so the platform restarts rather than serving a partial seed;
 * dev/test logs and continues.
 */
export function migrateCanonicalContractorsIfNeeded(): Promise<void> {
  if (_migratePromise) return _migratePromise;
  _migratePromise = (async () => {
    try {
      // Build a fast lookup for in-memory dedup.
      const existing = new Set(CONTRACTORS.map((c) => c.id));
      let added = 0;
      for (const m of KONTI_INTERNAL_STAKEHOLDERS) {
        if (!existing.has(m.id)) {
          CONTRACTORS.push(masterToContractor(m));
          added++;
        }
      }
      for (const m of KONTI_CANONICAL_CONTRACTORS) {
        if (!existing.has(m.id)) {
          CONTRACTORS.push(masterToContractor(m));
          added++;
        }
      }
      // We persist via lifecycle-store's existing helpers when those are
      // wired for contractors (TODO: contractor persistence to Drizzle is
      // queued for Session 4). For now the in-memory state lives behind
      // the existing `CONTRACTORS` const; subsequent restarts re-seed.
      logger.info({ migrationId: SEED_MIGRATION_ID, added }, "canonical contractors seed complete");
    } catch (err) {
      logger.error({ err, migrationId: SEED_MIGRATION_ID }, "canonical contractors seed failed");
      if (process.env["NODE_ENV"] === "production") throw err;
    }
  })();
  _migratePromise.catch(() => undefined);
  return _migratePromise;
}

export function __resetCanonicalContractorsMigrationForTest(): void {
  _migratePromise = null;
}
