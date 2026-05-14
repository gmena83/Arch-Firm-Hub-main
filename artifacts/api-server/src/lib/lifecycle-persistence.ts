// Project lifecycle persistence — request-coupled write queues + hydration.
// Companion to `lifecycle-store.ts`; mirrors `calculator-persistence.ts`
// shape so a reader familiar with #141 finds the same patterns here.
//
// Why per-store-key serial queues?
//   - Two PATCH requests targeting the SAME project (e.g. quick checklist
//     toggles) must serialise so neither one's commit is overwritten by
//     the other. structuredClone-at-enqueue snapshots the in-memory state
//     at this caller's request boundary, not whatever it looks like by
//     the time the queue drains.
//   - Writes to DIFFERENT keys can run concurrently — the queues are
//     keyed independently per store so unrelated projects never block
//     each other.
//
// Routes call e.g. `await persistProjectsToDb()` AFTER mutating PROJECTS
// in memory and BEFORE responding 200, so a crash-after-ack cannot lose
// acknowledged writes (the durability contract from #141).

import {
  PROJECTS,
  PROJECT_TASKS,
  LEADS,
  PROJECT_INSPECTIONS,
  PROJECT_CHANGE_ORDERS,
  USERS,
  PROJECT_STRUCTURED_VARS,
  PROJECT_ASSISTED_BUDGETS,
  PROJECT_CSV_MAPPINGS,
  PRE_DESIGN_CHECKLISTS,
  PROJECT_ACTIVITIES,
  DOCUMENTS,
  AUDIT_LOG,
  appendActivity as _appendActivity,
  entityForActivityType,
  type Lead,
  type Inspection,
  type ChangeOrder,
  type StructuredVariables,
  type AssistedBudgetRange,
  type PreDesignChecklistItem,
  type ProjectActivity,
  type AuditEntity,
} from "../data/seed";
import {
  loadLifecycleSnapshotFromDb,
  migrateLifecycleSeedIfNeeded,
  saveProjectsToDb,
  saveProjectTasksForProject,
  saveLeadsToDb,
  saveInspectionsForProject,
  saveChangeOrdersForProject,
  saveUserProfile,
  saveNotificationsSeenForUser,
  saveStructuredVarsForProject,
  saveAssistedBudgetForProject,
  saveCsvMappingForProject,
  savePreDesignChecklistForProject,
  saveActivitiesForProject,
  saveDocumentsForProject,
  type PersistedProject,
  type PersistedTask,
  type PersistedCsvMappings,
  type PersistedDocument,
  type PersistedLifecycleSnapshot,
} from "./lifecycle-store";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// PersistFailedError — thrown by every helper below when the underlying
// Postgres commit fails. The Express error middleware in `app.ts` maps it
// uniformly to `500 { error: "persist_failed" }` so every lifecycle-mutating
// route returns the same retry-friendly contract whether or not the route
// wraps the call in a local try/catch.
// ---------------------------------------------------------------------------
export class PersistFailedError extends Error {
  readonly userMessage: string;
  readonly userMessageEs: string;
  constructor(scope: string, cause: unknown) {
    super(`persist_failed: ${scope}`);
    this.name = "PersistFailedError";
    this.userMessage = "Your edit was applied in memory but failed to save. Please retry.";
    this.userMessageEs = "Su cambio se aplicó en memoria pero no se pudo guardar. Por favor reintente.";
    (this as { cause?: unknown }).cause = cause;
  }
}

