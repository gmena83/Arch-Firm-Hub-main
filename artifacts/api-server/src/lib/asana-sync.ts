// Asana sync orchestrator (Task #127).
//
// Responsibilities:
//   * Decide which `appendActivity` events warrant an Asana mirror
//   * Resolve the dashboard project to an Asana task gid (auto-claim by name
//     when the project doesn't yet have one)
//   * Post the bilingual EN | ES comment via the asana-client wrapper
//   * Record success/failure in the sync log
//   * Re-enqueue failures with exponential backoff
//   * Emit `asana_sync_succeeded` / `asana_sync_failed` activities so the
//     project timeline reflects what shipped to Asana
//
// All side effects are guarded so a thrown error in this module never breaks
// the underlying activity write — `setAsanaSyncHook` wraps us in try/catch.

import {
  PROJECTS,
  setAsanaSyncHook,
  appendActivity,
  type ProjectActivity,
  type ProjectActivityType,
} from "../data/seed";
import {
  getAsanaConfig,
  isAsanaEnabled,
  appendSyncLog,
  enqueueJob,
  listQueue,
  dequeueJob,
  bumpJobAttempt,
  type QueuedSyncJob,
} from "./integrations-config";
import {
  addCommentToTask,
  findTaskByName,
  AsanaNotConnectedError,
  AsanaApiError,
} from "./asana-client";
import { logger } from "./logger";

// Activity types that get mirrored. Anything not in this set is silently
// ignored. Keeping the list explicit prevents the integration from spamming
// Asana with low-signal admin events (profile updates, view tracking, etc.)
// or — worst case — feedback-looping on its own asana_sync_* entries.
const SYNC_TYPES: ReadonlySet<ProjectActivityType> = new Set<ProjectActivityType>([
  "phase_change",
  "sub_phase_advanced",
  "client_upload",
  "receipts_upload",
  "document_removed",
  "punchlist_change",
  "inspection_status_change",
  "permit_state_change",
  "permit_submitted",
  "proposal_decision",
  "change_order_decision",
  "milestone_status_change",
  "gamma_generated",
  "site_visit_logged",
  "client_interaction_logged",
]);

const DRAIN_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s, 1m, 2m, 4m, 8m

let drainTimer: NodeJS.Timeout | null = null;
let installed = false;

// ---------------------------------------------------------------------------
// Composing the comment body
// ---------------------------------------------------------------------------
function dashboardLinkFor(projectId: string, baseUrl: string | null): string {
  // Path matches the wouter route in App.tsx: <Route path="/projects/:id">.
  // When baseUrl is null (Asana not configured / pre-derive), we still emit a
  // path so the comment body is well-formed; in practice we now derive the
  // base URL from the configure request's Origin header so this is only "/"
  // in tests and one-off code paths.
  const root = (baseUrl ?? "").replace(/\/+$/, "");
  return `${root}/projects/${projectId}`;
}

export function composeCommentBody(
  projectName: string,
  activity: { actor: string; description: string; descriptionEs: string; type: string; timestamp: string },
  projectId: string,
  baseUrl: string | null,
): string {
  const url = dashboardLinkFor(projectId, baseUrl);
  const ts = activity.timestamp;
  return [
    `[KONTi · ${projectName}] ${activity.type}`,
    `EN: ${activity.description}`,
    `ES: ${activity.descriptionEs}`,
    `By: ${activity.actor}`,
    `When: ${ts}`,
    `Link: ${url}`,
  ].join("\n");
}

function projectFor(projectId: string): { name: string; asanaGid?: string | undefined } | null {
  const p = (PROJECTS as Array<{ id: string; name: string; asanaGid?: string }>).find(
    (x) => x.id === projectId,
  );
  if (!p) return null;
  return { name: p.name, asanaGid: p.asanaGid };
}

function setProjectAsanaGid(projectId: string, gid: string): void {
  const p = (PROJECTS as Array<{ id: string; asanaGid?: string }>).find((x) => x.id === projectId);
  if (p) p.asanaGid = gid;
}

// ---------------------------------------------------------------------------
// Queue draining
// ---------------------------------------------------------------------------
function nextBackoffISO(attempts: number): string {
  const ms = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
  return new Date(Date.now() + ms).toISOString();
}

