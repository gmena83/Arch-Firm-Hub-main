// Persisted single-record integrations config (Task #127 + #128).
//
// Mirrors the JSON-on-disk pattern that the estimating routes used before
// server restart preserves the chosen Asana workspace + board, the queued
// sync attempts, and the rolling sync log without needing a real database.
// Task #128 extends the same record with a Drive section (root folder +
// per-project folder map) so document uploads can stream to Drive.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger";

export interface AsanaIntegrationConfig {
  enabled: boolean;
  workspaceGid: string | null;
  workspaceName: string | null;
  boardGid: string | null;
  boardName: string | null;
  defaultAssigneeGid: string | null;
  // Optional UI deep-link prefix used inside Asana comments so the team can
  // jump back into the dashboard from the Asana web UI.
  dashboardBaseUrl: string | null;
  connectedAt: string | null;
  connectedBy: string | null;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  projectId: string;
  projectName: string;
  activityType: string;
  asanaTaskGid: string | null;
  status: "ok" | "failed" | "skipped" | "retried";
  attempts: number;
  message: string;
  messageEs: string;
  /** Original activity payload, kept so the admin can manually retry a failed entry. */
  payload: {
    actor: string;
    description: string;
    descriptionEs: string;
    type: string;
    activityId: string;
  };
}

export interface QueuedSyncJob {
  id: string;
  enqueuedAt: string;
  nextAttemptAt: string;
  attempts: number;
  projectId: string;
  activity: {
    id: string;
    timestamp: string;
    type: string;
    actor: string;
    description: string;
    descriptionEs: string;
  };
}

export interface DriveProjectFolderMap {
  /** Drive folder ID for the project's root folder under the workspace root. */
  projectFolderId: string;
  /**
   * Map of dashboard category key (`permits`, `client_review`, ...) → Drive
   * sub-folder ID. Sub-folders are created on-demand as documents arrive.
   */
  subFolders: Record<string, string>;
}

export interface DriveIntegrationConfig {
  enabled: boolean;
  /**
   * Drive folder ID chosen by the admin as the workspace root (everything
   * the dashboard creates lives under it).
   */
  rootFolderId: string | null;
  rootFolderName: string | null;
  /**
   * "private" → uploads are only visible to the connected Drive user. The
   * dashboard then proxies downloads through its own auth.
   * "anyone_with_link" → uploads marked client-visible get an anyone-with-link
   * sharing permission so the client URL works without Drive auth.
   */
  visibilityPolicy: "private" | "anyone_with_link";
  /**
   * On delete: trash (recoverable) vs hard delete. Defaults to trash because
   * the team can recover from Drive's UI.
   */
  deletePolicy: "trash" | "hard_delete";
  connectedAt: string | null;
  connectedBy: string | null;
  /**
   * Per-project folder map (built lazily as projects upload). Keyed by the
   * dashboard's projectId.
   */
  projectFolders: Record<string, DriveProjectFolderMap>;
  /**
   * Timestamp of the first successful connect. Used as the run-once marker
   * so the per-project folder provisioning + initial backfill only run on
   * the very first connect. Disconnect does NOT clear this — re-connects
   * skip the (possibly long) bootstrap and let the admin run a manual
   * `/integrations/drive/backfill` if they want to top up.
   */
  firstConnectCompletedAt: string | null;
  /**
   * Persisted record of the rootFolderId the per-project folder map was
   * built against. Survives disconnect (unlike `rootFolderId` which the
   * disconnect route clears) so a disconnect → reconnect-to-different-root
   * flow can still tell that the cached folder IDs live under the OLD root
   * and must be invalidated. Reconnecting to the SAME root keeps the map.
   */
  lastConfiguredRootFolderId: string | null;
}

export interface DriveSyncLogEntry {
  id: string;
  timestamp: string;
  /** "upload" | "delete" | "visibility" | "backfill_file" | "backfill_summary" */
  action: string;
  status: "ok" | "failed" | "skipped";
  projectId: string | null;
  projectName: string | null;
  documentId: string | null;
  documentName: string | null;
  driveFileId: string | null;
  message: string;
  messageEs: string;
}

export interface IntegrationsState {
  asana: AsanaIntegrationConfig;
  syncLog: SyncLogEntry[];
  queue: QueuedSyncJob[];
  drive: DriveIntegrationConfig;
  driveSyncLog: DriveSyncLogEntry[];
}