function wrapPersist<T>(scope: string, p: Promise<T>): Promise<T> {
  return p.catch((err) => {
    logger.error({ err, scope }, "lifecycle: persist failed");
    throw new PersistFailedError(scope, err);
  });
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

let _hydrationPromise: Promise<void> | null = null;

/**
 * Idempotent boot-time hydrator. Steps:
 *   1. Run the one-time seed → Postgres migration (no-op after first boot).
 *   2. Load the full snapshot from Postgres.
 *   3. Mutate the in-memory seed constants in-place to match.
 *
 * Failure rethrows so the bootstrap path in `index.ts` can fail-fast in
 * production rather than serve traffic from stale in-memory state.
 */
export function ensureLifecycleHydrated(): Promise<void> {
  if (_hydrationPromise) return _hydrationPromise;
  _hydrationPromise = (async () => {
    try {
      await migrateLifecycleSeedIfNeeded();
      const snap = await loadLifecycleSnapshotFromDb();
      if (snap) applyLifecycleSnapshot(snap);
    } catch (err) {
      logger.error({ err }, "lifecycle: hydration from Postgres failed");
      throw err;
    }
  })();
  _hydrationPromise.catch(() => undefined);
  return _hydrationPromise;
}

export function __resetLifecycleHydrationForTest(): void {
  _hydrationPromise = null;
}

/**
 * Replace the in-memory seed contents with the snapshot's contents,
 * preserving the EXISTING object references (so any module that imported
 * the const at boot still sees the new values). Mirrors how
 * `seed.ts` already handles `loadPersistedPunchlist()`.
 */
export function applyLifecycleSnapshot(snap: PersistedLifecycleSnapshot): void {
  // -- projects ---------------------------------------------------------
  const projects = PROJECTS as unknown as PersistedProject[];
  projects.length = 0;
  for (const p of snap.projects) projects.push(p);

  // -- project tasks ----------------------------------------------------
  const tasks = PROJECT_TASKS as Record<string, PersistedTask[]>;
  for (const k of Object.keys(tasks)) delete tasks[k];
  for (const [pid, list] of Object.entries(snap.projectTasks)) tasks[pid] = list;

  // -- leads ------------------------------------------------------------
  LEADS.length = 0;
  for (const l of snap.leads) LEADS.push(l);

  // -- inspections ------------------------------------------------------
  for (const k of Object.keys(PROJECT_INSPECTIONS)) delete PROJECT_INSPECTIONS[k];
  for (const [pid, list] of Object.entries(snap.inspections)) PROJECT_INSPECTIONS[pid] = list;

  // -- change orders ----------------------------------------------------
  for (const k of Object.keys(PROJECT_CHANGE_ORDERS)) delete PROJECT_CHANGE_ORDERS[k];
  for (const [pid, list] of Object.entries(snap.changeOrders)) PROJECT_CHANGE_ORDERS[pid] = list;

  // -- user profiles (merged into USERS by id) -------------------------
  for (const profile of snap.userProfiles) {
    const u = USERS.find((x) => x.id === profile.userId);
    if (!u) continue;
    if (profile.phone !== undefined) u.phone = profile.phone;
    if (profile.postalAddress !== undefined) u.postalAddress = profile.postalAddress;
    if (profile.physicalAddress !== undefined) u.physicalAddress = profile.physicalAddress;
  }

  // -- notifications seen ----------------------------------------------
  // The notifications module owns its own SEEN map, so we expose the data
  // through a setter the route module subscribes to (see notifications.ts).
  _hydratedNotificationsSeen = snap.notificationsSeen;
  if (_notificationsSeenApplier) _notificationsSeenApplier(snap.notificationsSeen);

  // -- structured vars + assisted budgets ------------------------------
  for (const k of Object.keys(PROJECT_STRUCTURED_VARS)) PROJECT_STRUCTURED_VARS[k] = undefined;
  for (const [pid, v] of Object.entries(snap.structuredVars)) PROJECT_STRUCTURED_VARS[pid] = v;
  for (const k of Object.keys(PROJECT_ASSISTED_BUDGETS)) PROJECT_ASSISTED_BUDGETS[k] = undefined;
  for (const [pid, v] of Object.entries(snap.assistedBudgets)) PROJECT_ASSISTED_BUDGETS[pid] = v;

  // -- csv mappings -----------------------------------------------------
  for (const k of Object.keys(PROJECT_CSV_MAPPINGS)) delete PROJECT_CSV_MAPPINGS[k];
  for (const [pid, m] of Object.entries(snap.csvMappings)) PROJECT_CSV_MAPPINGS[pid] = m;

  // -- pre-design checklists -------------------------------------------
  for (const k of Object.keys(PRE_DESIGN_CHECKLISTS)) delete PRE_DESIGN_CHECKLISTS[k];
  for (const [pid, list] of Object.entries(snap.preDesignChecklists)) PRE_DESIGN_CHECKLISTS[pid] = list;

  // -- documents -------------------------------------------------------
  const docs = DOCUMENTS as Record<string, PersistedDocument[]>;
  for (const k of Object.keys(docs)) delete docs[k];
  for (const [pid, list] of Object.entries(snap.documents)) docs[pid] = list;

  // -- activities + AUDIT_LOG rebuild ----------------------------------
  for (const k of Object.keys(PROJECT_ACTIVITIES)) delete PROJECT_ACTIVITIES[k];
  for (const [pid, list] of Object.entries(snap.activities)) PROJECT_ACTIVITIES[pid] = list;

  // Rebuild the in-memory AUDIT_LOG from activities so the admin /audit
  // view stays in sync (seed.ts builds it once at module load; we now
  // rebuild after hydration so persisted activities are reflected too).
  AUDIT_LOG.length = 0;
  for (const [pid, list] of Object.entries(snap.activities)) {
    for (const a of list) {
      AUDIT_LOG.push({
        id: `audit-${a.id}`,
        timestamp: a.timestamp,
        actor: a.actor,
        entity: entityForActivityType(a.type),
        projectId: pid,
        type: a.type,
        description: a.description,
        descriptionEs: a.descriptionEs,
      });
    }
  }
  AUDIT_LOG.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Notifications-seen bridge — the notifications router owns a private
// `Map<userId, Set<id>>`; we let it register itself so hydration can push
// into it, and so the route can call `persistNotificationsSeenForUser()`
// without circular imports.
// ---------------------------------------------------------------------------

type NotificationsSeenApplier = (data: Record<string, string[]>) => void;
let _notificationsSeenApplier: NotificationsSeenApplier | null = null;
let _hydratedNotificationsSeen: Record<string, string[]> | null = null;

export function registerNotificationsSeenApplier(fn: NotificationsSeenApplier): void {
  _notificationsSeenApplier = fn;
  // If hydration ran first, replay the snapshot now.
  if (_hydratedNotificationsSeen) fn(_hydratedNotificationsSeen);
}

// ---------------------------------------------------------------------------
// Per-store serial write queues
// ---------------------------------------------------------------------------

function chain(map: Map<string, Promise<unknown>>, key: string, op: () => Promise<void>): Promise<void> {
  const prev = map.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(op);
  map.set(key, next.catch(() => undefined));
  return next.then(() => undefined);
}

// PROJECTS — single global queue (the array order matters).
let _projectsPending: Promise<unknown> = Promise.resolve();
export function persistProjectsToDb(): Promise<void> {
  const snapshot = structuredClone(PROJECTS) as unknown as PersistedProject[];
  const next = _projectsPending.catch(() => undefined).then(() => saveProjectsToDb(snapshot));
  _projectsPending = next.catch(() => undefined);
  return wrapPersist("projects", next.then(() => undefined));
}

// LEADS — single global queue.
let _leadsPending: Promise<unknown> = Promise.resolve();
export function persistLeadsToDb(): Promise<void> {
  const snapshot = structuredClone(LEADS) as Lead[];
  const next = _leadsPending.catch(() => undefined).then(() => saveLeadsToDb(snapshot));
  _leadsPending = next.catch(() => undefined);
  return wrapPersist("leads", next.then(() => undefined));
}

// Per-project queues.
const _tasksPending = new Map<string, Promise<unknown>>();
export function persistProjectTasksForProject(projectId: string): Promise<void> {
  const list = structuredClone((PROJECT_TASKS as Record<string, PersistedTask[]>)[projectId] ?? []);
  return wrapPersist("project_tasks", chain(_tasksPending, projectId, () => saveProjectTasksForProject(projectId, list)));
}

const _inspectionsPending = new Map<string, Promise<unknown>>();
export function persistInspectionsForProject(projectId: string): Promise<void> {
  const list = structuredClone(PROJECT_INSPECTIONS[projectId] ?? []) as Inspection[];
  return wrapPersist("inspections", chain(_inspectionsPending, projectId, () => saveInspectionsForProject(projectId, list)));
}

const _changeOrdersPending = new Map<string, Promise<unknown>>();
export function persistChangeOrdersForProject(projectId: string): Promise<void> {
  const list = structuredClone(PROJECT_CHANGE_ORDERS[projectId] ?? []) as ChangeOrder[];
  return wrapPersist("change_orders", chain(_changeOrdersPending, projectId, () => saveChangeOrdersForProject(projectId, list)));
}

const _structuredPending = new Map<string, Promise<unknown>>();
export function persistStructuredVarsForProject(projectId: string): Promise<void> {
  const v = PROJECT_STRUCTURED_VARS[projectId];
  const snap = v ? structuredClone(v) as StructuredVariables : undefined;
  return wrapPersist("structured_vars", chain(_structuredPending, projectId, () => saveStructuredVarsForProject(projectId, snap)));
}

const _budgetPending = new Map<string, Promise<unknown>>();
export function persistAssistedBudgetForProject(projectId: string): Promise<void> {
  const v = PROJECT_ASSISTED_BUDGETS[projectId];
  const snap = v ? structuredClone(v) as AssistedBudgetRange : undefined;
  return wrapPersist("assisted_budgets", chain(_budgetPending, projectId, () => saveAssistedBudgetForProject(projectId, snap)));
}

const _csvPending = new Map<string, Promise<unknown>>();
export function persistCsvMappingForProject(projectId: string): Promise<void> {
  const m = structuredClone(PROJECT_CSV_MAPPINGS[projectId] ?? {}) as PersistedCsvMappings;
  return wrapPersist("csv_mappings", chain(_csvPending, projectId, () => saveCsvMappingForProject(projectId, m)));
}

const _checklistPending = new Map<string, Promise<unknown>>();
export function persistPreDesignChecklistForProject(projectId: string): Promise<void> {
  const list = structuredClone(PRE_DESIGN_CHECKLISTS[projectId] ?? []) as PreDesignChecklistItem[];
  return wrapPersist("pre_design_checklists", chain(_checklistPending, projectId, () => savePreDesignChecklistForProject(projectId, list)));
}

const _activitiesPending = new Map<string, Promise<unknown>>();
export function persistActivitiesForProject(projectId: string): Promise<void> {
  const list = structuredClone(PROJECT_ACTIVITIES[projectId] ?? []) as ProjectActivity[];
  return wrapPersist("project_activities", chain(_activitiesPending, projectId, () => saveActivitiesForProject(projectId, list)));
}

const _documentsPending = new Map<string, Promise<unknown>>();
export function persistDocumentsForProject(projectId: string): Promise<void> {
  const raw = (DOCUMENTS as Record<string, PersistedDocument[]>)[projectId] ?? [];
  const list = structuredClone(raw) as PersistedDocument[];
  return wrapPersist("project_documents", chain(_documentsPending, projectId, () => saveDocumentsForProject(projectId, list)));
}

// Per-user queues.
const _profilePending = new Map<string, Promise<unknown>>();
export function persistUserProfile(userId: string): Promise<void> {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return Promise.resolve();
  const profile: { userId: string; phone?: string; postalAddress?: string; physicalAddress?: string } = { userId };
  if (u.phone !== undefined) profile.phone = u.phone;
  if (u.postalAddress !== undefined) profile.postalAddress = u.postalAddress;
  if (u.physicalAddress !== undefined) profile.physicalAddress = u.physicalAddress;
  return wrapPersist("user_profiles", chain(_profilePending, userId, () => saveUserProfile(profile)));
}

const _seenPending = new Map<string, Promise<unknown>>();
export function persistNotificationsSeenForUser(userId: string, ids: string[]): Promise<void> {
  const snap = [...ids];
  return wrapPersist("notifications_seen", chain(_seenPending, userId, () => saveNotificationsSeenForUser(userId, snap)));
}

// ---------------------------------------------------------------------------
// Activity append wrapper — performs the in-memory append (via the seed
// helper) AND awaits Postgres persistence. Routes call THIS instead of
// the raw `appendActivity` import so the durability contract holds:
// `await appendActivityAndPersist(...)` does not resolve until the row
// has been committed.
//
// Routes can pre-existing or async — Express handles both. For handlers
// that previously called `appendActivity(...)` synchronously, change to
// `await appendActivityAndPersist(...)` and mark the handler `async`.
// ---------------------------------------------------------------------------

export async function appendActivityAndPersist(
  projectId: string,
  activity: Omit<ProjectActivity, "id" | "timestamp">,
  audit?: { actorId?: string; actorRole?: string; entity?: AuditEntity; entityId?: string },
): Promise<ProjectActivity> {
  const entry = _appendActivity(projectId, activity, audit);
  await persistActivitiesForProject(projectId);
  return entry;
}

// ---------------------------------------------------------------------------
// Test / shutdown helper — wait for every queue to drain.
// ---------------------------------------------------------------------------

export async function flushLifecyclePersistence(): Promise<void> {
  const all: Promise<unknown>[] = [
    _projectsPending, _leadsPending,
    ...Array.from(_tasksPending.values()),
    ...Array.from(_inspectionsPending.values()),
    ...Array.from(_changeOrdersPending.values()),
    ...Array.from(_structuredPending.values()),
    ...Array.from(_budgetPending.values()),
    ...Array.from(_csvPending.values()),
    ...Array.from(_checklistPending.values()),
    ...Array.from(_activitiesPending.values()),
    ...Array.from(_documentsPending.values()),
    ...Array.from(_profilePending.values()),
    ...Array.from(_seenPending.values()),
  ];
  await Promise.allSettled(all);
}
