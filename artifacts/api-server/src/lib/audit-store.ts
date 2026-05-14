// Superadmin audit log (Task #130).
//
// Lightweight ring buffer of the last 50 superadmin-triggered actions on
// the Integrations page. Persisted to .data/audit-log.json so the log
// survives server restarts. We intentionally keep this separate from
// `integrations-config.ts` because it spans more than just Asana/Drive —
// secret rotations and integration restarts also belong here.

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "./logger";

export type AuditAction =
  | "secret.update"
  | "secret.test"
  | "secret.test_failed"
  | "secret.test_candidate"
  | "secret.test_candidate_failed"
  | "integration.restart"
  | "integration.restart_failed";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorEmail: string;
  action: AuditAction;
  /** Friendly target label, e.g. "ANTHROPIC_API_KEY" or "drive". */
  target: string;
  /** Short EN message — never includes the raw secret value. */
  message: string;
  messageEs: string;
}

const LIMIT = 50;

interface AuditFile {
  version: 1;
  entries: AuditEntry[];
}

const DEFAULT: AuditFile = { version: 1, entries: [] };

function defaultPath(): string {
  if (process.env["AUDIT_LOG_FILE"]) {
    return process.env["AUDIT_LOG_FILE"] as string;
  }
  if (process.env["NODE_ENV"] === "test") {
    return path.join(
      require("node:os").tmpdir(),
      `konti-audit-test-${process.pid}.json`,
    );
  }
  const baseDir = process.env["KONTI_DATA_DIR"]
    ? (process.env["KONTI_DATA_DIR"] as string)
    : path.resolve(process.cwd(), ".data");
  return path.join(baseDir, "audit-log.json");
}

let _path: string | null = null;
function getFile(): string {
  if (_path === null) _path = defaultPath();
  return _path;
}

export function _setAuditFileForTests(p: string | null): void {
  _path = p;
  _state = null;
}

let _state: AuditFile | null = null;

function load(): AuditFile {
  const file = getFile();
  try {
    if (!fs.existsSync(file)) return structuredClone(DEFAULT);
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw) as Partial<AuditFile>;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.slice(0, LIMIT)
        : [],
    };
  } catch (err) {
    logger.error({ err, file }, "audit-store: load failed");
    return structuredClone(DEFAULT);
  }
}

function persist(): void {
  if (!_state) return;
  const file = getFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(_state, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    logger.error({ err, file }, "audit-store: save failed");
  }
}

function getState(): AuditFile {
  if (_state === null) _state = load();
  return _state;
}

export function appendAudit(
  entry: Omit<AuditEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): AuditEntry {
  const state = getState();
  const e: AuditEntry = {
    id: entry.id ?? `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    actorUserId: entry.actorUserId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    target: entry.target,
    message: entry.message,
    messageEs: entry.messageEs,
  };
  state.entries.unshift(e);
  if (state.entries.length > LIMIT) state.entries.length = LIMIT;
  persist();
  return e;
}

export function listAudit(): AuditEntry[] {
  return [...getState().entries];
}

export function _resetForTests(): void {
  _state = structuredClone(DEFAULT);
  const file = getFile();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* best-effort */
  }
}