const DEFAULT_STATE: IntegrationsState = {
  asana: {
    enabled: false,
    workspaceGid: null,
    workspaceName: null,
    boardGid: null,
    boardName: null,
    defaultAssigneeGid: null,
    dashboardBaseUrl: null,
    connectedAt: null,
    connectedBy: null,
  },
  syncLog: [],
  queue: [],
  drive: {
    enabled: false,
    rootFolderId: null,
    rootFolderName: null,
    visibilityPolicy: "anyone_with_link",
    deletePolicy: "trash",
    connectedAt: null,
    connectedBy: null,
    projectFolders: {},
    firstConnectCompletedAt: null,
    lastConfiguredRootFolderId: null,
  },
  driveSyncLog: [],
};

const SYNC_LOG_LIMIT = 50;
const DRIVE_SYNC_LOG_LIMIT = 200;

function defaultPath(): string {
  if (process.env["INTEGRATIONS_PERSIST_FILE"]) {
    return process.env["INTEGRATIONS_PERSIST_FILE"] as string;
  }
  if (process.env["NODE_ENV"] === "test") {
    return path.join(os.tmpdir(), `konti-integrations-test-${process.pid}.json`);
  }
  const baseDir = process.env["KONTI_DATA_DIR"]
    ? (process.env["KONTI_DATA_DIR"] as string)
    : path.resolve(process.cwd(), ".data");
  return path.join(baseDir, "integrations.json");
}

let _path: string | null = null;
function getPersistFile(): string {
  if (_path === null) _path = defaultPath();
  return _path;
}

export function setIntegrationsPersistFile(p: string | null): void {
  _path = p;
  // Force a reload on next access.
  _state = null;
}

let _state: IntegrationsState | null = null;

function loadFromDisk(): IntegrationsState {
  const file = getPersistFile();
  try {
    if (!fs.existsSync(file)) return structuredClone(DEFAULT_STATE);
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<IntegrationsState>;
    return {
      asana: { ...DEFAULT_STATE.asana, ...(parsed.asana ?? {}) },
      syncLog: Array.isArray(parsed.syncLog) ? parsed.syncLog.slice(0, SYNC_LOG_LIMIT) : [],
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      drive: {
        ...DEFAULT_STATE.drive,
        ...(parsed.drive ?? {}),
        projectFolders:
          (parsed.drive && typeof parsed.drive === "object" && parsed.drive.projectFolders) ||
          {},
      },
      driveSyncLog: Array.isArray(parsed.driveSyncLog)
        ? parsed.driveSyncLog.slice(0, DRIVE_SYNC_LOG_LIMIT)
        : [],
    };
  } catch (err) {
    logger.error({ err, file }, "integrations-config: load failed; falling back to defaults");
    return structuredClone(DEFAULT_STATE);
  }
}

function persist(): void {
  if (!_state) return;
  const file = getPersistFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(_state, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    logger.error({ err, file }, "integrations-config: save failed");
  }
}

export function getState(): IntegrationsState {
  if (_state === null) _state = loadFromDisk();
  return _state;
}

export function getAsanaConfig(): AsanaIntegrationConfig {
  return { ...getState().asana };
}

export function updateAsanaConfig(patch: Partial<AsanaIntegrationConfig>): AsanaIntegrationConfig {
  const state = getState();
  state.asana = { ...state.asana, ...patch };
  persist();
  return { ...state.asana };
}

export function isAsanaEnabled(): boolean {
  const cfg = getState().asana;
  return cfg.enabled && !!cfg.workspaceGid && !!cfg.boardGid;
}