async function attemptSync(job: QueuedSyncJob): Promise<void> {
  const cfg = getAsanaConfig();
  if (!isAsanaEnabled()) {
    // Stay enqueued — the operator will configure the integration eventually.
    return;
  }
  const project = projectFor(job.projectId);
  if (!project) {
    // Project deleted under us — drop the job and log it.
    dequeueJob(job.id);
    appendSyncLog({
      projectId: job.projectId,
      projectName: "(deleted)",
      activityType: job.activity.type,
      asanaTaskGid: null,
      status: "failed",
      attempts: job.attempts + 1,
      message: "Dashboard project no longer exists; dropping sync.",
      messageEs: "El proyecto ya no existe; descartando sincronización.",
      payload: {
        actor: job.activity.actor,
        description: job.activity.description,
        descriptionEs: job.activity.descriptionEs,
        type: job.activity.type,
        activityId: job.activity.id,
      },
    });
    return;
  }

  // Auto-claim: if no asanaGid yet, search by name in the configured board.
  let taskGid = project.asanaGid && !project.asanaGid.startsWith("auto-") && !/^\d{13,}$/.test(project.asanaGid)
    ? project.asanaGid
    : project.asanaGid && !project.asanaGid.startsWith("auto-")
      ? project.asanaGid
      : "";

  if (!taskGid) {
    try {
      const match = await findTaskByName(cfg.boardGid as string, project.name);
      if (match) {
        setProjectAsanaGid(job.projectId, match.gid);
        taskGid = match.gid;
        appendActivity(job.projectId, {
          type: "asana_task_linked",
          actor: "Asana sync",
          description: `Dashboard project auto-linked to Asana task ${match.gid} ("${match.name}")`,
          descriptionEs: `Proyecto vinculado automáticamente a tarea Asana ${match.gid} ("${match.name}")`,
        });
      }
    } catch (err) {
      logger.warn({ err, projectId: job.projectId }, "asana-sync: auto-claim lookup failed");
    }
  }

  if (!taskGid) {
    // Couldn't auto-claim — mark as skipped, drop the job. The user can
    // manually link via the project page picker, then future events sync.
    dequeueJob(job.id);
    appendSyncLog({
      projectId: job.projectId,
      projectName: project.name,
      activityType: job.activity.type,
      asanaTaskGid: null,
      status: "skipped",
      attempts: job.attempts + 1,
      message: "No matching Asana task. Use \"Link to Asana task\" on the project to bind it.",
      messageEs: "No se encontró tarea Asana. Usa \"Vincular tarea Asana\" en el proyecto.",
      payload: {
        actor: job.activity.actor,
        description: job.activity.description,
        descriptionEs: job.activity.descriptionEs,
        type: job.activity.type,
        activityId: job.activity.id,
      },
    });
    return;
  }

  try {
    const body = composeCommentBody(project.name, job.activity, job.projectId, cfg.dashboardBaseUrl);
    await addCommentToTask(taskGid, body);
    dequeueJob(job.id);
    appendSyncLog({
      projectId: job.projectId,
      projectName: project.name,
      activityType: job.activity.type,
      asanaTaskGid: taskGid,
      status: job.attempts > 0 ? "retried" : "ok",
      attempts: job.attempts + 1,
      message: "Comment posted to Asana task.",
      messageEs: "Comentario publicado en la tarea Asana.",
      payload: {
        actor: job.activity.actor,
        description: job.activity.description,
        descriptionEs: job.activity.descriptionEs,
        type: job.activity.type,
        activityId: job.activity.id,
      },
    });
    appendActivity(job.projectId, {
      type: "asana_sync_succeeded",
      actor: "Asana sync",
      description: `Synced "${job.activity.type}" to Asana task ${taskGid}`,
      descriptionEs: `"${job.activity.type}" sincronizado con tarea Asana ${taskGid}`,
    });
  } catch (err) {
    const isNotConnected = err instanceof AsanaNotConnectedError;
    const status = err instanceof AsanaApiError ? err.status : 0;
    const nextAttempts = job.attempts + 1;
    const reason = (err as Error).message ?? "unknown";
    const terminal = nextAttempts >= MAX_ATTEMPTS;

    // Always log per-attempt failure to the sync log AND emit an
    // `asana_sync_failed` activity so the project timeline shows operational
    // visibility on every failure, not only on the terminal give-up. This is
    // a deliberate design choice: when Asana is flaky, the team needs to see
    // each failed attempt in-context (and the retry status) rather than
    // discovering 5 stale events at the end.
    appendSyncLog({
      projectId: job.projectId,
      projectName: project.name,
      activityType: job.activity.type,
      asanaTaskGid: taskGid,
      status: "failed",
      attempts: nextAttempts,
      message: terminal
        ? `Gave up after ${nextAttempts} attempts: ${reason}`
        : `Attempt ${nextAttempts} of ${MAX_ATTEMPTS} failed; will retry: ${reason}`,
      messageEs: terminal
        ? `Falló después de ${nextAttempts} intentos: ${reason}`
        : `Intento ${nextAttempts} de ${MAX_ATTEMPTS} falló; se reintentará: ${reason}`,
      payload: {
        actor: job.activity.actor,
        description: job.activity.description,
        descriptionEs: job.activity.descriptionEs,
        type: job.activity.type,
        activityId: job.activity.id,
      },
    });
    appendActivity(job.projectId, {
      type: "asana_sync_failed",
      actor: "Asana sync",
      description: terminal
        ? `Gave up syncing "${job.activity.type}" to Asana after ${nextAttempts} attempts (${reason.slice(0, 80)})`
        : `Sync attempt ${nextAttempts}/${MAX_ATTEMPTS} for "${job.activity.type}" failed; will retry (${reason.slice(0, 80)})`,
      descriptionEs: terminal
        ? `Sincronización de "${job.activity.type}" abandonada tras ${nextAttempts} intentos (${reason.slice(0, 80)})`
        : `Intento ${nextAttempts}/${MAX_ATTEMPTS} de sincronizar "${job.activity.type}" falló; se reintentará (${reason.slice(0, 80)})`,
    });

    if (terminal) {
      dequeueJob(job.id);
    } else {
      bumpJobAttempt(job.id, nextBackoffISO(nextAttempts));
      logger.warn(
        { err: reason, isNotConnected, status, jobId: job.id, nextAttempts },
        "asana-sync: attempt failed; will retry",
      );
    }
  }
}

