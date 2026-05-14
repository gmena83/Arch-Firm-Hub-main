// Deprecated compatibility shim — Task #141.
//
// This module USED to be the JSON-on-disk persistence layer for the
// estimating + calculator stores (writing `.data/estimating.json`).
// Task #141 moved persistence to Postgres via Drizzle; the canonical
// API now lives in `./estimating-store.ts`.
//
// All in-repo callers were migrated as part of #141 (a repo-wide search
// for `loadEstimatingFromDisk` / `saveEstimatingToDisk` /
// `getEstimatingPersistFile` / `setEstimatingPersistFile` returns
// nothing outside this file). This file is kept for one release as a
// thin delegation shim so any out-of-tree consumer still importing the
// old names gets routed to the new DB-backed functions instead of
// silently doing nothing or failing to resolve.
//
// IMPORTANT: the original sync signatures cannot be preserved — the new
// store is async (it talks to Postgres). Deprecated callers therefore
// receive promises and must `await` them; that is intentional and is
// exactly the migration the route handlers already performed.
//
// Remove this file in the release after #141 ships.

import { logger } from "./logger";
import {
  loadEstimatingSnapshotFromDb,
  saveEstimatingSnapshotToDb,
  type PersistedEstimatingSnapshot,
} from "./estimating-store";

let _persistFilePath = ".data/estimating.json";
let _warnedLoad = false;
let _warnedSave = false;
let _warnedFile = false;

function warnOnce(flag: { value: boolean }, fnName: string): void {
  if (flag.value) return;
  flag.value = true;
  logger.warn(
    { fn: fnName },
    "estimating-persistence shim is deprecated; import from './estimating-store' instead (Task #141)",
  );
}

const loadFlag = { get value() { return _warnedLoad; }, set value(v: boolean) { _warnedLoad = v; } };
const saveFlag = { get value() { return _warnedSave; }, set value(v: boolean) { _warnedSave = v; } };
const fileFlag = { get value() { return _warnedFile; }, set value(v: boolean) { _warnedFile = v; } };

/**
 * @deprecated Task #141 — use `loadEstimatingSnapshotFromDb` from
 * `./estimating-store` directly. This shim returns a Promise (the
 * original was sync) because Postgres I/O cannot be made synchronous.
 */
export function loadEstimatingFromDisk(): Promise<PersistedEstimatingSnapshot | null> {
  warnOnce(loadFlag, "loadEstimatingFromDisk");
  return loadEstimatingSnapshotFromDb();
}

/**
 * @deprecated Task #141 — use `saveEstimatingSnapshotToDb` from
 * `./estimating-store` directly. Returns a Promise; callers MUST await
 * it to retain the durability guarantee they had with the old sync
 * disk write.
 */
export function saveEstimatingToDisk(
  state: PersistedEstimatingSnapshot,
): Promise<void> {
  warnOnce(saveFlag, "saveEstimatingToDisk");
  return saveEstimatingSnapshotToDb(state);
}

/**
 * @deprecated Task #141 — file-based persistence is gone. This getter
 * only echoes back whatever was last passed to
 * `setEstimatingPersistFile`; nothing in the api-server actually reads
 * this value. The legacy-JSON migration takes its path explicitly via
 * `migrateEstimatingJsonIfNeeded({ jsonPath })` and never consults
 * this module. Provided solely so out-of-tree code that used to read
 * the active disk path doesn't crash on a missing export.
 */
export function getEstimatingPersistFile(): string {
  warnOnce(fileFlag, "getEstimatingPersistFile");
  return _persistFilePath;
}

/**
 * @deprecated Task #141 — file-based persistence is gone. Calling this
 * is a true no-op as far as the running server is concerned: the
 * legacy-JSON migration takes its path explicitly via
 * `migrateEstimatingJsonIfNeeded({ jsonPath })` and ignores any value
 * stored here. The setter simply remembers the value so a later
 * `getEstimatingPersistFile()` call returns it; it does NOT influence
 * any DB read/write or migration path resolution. Provided solely so
 * out-of-tree code that used to set the active disk path doesn't
 * crash on a missing export.
 */
export function setEstimatingPersistFile(p: string | null): void {
  warnOnce(fileFlag, "setEstimatingPersistFile");
  // The original sync-file implementation accepted `null` to mean "reset
  // back to the default `.data/estimating.json` path"; preserve that
  // signature so external callers passing `null` don't break on the
  // type-narrowed shim. The value is still vestigial — see getter doc.
  _persistFilePath = p ?? ".data/estimating.json";
}