export function appendSyncLog(entry: Omit<SyncLogEntry, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
}): SyncLogEntry {
  const state = getState();
  const e: SyncLogEntry = {
    id: entry.id ?? `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    projectId: entry.projectId,
    projectName: entry.projectName,
    activityType: entry.activityType,
    asanaTaskGid: entry.asanaTaskGid,
    status: entry.status,
    attempts: entry.attempts,
    message: entry.message,
    messageEs: entry.messageEs,
    payload: entry.payload,
  };
  state.syncLog.unshift(e);
  if (state.syncLog.length > SYNC_LOG_LIMIT) state.syncLog.length = SYNC_LOG_LIMIT;
  persist();
  return e;
}

export function getSyncLog(): SyncLogEntry[] {
  return [...getState().syncLog];
}

export function findSyncLogEntry(id: string): SyncLogEntry | undefined {
  return getState().syncLog.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Retry queue
// ---------------------------------------------------------------------------

export function enqueueJob(job: Omit<QueuedSyncJob, "id" | "enqueuedAt" | "nextAttemptAt" | "attempts"> & {
  id?: string;
  enqueuedAt?: string;
  nextAttemptAt?: string;
  attempts?: number;
}): QueuedSyncJob {
  const state = getState();
  // Dedupe by activityId + projectId: if the same activity is already queued
  // we return the existing job rather than enqueueing twice. This prevents a
  // burst of writes (e.g. an activity fired during a manual retry) from
  // posting two identical comments to the same Asana task.
  const existing = state.queue.find(
    (q) => q.projectId === job.projectId && q.activity.id === job.activity.id,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const entry: QueuedSyncJob = {
    id: job.id ?? `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enqueuedAt: job.enqueuedAt ?? now,
    nextAttemptAt: job.nextAttemptAt ?? now,
    attempts: job.attempts ?? 0,
    projectId: job.projectId,
    activity: job.activity,
  };
  state.queue.push(entry);
  persist();
  return entry;
}

export function listQueue(): QueuedSyncJob[] {
  return [...getState().queue];
}

export function dequeueJob(id: string): void {
  const state = getState();
  state.queue = state.queue.filter((j) => j.id !== id);
  persist();
}

export function bumpJobAttempt(id: string, nextAttemptAt: string): void {
  const state = getState();
  const j = state.queue.find((q) => q.id === id);
  if (!j) return;
  j.attempts += 1;
  j.nextAttemptAt = nextAttemptAt;
  persist();
}

// ---------------------------------------------------------------------------
// Drive (Task #128)
// ---------------------------------------------------------------------------

export function getDriveConfig(): DriveIntegrationConfig {
  // Deep-copy the projectFolders map so callers can't mutate persisted state.
  const cfg = getState().drive;
  return {
    ...cfg,
    projectFolders: structuredClone(cfg.projectFolders),
  };
}

export function updateDriveConfig(
  patch: Partial<Omit<DriveIntegrationConfig, "projectFolders">>,
): DriveIntegrationConfig {
  const state = getState();
  state.drive = { ...state.drive, ...patch };
  persist();
  return getDriveConfig();
}

export function isDriveEnabled(): boolean {
  const cfg = getState().drive;
  return cfg.enabled && !!cfg.rootFolderId;
}

export function getDriveProjectFolder(projectId: string): DriveProjectFolderMap | null {
  const map = getState().drive.projectFolders[projectId];
  return map ? structuredClone(map) : null;
}

export function setDriveProjectFolder(
  projectId: string,
  folder: DriveProjectFolderMap,
): void {
  const state = getState();
  state.drive.projectFolders[projectId] = folder;
  persist();
}

export function setDriveSubFolder(
  projectId: string,
  category: string,
  subFolderId: string,
): void {
  const state = getState();
  const existing = state.drive.projectFolders[projectId];
  if (!existing) return;
  existing.subFolders[category] = subFolderId;
  persist();
}

// Wipes the per-project folder map. Used when an admin reconnects to a
// different Drive root — the cached folder IDs live under the OLD root and
// would silently misroute uploads if reused.
export function clearDriveProjectFolders(): void {
  const state = getState();
  state.drive.projectFolders = {};
  persist();
}

export function appendDriveSyncLog(entry: Omit<DriveSyncLogEntry, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
}): DriveSyncLogEntry {
  const state = getState();
  const e: DriveSyncLogEntry = {
    id: entry.id ?? `dsync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    action: entry.action,
    status: entry.status,
    projectId: entry.projectId,
    projectName: entry.projectName,
    documentId: entry.documentId,
    documentName: entry.documentName,
    driveFileId: entry.driveFileId,
    message: entry.message,
    messageEs: entry.messageEs,
  };
  state.driveSyncLog.unshift(e);
  if (state.driveSyncLog.length > DRIVE_SYNC_LOG_LIMIT) {
    state.driveSyncLog.length = DRIVE_SYNC_LOG_LIMIT;
  }
  persist();
  return e;
}

export function getDriveSyncLog(): DriveSyncLogEntry[] {
  return [...getState().driveSyncLog];
}

// Test helper — clears all in-memory state and removes the persist file.
export function _resetForTests(): void {
  _state = structuredClone(DEFAULT_STATE);
  const file = getPersistFile();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* best-effort */
  }
}