// Single-flight lock so the periodic drain interval and a manual /retry can't
// process the same job concurrently (which would cause duplicate Asana
// comments / double-stamped asanaGid). When a drain is already running, the
// second caller exits early — the in-flight call will pick up newly-enqueued
// jobs on its next iteration.
let draining = false;

export async function drainQueue(): Promise<void> {
  if (!isAsanaEnabled()) return;
  if (draining) return;
  draining = true;
  try {
    const now = Date.now();
    const due = listQueue().filter((j) => Date.parse(j.nextAttemptAt) <= now);
    for (const job of due) {
      // eslint-disable-next-line no-await-in-loop
      await attemptSync(job);
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------
// Hook installation
// ---------------------------------------------------------------------------
export function shouldSync(activityType: string): boolean {
  return SYNC_TYPES.has(activityType as ProjectActivityType);
}

function onActivity(projectId: string, activity: ProjectActivity): void {
  if (!shouldSync(activity.type)) return;
  if (!isAsanaEnabled()) return;
  enqueueJob({
    projectId,
    activity: {
      id: activity.id,
      timestamp: activity.timestamp,
      type: activity.type,
      actor: activity.actor,
      description: activity.description,
      descriptionEs: activity.descriptionEs,
    },
  });
}

// Idempotent setup — call once at server boot.
export function installAsanaSync(): void {
  if (installed) return;
  installed = true;
  setAsanaSyncHook(onActivity);
  if (drainTimer === null && process.env["NODE_ENV"] !== "test") {
    drainTimer = setInterval(() => {
      void drainQueue().catch((err) => {
        logger.error({ err }, "asana-sync: drain loop failed");
      });
    }, DRAIN_INTERVAL_MS);
    // Don't keep the event loop alive solely for the drain loop.
    drainTimer.unref?.();
  }
}

export function _uninstallForTests(): void {
  setAsanaSyncHook(null);
  installed = false;
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}
