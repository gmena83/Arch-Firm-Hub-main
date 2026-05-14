// Punchlist persistence layer.
//
// Punchlist edits (add/edit/status/delete) need to survive a server restart
// so the advance-phase gate is a real workflow, not a per-process toy.  This
// module reads the JSON file on first import and writes it back after every
// route mutation.  When the file is missing (fresh boot) the seed values in
// `seed.ts` remain in place, so the proj-2 (construction) and proj-3
// (completed) demo state still loads correctly.
//
// The file location is controlled by PUNCHLIST_PERSIST_PATH so unit tests can
// disable persistence (set to empty string) and so prod/dev can pick a
// stable path that does not depend on cwd.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PunchlistItem } from "./seed";

const PERSIST_VERSION = 1;

interface PersistShape {
  version: number;
  savedAt: string;
  data: Record<string, PunchlistItem[]>;
}

function findWorkspaceRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return start;
}

function resolveDefaultPath(): string {
  const root = findWorkspaceRoot(process.cwd());
  return resolve(root, "artifacts/api-server/.data/punchlist.json");
}

/**
 * Returns the absolute path the store will read/write, or `null` if
 * persistence is disabled (PUNCHLIST_PERSIST_PATH set to empty string).
 */
export function getPersistPath(): string | null {
  const raw = process.env["PUNCHLIST_PERSIST_PATH"];
  if (raw === "") return null;
  if (typeof raw === "string") return resolve(raw);
  return resolveDefaultPath();
}

/**
 * Read the persisted punchlist snapshot from disk. Returns `null` when no
 * file exists (first boot) or persistence is disabled. Throws on a corrupt
 * file rather than silently dropping data — losing punch items is exactly
 * what this module is supposed to prevent.
 */
export function loadPersistedPunchlist(): Record<string, PunchlistItem[]> | null {
  const path = getPersistPath();
  if (!path) return null;
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (raw.trim().length === 0) return null;
  const parsed = JSON.parse(raw) as Partial<PersistShape>;
  if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error(`Invalid punchlist persistence file at ${path}`);
  }
  return parsed.data as Record<string, PunchlistItem[]>;
}

/**
 * Write the current punchlist state to disk atomically (write to a temp
 * file, then rename) so a crash mid-write cannot corrupt the file. No-ops
 * when persistence is disabled.
 */
export function savePunchlist(state: Record<string, PunchlistItem[]>): void {
  const path = getPersistPath();
  if (!path) return;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload: PersistShape = {
    version: PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    data: state,
  };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}
