// Project lifecycle persistence — Postgres backend (Task #144).
//
// Mirrors the #141 estimating playbook for the in-memory project lifecycle
// stores defined in `data/seed.ts`:
//   PROJECTS, PROJECT_TASKS, LEADS, PROJECT_INSPECTIONS,
//   PROJECT_CHANGE_ORDERS, USER profiles (contact fields), notifications
//   "seen" map, PROJECT_STRUCTURED_VARS, PROJECT_ASSISTED_BUDGETS,
//   PROJECT_CSV_MAPPINGS, PRE_DESIGN_CHECKLISTS, PROJECT_ACTIVITIES.
//
// Public surface:
//   - loadLifecycleSnapshotFromDb()  — full snapshot or null when empty.
//   - saveLifecycleSnapshotToDb()    — wholesale replace inside one tx.
//   - per-store helpers              — `saveProjectsToDb`, `saveLeadsToDb`,
//     `saveProjectTasksForProject`, `saveInspectionsForProject`,
//     `saveChangeOrdersForProject`, `saveUserProfile`,
//     `saveNotificationsSeenForUser`, `saveStructuredVarsForProject`,
//     `saveAssistedBudgetForProject`, `saveCsvMappingForProject`,
//     `savePreDesignChecklistForProject`, `saveActivitiesForProject`.
//   - migrateLifecycleSeedIfNeeded() — first-boot import of the in-memory
//     seed (idempotent; recorded in `lifecycle_migrations`). Includes a
//     clobber guard mirroring `migrateEstimatingJsonIfNeeded`.
//
// The seed file (`data/seed.ts`) is intentionally NOT modified — it stays
// the canonical demo dataset. Hydration mutates the in-memory constants
// in-place at boot from the persisted DB rows; mutations during normal
// request handling continue to flow through `appendActivity` /
// PROJECTS.push / etc., with each mutating route subsequently `await`-ing
// the matching `persist*` helper before responding.

import { db } from "@workspace/db";
import {
  projectsTable,
  projectTasksTable,
  leadsTable,
  projectInspectionsTable,
  projectChangeOrdersTable,
  userProfilesTable,
  projectNotificationsSeenTable,
  projectStructuredVarsTable,
  projectAssistedBudgetsTable,
  projectCsvMappingsTable,
  preDesignChecklistsTable,
  projectActivitiesTable,
  projectDocumentsTable,
  lifecycleMigrationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
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
  type Lead,
  type Inspection,
  type ChangeOrder,
  type StructuredVariables,
  type AssistedBudgetRange,
  type PreDesignChecklistItem,
  type ProjectActivity,
  type CsvImportKind,
} from "../data/seed";

// ---------------------------------------------------------------------------
// Snapshot shapes
// ---------------------------------------------------------------------------

// Project rows are loosely-typed in seed.ts (no exported Project interface).
// The snapshot type uses a permissive `Record<string, unknown>` so the
// snapshot path can round-trip without forcing the rest of the codebase to
// adopt a stricter type. Routes already use ad-hoc field reads.
export type PersistedProject = Record<string, unknown> & { id: string };

export type PersistedTask = {
  id: string;
  projectId: string;
  title: string;
  titleEs: string;
  dueDate: string;
  completed: boolean;
  assignee: string;
  priority: string;
  phase: string;
};

export type PersistedUserProfile = {
  userId: string;
  phone?: string;
  postalAddress?: string;
  physicalAddress?: string;
};

export type PersistedCsvMappings = Partial<
  Record<CsvImportKind, Record<string, string | null>>
>;

// Document records in seed.ts are heterogeneous (pdf vs photo, optional
// drive* / caption / versions[]). Permissive Record so the snapshot path
// can round-trip without forcing a stricter type on every route reader.
export type PersistedDocument = Record<string, unknown> & {
  id: string;
  projectId: string;
};

export interface PersistedLifecycleSnapshot {
  projects: PersistedProject[];
  projectTasks: Record<string, PersistedTask[]>;
  leads: Lead[];
  inspections: Record<string, Inspection[]>;
  changeOrders: Record<string, ChangeOrder[]>;
  userProfiles: PersistedUserProfile[];
  notificationsSeen: Record<string, string[]>;
  structuredVars: Record<string, StructuredVariables>;
  assistedBudgets: Record<string, AssistedBudgetRange>;
  csvMappings: Record<string, PersistedCsvMappings>;
  preDesignChecklists: Record<string, PreDesignChecklistItem[]>;
  activities: Record<string, ProjectActivity[]>;
  documents: Record<string, PersistedDocument[]>;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function loadLifecycleSnapshotFromDb(): Promise<PersistedLifecycleSnapshot | null> {
  const [
    projectRows,
    taskRows,
    leadRows,
    inspectionRows,
    changeOrderRows,
    profileRows,
    seenRows,
    structuredRows,
    budgetRows,
    csvRows,
    checklistRows,
    activityRows,
    documentRows,
  ] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(projectTasksTable),
    db.select().from(leadsTable),
    db.select().from(projectInspectionsTable),
    db.select().from(projectChangeOrdersTable),
    db.select().from(userProfilesTable),
    db.select().from(projectNotificationsSeenTable),
    db.select().from(projectStructuredVarsTable),
    db.select().from(projectAssistedBudgetsTable),
    db.select().from(projectCsvMappingsTable),
    db.select().from(preDesignChecklistsTable),
    db.select().from(projectActivitiesTable),
    db.select().from(projectDocumentsTable),
  ]);

  const empty =
    projectRows.length === 0 &&
    taskRows.length === 0 &&
    leadRows.length === 0 &&
    inspectionRows.length === 0 &&
    changeOrderRows.length === 0 &&
    profileRows.length === 0 &&
    seenRows.length === 0 &&
    structuredRows.length === 0 &&
    budgetRows.length === 0 &&
    csvRows.length === 0 &&
    checklistRows.length === 0 &&
    activityRows.length === 0 &&
    documentRows.length === 0;
  if (empty) return null;

  // -- projects ---------------------------------------------------------
  const projects: PersistedProject[] = [...projectRows]
    .sort((a, b) => a.position - b.position)
    .map((r) => {
      const out: Record<string, unknown> = {
        id: r.id,
        name: r.name,
        nameEs: r.nameEs,
        clientName: r.clientName,
        location: r.location,
        city: r.city,
        phase: r.phase,
        phaseLabel: r.phaseLabel,
        phaseLabelEs: r.phaseLabelEs,
        phaseNumber: r.phaseNumber,
        progressPercent: r.progressPercent,
        budgetAllocated: r.budgetAllocated,
        budgetUsed: r.budgetUsed,
        startDate: r.startDate,
        estimatedEndDate: r.estimatedEndDate,
        description: r.description,
        coverImage: r.coverImage,
        teamMembers: r.teamMembers,
        status: r.status,
      };
      if (r.asanaGid !== null) out["asanaGid"] = r.asanaGid;
      if (r.gammaReportUrl !== null) out["gammaReportUrl"] = r.gammaReportUrl;
      if (r.clientUserId !== null) out["clientUserId"] = r.clientUserId;
      if (r.clientPhone !== null) out["clientPhone"] = r.clientPhone;
      if (r.clientPostalAddress !== null) out["clientPostalAddress"] = r.clientPostalAddress;
      if (r.clientPhysicalAddress !== null) out["clientPhysicalAddress"] = r.clientPhysicalAddress;
      if (r.currentStatusNote !== null) out["currentStatusNote"] = r.currentStatusNote;
      if (r.currentStatusNoteEs !== null) out["currentStatusNoteEs"] = r.currentStatusNoteEs;
      if (r.squareMeters !== null) out["squareMeters"] = r.squareMeters;
      if (r.bathrooms !== null) out["bathrooms"] = r.bathrooms;
      if (r.kitchens !== null) out["kitchens"] = r.kitchens;
      if (r.projectType !== null) out["projectType"] = r.projectType;
      if (r.contingencyPercent !== null) out["contingencyPercent"] = r.contingencyPercent;
      if (r.leadId !== null) out["leadId"] = r.leadId;
      return out as PersistedProject;
    });

  // -- tasks ------------------------------------------------------------
  const projectTasks: Record<string, PersistedTask[]> = {};
  for (const r of [...taskRows].sort((a, b) => a.position - b.position)) {
    if (!projectTasks[r.projectId]) projectTasks[r.projectId] = [];
    projectTasks[r.projectId]!.push({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      titleEs: r.titleEs,
      dueDate: r.dueDate,
      completed: r.completed,
      assignee: r.assignee,
      priority: r.priority,
      phase: r.phase,
    });
  }

  // -- leads ------------------------------------------------------------
  const leads: Lead[] = [...leadRows]
    .sort((a, b) => a.position - b.position)
    .map((r) => {
      const lead: Lead = {
        id: r.id,
        source: r.source as Lead["source"],
        projectType: r.projectType as Lead["projectType"],
        location: r.location,
        budgetRange: r.budgetRange as Lead["budgetRange"],
        terrainStatus: r.terrainStatus as Lead["terrainStatus"],
        contactName: r.contactName,
        email: r.email,
        phone: r.phone,
        createdAt: r.createdAt,
        score: r.score,
        status: r.status as Lead["status"],
      };
      if (r.notes !== null) lead.notes = r.notes;
      if (r.bookingType !== null && r.bookingSlot !== null && r.bookingLabel !== null) {
        lead.booking = {
          type: r.bookingType as Lead["booking"] extends infer B ? (B extends { type: infer T } ? T : never) : never,
          slot: r.bookingSlot,
          label: r.bookingLabel,
        };
      }
      if (r.asanaGid !== null) lead.asanaGid = r.asanaGid;
      return lead;
    });

  // -- inspections ------------------------------------------------------
  const inspections: Record<string, Inspection[]> = {};
  for (const r of [...inspectionRows].sort((a, b) => a.position - b.position)) {
    if (!inspections[r.projectId]) inspections[r.projectId] = [];
    const ins: Inspection = {
      id: r.id,
      projectId: r.projectId,
      type: r.type as Inspection["type"],
      title: r.title,
      titleEs: r.titleEs,
      inspector: r.inspector,
      scheduledDate: r.scheduledDate,
      status: r.status as Inspection["status"],
    };
    if (r.completedDate !== null) ins.completedDate = r.completedDate;
    if (r.notes !== null) ins.notes = r.notes;
    if (r.notesEs !== null) ins.notesEs = r.notesEs;
    if (r.reportSentTo !== null) ins.reportSentTo = r.reportSentTo;
    if (r.reportSentToName !== null) ins.reportSentToName = r.reportSentToName;
    if (r.reportSentAt !== null) ins.reportSentAt = r.reportSentAt;
    if (r.reportSentNote !== null) ins.reportSentNote = r.reportSentNote;
    if (r.reportDocumentUrl !== null) ins.reportDocumentUrl = r.reportDocumentUrl;
    if (r.reportDocumentName !== null) ins.reportDocumentName = r.reportDocumentName;
    inspections[r.projectId]!.push(ins);
  }

  // -- change orders ----------------------------------------------------
  const changeOrders: Record<string, ChangeOrder[]> = {};
  for (const r of [...changeOrderRows].sort((a, b) => a.position - b.position)) {
    if (!changeOrders[r.projectId]) changeOrders[r.projectId] = [];
    const co: ChangeOrder = {
      id: r.id,
      projectId: r.projectId,
      number: r.number,
      title: r.title,
      titleEs: r.titleEs,
      description: r.description,
      descriptionEs: r.descriptionEs,
      amountDelta: r.amountDelta,
      scheduleImpactDays: r.scheduleImpactDays,
      reason: r.reason,
      reasonEs: r.reasonEs,
      requestedBy: r.requestedBy,
      requestedAt: r.requestedAt,
      status: r.status as ChangeOrder["status"],
      outsideOfScope: r.outsideOfScope,
    };
    if (r.decidedBy !== null) co.decidedBy = r.decidedBy;
    if (r.decidedAt !== null) co.decidedAt = r.decidedAt;
    if (r.decisionNote !== null) co.decisionNote = r.decisionNote;
    changeOrders[r.projectId]!.push(co);
  }

  // -- user profiles ----------------------------------------------------
  const userProfiles: PersistedUserProfile[] = profileRows.map((r) => {
    const p: PersistedUserProfile = { userId: r.userId };
    if (r.phone !== null) p.phone = r.phone;
    if (r.postalAddress !== null) p.postalAddress = r.postalAddress;
    if (r.physicalAddress !== null) p.physicalAddress = r.physicalAddress;
    return p;
  });

  // -- notifications seen ----------------------------------------------
  const notificationsSeen: Record<string, string[]> = {};
  for (const r of seenRows) {
    if (!notificationsSeen[r.userId]) notificationsSeen[r.userId] = [];
    notificationsSeen[r.userId]!.push(r.notificationId);
  }

  // -- structured vars + assisted budgets ------------------------------
  const structuredVars: Record<string, StructuredVariables> = {};
  for (const r of structuredRows) {
    structuredVars[r.projectId] = {
      squareMeters: r.squareMeters,
      zoningCode: r.zoningCode,
      projectType: r.projectType as StructuredVariables["projectType"],
      submittedAt: r.submittedAt,
      submittedBy: r.submittedBy,
    };
  }
  const assistedBudgets: Record<string, AssistedBudgetRange> = {};
  for (const r of budgetRows) {
    assistedBudgets[r.projectId] = {
      low: r.low,
      mid: r.mid,
      high: r.high,
      currency: r.currency as "USD",
      perSqMeterMid: r.perSqMeterMid,
    };
  }

  // -- csv mappings -----------------------------------------------------
  const csvMappings: Record<string, PersistedCsvMappings> = {};
  for (const r of csvRows) {
    if (!csvMappings[r.projectId]) csvMappings[r.projectId] = {};
    (csvMappings[r.projectId] as PersistedCsvMappings)[r.kind as CsvImportKind] = r.mapping;
  }

  // -- pre-design checklists -------------------------------------------
  const preDesignChecklists: Record<string, PreDesignChecklistItem[]> = {};
  for (const r of [...checklistRows].sort((a, b) => a.position - b.position)) {
    if (!preDesignChecklists[r.projectId]) preDesignChecklists[r.projectId] = [];
    const item: PreDesignChecklistItem = {
      id: r.id,
      label: r.label,
      labelEs: r.labelEs,
      status: r.status as PreDesignChecklistItem["status"],
      assignee: r.assignee,
    };
    if (r.completedAt !== null) item.completedAt = r.completedAt;
    preDesignChecklists[r.projectId]!.push(item);
  }

  // -- activities -------------------------------------------------------
  // Activities are unshifted (newest-first) by appendActivity. We persist
  // with `position` matching the in-memory order so reload preserves it.
  const activities: Record<string, ProjectActivity[]> = {};
  for (const r of [...activityRows].sort((a, b) => a.position - b.position)) {
    if (!activities[r.projectId]) activities[r.projectId] = [];
    activities[r.projectId]!.push({
      id: r.id,
      timestamp: r.timestamp,
      type: r.type as ProjectActivity["type"],
      actor: r.actor,
      description: r.description,
      descriptionEs: r.descriptionEs,
    });
  }

  // -- documents --------------------------------------------------------
  const documents: Record<string, PersistedDocument[]> = {};
  for (const r of [...documentRows].sort((a, b) => a.position - b.position)) {
    if (!documents[r.projectId]) documents[r.projectId] = [];
    documents[r.projectId]!.push(rowToDocument(r));
  }

  return {
    projects,
    projectTasks,
    leads,
    inspections,
    changeOrders,
    userProfiles,
    notificationsSeen,
    structuredVars,
    assistedBudgets,
    csvMappings,
    preDesignChecklists,
    activities,
    documents,
  };
}

// ---------------------------------------------------------------------------
// Whole-snapshot save (used by migration + tests)
// ---------------------------------------------------------------------------

async function _writeSnapshot(tx: Tx, snap: PersistedLifecycleSnapshot): Promise<void> {
  // Wipe all lifecycle tables first; same trade-off as estimating —
  // simpler than diffing, tables stay small.
  await tx.delete(projectDocumentsTable);
  await tx.delete(projectActivitiesTable);
  await tx.delete(preDesignChecklistsTable);
  await tx.delete(projectCsvMappingsTable);
  await tx.delete(projectAssistedBudgetsTable);
  await tx.delete(projectStructuredVarsTable);
  await tx.delete(projectNotificationsSeenTable);
  await tx.delete(userProfilesTable);
  await tx.delete(projectChangeOrdersTable);
  await tx.delete(projectInspectionsTable);
  await tx.delete(leadsTable);
  await tx.delete(projectTasksTable);
  await tx.delete(projectsTable);

  if (snap.projects.length > 0) {
    await tx.insert(projectsTable).values(snap.projects.map((p, position) => projectToRow(p, position)));
  }

  const taskRows: (typeof projectTasksTable.$inferInsert)[] = [];
  for (const [projectId, tasks] of Object.entries(snap.projectTasks)) {
    tasks.forEach((t, position) => {
      taskRows.push({
        projectId,
        id: t.id,
        position,
        title: t.title,
        titleEs: t.titleEs,
        dueDate: t.dueDate,
        completed: t.completed,
        assignee: t.assignee,
        priority: t.priority,
        phase: t.phase,
      });
    });
  }
  if (taskRows.length > 0) await tx.insert(projectTasksTable).values(taskRows);

  if (snap.leads.length > 0) {
    await tx.insert(leadsTable).values(snap.leads.map((l, position) => leadToRow(l, position)));
  }

  const inspectionRows: (typeof projectInspectionsTable.$inferInsert)[] = [];
  for (const [projectId, list] of Object.entries(snap.inspections)) {
    list.forEach((ins, position) => inspectionRows.push(inspectionToRow(projectId, ins, position)));
  }
  if (inspectionRows.length > 0) await tx.insert(projectInspectionsTable).values(inspectionRows);

  const coRows: (typeof projectChangeOrdersTable.$inferInsert)[] = [];
  for (const [projectId, list] of Object.entries(snap.changeOrders)) {
    list.forEach((co, position) => coRows.push(changeOrderToRow(projectId, co, position)));
  }
  if (coRows.length > 0) await tx.insert(projectChangeOrdersTable).values(coRows);

  if (snap.userProfiles.length > 0) {
    await tx.insert(userProfilesTable).values(
      snap.userProfiles.map((p) => ({
        userId: p.userId,
        phone: p.phone ?? null,
        postalAddress: p.postalAddress ?? null,
        physicalAddress: p.physicalAddress ?? null,
      })),
    );
  }

  const seenRows: (typeof projectNotificationsSeenTable.$inferInsert)[] = [];
  for (const [userId, ids] of Object.entries(snap.notificationsSeen)) {
    for (const notificationId of ids) seenRows.push({ userId, notificationId });
  }
  if (seenRows.length > 0) await tx.insert(projectNotificationsSeenTable).values(seenRows);

  const structuredRows = Object.entries(snap.structuredVars).map(([projectId, v]) => ({
    projectId,
    squareMeters: v.squareMeters,
    zoningCode: v.zoningCode,
    projectType: v.projectType,
    submittedAt: v.submittedAt,
    submittedBy: v.submittedBy,
  }));
  if (structuredRows.length > 0) await tx.insert(projectStructuredVarsTable).values(structuredRows);

  const budgetRows = Object.entries(snap.assistedBudgets).map(([projectId, v]) => ({
    projectId,
    low: v.low,
    mid: v.mid,
    high: v.high,
    currency: v.currency,
    perSqMeterMid: v.perSqMeterMid,
  }));
  if (budgetRows.length > 0) await tx.insert(projectAssistedBudgetsTable).values(budgetRows);

  const csvRows: (typeof projectCsvMappingsTable.$inferInsert)[] = [];
  for (const [projectId, mappings] of Object.entries(snap.csvMappings)) {
    for (const [kind, mapping] of Object.entries(mappings)) {
      if (mapping) csvRows.push({ projectId, kind, mapping });
    }
  }
  if (csvRows.length > 0) await tx.insert(projectCsvMappingsTable).values(csvRows);

  const checklistRows: (typeof preDesignChecklistsTable.$inferInsert)[] = [];
  for (const [projectId, list] of Object.entries(snap.preDesignChecklists)) {
    list.forEach((c, position) => {
      checklistRows.push({
        projectId,
        id: c.id,
        position,
        label: c.label,
        labelEs: c.labelEs,
        status: c.status,
        assignee: c.assignee,
        completedAt: c.completedAt ?? null,
      });
    });
  }
  if (checklistRows.length > 0) await tx.insert(preDesignChecklistsTable).values(checklistRows);

  const activityRows: (typeof projectActivitiesTable.$inferInsert)[] = [];
  for (const [projectId, list] of Object.entries(snap.activities)) {
    list.forEach((a, position) => {
      activityRows.push({
        projectId,
        id: a.id,
        position,
        timestamp: a.timestamp,
        type: a.type,
        actor: a.actor,
        description: a.description,
        descriptionEs: a.descriptionEs,
      });
    });
  }
  if (activityRows.length > 0) await tx.insert(projectActivitiesTable).values(activityRows);

  const documentRows: (typeof projectDocumentsTable.$inferInsert)[] = [];
  for (const [projectId, list] of Object.entries(snap.documents)) {
    list.forEach((d, position) => documentRows.push(documentToRow(projectId, d, position)));
  }
  if (documentRows.length > 0) await tx.insert(projectDocumentsTable).values(documentRows);
}

export async function saveLifecycleSnapshotToDb(snap: PersistedLifecycleSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await _writeSnapshot(tx, snap);
  });
}

// ---------------------------------------------------------------------------
// Row mappers (also used by per-store helpers)
// ---------------------------------------------------------------------------

function projectToRow(p: PersistedProject, position: number): typeof projectsTable.$inferInsert {
  const get = <T>(k: string): T | undefined => p[k] as T | undefined;
  return {
    id: p.id,
    position,
    name: (get<string>("name") ?? "") as string,
    nameEs: (get<string>("nameEs") ?? get<string>("name") ?? "") as string,
    clientName: (get<string>("clientName") ?? "") as string,
    location: (get<string>("location") ?? "") as string,
    city: (get<string>("city") ?? "") as string,
    phase: (get<string>("phase") ?? "discovery") as string,
    phaseLabel: (get<string>("phaseLabel") ?? "") as string,
    phaseLabelEs: (get<string>("phaseLabelEs") ?? "") as string,
    phaseNumber: (get<number>("phaseNumber") ?? 1) as number,
    progressPercent: (get<number>("progressPercent") ?? 0) as number,
    budgetAllocated: (get<number>("budgetAllocated") ?? 0) as number,
    budgetUsed: (get<number>("budgetUsed") ?? 0) as number,
    startDate: (get<string>("startDate") ?? "") as string,
    estimatedEndDate: (get<string>("estimatedEndDate") ?? "") as string,
    description: (get<string>("description") ?? "") as string,
    coverImage: (get<string>("coverImage") ?? "") as string,
    asanaGid: get<string>("asanaGid") ?? null,
    gammaReportUrl: get<string>("gammaReportUrl") ?? null,
    teamMembers: (get<string[]>("teamMembers") ?? []) as string[],
    status: (get<string>("status") ?? "active") as string,
    clientUserId: get<string>("clientUserId") ?? null,
    clientPhone: get<string>("clientPhone") ?? null,
    clientPostalAddress: get<string>("clientPostalAddress") ?? null,
    clientPhysicalAddress: get<string>("clientPhysicalAddress") ?? null,
    currentStatusNote: get<string>("currentStatusNote") ?? null,
    currentStatusNoteEs: get<string>("currentStatusNoteEs") ?? null,
    squareMeters: get<number>("squareMeters") ?? null,
    bathrooms: get<number>("bathrooms") ?? null,
    kitchens: get<number>("kitchens") ?? null,
    projectType: get<string>("projectType") ?? null,
    contingencyPercent: get<number>("contingencyPercent") ?? null,
    leadId: get<string>("leadId") ?? null,
  };
}

function leadToRow(l: Lead, position: number): typeof leadsTable.$inferInsert {
  return {
    id: l.id,
    position,
    source: l.source,
    projectType: l.projectType,
    location: l.location,
    budgetRange: l.budgetRange,
    terrainStatus: l.terrainStatus,
    contactName: l.contactName,
    email: l.email,
    phone: l.phone,
    notes: l.notes ?? null,
    createdAt: l.createdAt,
    score: l.score,
    status: l.status,
    bookingType: l.booking?.type ?? null,
    bookingSlot: l.booking?.slot ?? null,
    bookingLabel: l.booking?.label ?? null,
    asanaGid: l.asanaGid ?? null,
  };
}

function inspectionToRow(projectId: string, ins: Inspection, position: number): typeof projectInspectionsTable.$inferInsert {
  return {
    projectId,
    id: ins.id,
    position,
    type: ins.type,
    title: ins.title,
    titleEs: ins.titleEs,
    inspector: ins.inspector,
    scheduledDate: ins.scheduledDate,
    completedDate: ins.completedDate ?? null,
    status: ins.status,
    notes: ins.notes ?? null,
    notesEs: ins.notesEs ?? null,
    reportSentTo: ins.reportSentTo ?? null,
    reportSentToName: ins.reportSentToName ?? null,
    reportSentAt: ins.reportSentAt ?? null,
    reportSentNote: ins.reportSentNote ?? null,
    reportDocumentUrl: ins.reportDocumentUrl ?? null,
    reportDocumentName: ins.reportDocumentName ?? null,
  };
}

function changeOrderToRow(projectId: string, co: ChangeOrder, position: number): typeof projectChangeOrdersTable.$inferInsert {
  return {
    projectId,
    id: co.id,
    position,
    number: co.number,
    title: co.title,
    titleEs: co.titleEs,
    description: co.description,
    descriptionEs: co.descriptionEs,
    amountDelta: co.amountDelta,
    scheduleImpactDays: co.scheduleImpactDays,
    reason: co.reason,
    reasonEs: co.reasonEs,
    requestedBy: co.requestedBy,
    requestedAt: co.requestedAt,
    status: co.status,
    decidedBy: co.decidedBy ?? null,
    decidedAt: co.decidedAt ?? null,
    decisionNote: co.decisionNote ?? null,
    outsideOfScope: co.outsideOfScope,
  };
}

// Document mapper. Typed columns cover the fields routes read directly;
// every other property survives in `metadata` (versions[], previewable,
// future fields) so the snapshot round-trips losslessly.
const DOCUMENT_TYPED_KEYS = new Set<string>([
  "id", "projectId", "name", "type", "category", "isClientVisible",
  "featuredAsCover", "uploadedBy", "uploadedAt", "fileSize", "mimeType",
  "description", "photoCategory", "caption", "imageUrl",
  "driveFileId", "driveFolderId", "driveWebViewLink", "driveWebContentLink",
  "driveThumbnailLink", "driveDownloadProxyUrl",
]);

function documentToRow(projectId: string, d: PersistedDocument, position: number): typeof projectDocumentsTable.$inferInsert {
  const get = <T>(k: string): T | undefined => d[k] as T | undefined;
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (!DOCUMENT_TYPED_KEYS.has(k) && v !== undefined) metadata[k] = v;
  }
  return {
    projectId,
    id: d.id,
    position,
    name: (get<string>("name") ?? "") as string,
    type: (get<string>("type") ?? "pdf") as string,
    category: (get<string>("category") ?? "") as string,
    isClientVisible: get<boolean>("isClientVisible") === true,
    featuredAsCover: get<boolean>("featuredAsCover") ?? null,
    uploadedBy: (get<string>("uploadedBy") ?? "system") as string,
    uploadedAt: (get<string>("uploadedAt") ?? new Date().toISOString()) as string,
    fileSize: (get<string>("fileSize") ?? "0 KB") as string,
    mimeType: get<string>("mimeType") ?? null,
    description: get<string>("description") ?? null,
    photoCategory: get<string>("photoCategory") ?? null,
    caption: get<string>("caption") ?? null,
    imageUrl: get<string>("imageUrl") ?? null,
    driveFileId: get<string>("driveFileId") ?? null,
    driveFolderId: get<string>("driveFolderId") ?? null,
    driveWebViewLink: get<string>("driveWebViewLink") ?? null,
    driveWebContentLink: get<string>("driveWebContentLink") ?? null,
    driveThumbnailLink: get<string>("driveThumbnailLink") ?? null,
    driveDownloadProxyUrl: get<string>("driveDownloadProxyUrl") ?? null,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

function rowToDocument(r: typeof projectDocumentsTable.$inferSelect): PersistedDocument {
  const out: Record<string, unknown> = {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    type: r.type,
    category: r.category,
    isClientVisible: r.isClientVisible,
    uploadedBy: r.uploadedBy,
    uploadedAt: r.uploadedAt,
    fileSize: r.fileSize,
  };
  if (r.featuredAsCover !== null) out["featuredAsCover"] = r.featuredAsCover;
  if (r.mimeType !== null) out["mimeType"] = r.mimeType;
  if (r.description !== null) out["description"] = r.description;
  if (r.photoCategory !== null) out["photoCategory"] = r.photoCategory;
  if (r.caption !== null) out["caption"] = r.caption;
  if (r.imageUrl !== null) out["imageUrl"] = r.imageUrl;
  if (r.driveFileId !== null) out["driveFileId"] = r.driveFileId;
  if (r.driveFolderId !== null) out["driveFolderId"] = r.driveFolderId;
  if (r.driveWebViewLink !== null) out["driveWebViewLink"] = r.driveWebViewLink;
  if (r.driveWebContentLink !== null) out["driveWebContentLink"] = r.driveWebContentLink;
  if (r.driveThumbnailLink !== null) out["driveThumbnailLink"] = r.driveThumbnailLink;
  if (r.driveDownloadProxyUrl !== null) out["driveDownloadProxyUrl"] = r.driveDownloadProxyUrl;
  if (r.metadata) {
    for (const [k, v] of Object.entries(r.metadata)) out[k] = v;
  }
  return out as PersistedDocument;
}

// ---------------------------------------------------------------------------
// Per-store save helpers (called from routes via lifecycle-persistence queues)
// ---------------------------------------------------------------------------

export async function saveProjectsToDb(projects: PersistedProject[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectsTable);
    if (projects.length === 0) return;
    await tx.insert(projectsTable).values(projects.map((p, i) => projectToRow(p, i)));
  });
}

export async function saveProjectTasksForProject(projectId: string, tasks: PersistedTask[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectTasksTable).where(eq(projectTasksTable.projectId, projectId));
    if (tasks.length === 0) return;
    await tx.insert(projectTasksTable).values(
      tasks.map((t, position) => ({
        projectId,
        id: t.id,
        position,
        title: t.title,
        titleEs: t.titleEs,
        dueDate: t.dueDate,
        completed: t.completed,
        assignee: t.assignee,
        priority: t.priority,
        phase: t.phase,
      })),
    );
  });
}

export async function saveLeadsToDb(leads: Lead[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(leadsTable);
    if (leads.length === 0) return;
    await tx.insert(leadsTable).values(leads.map((l, i) => leadToRow(l, i)));
  });
}

export async function saveInspectionsForProject(projectId: string, list: Inspection[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectInspectionsTable).where(eq(projectInspectionsTable.projectId, projectId));
    if (list.length === 0) return;
    await tx.insert(projectInspectionsTable).values(list.map((ins, i) => inspectionToRow(projectId, ins, i)));
  });
}

export async function saveChangeOrdersForProject(projectId: string, list: ChangeOrder[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectChangeOrdersTable).where(eq(projectChangeOrdersTable.projectId, projectId));
    if (list.length === 0) return;
    await tx.insert(projectChangeOrdersTable).values(list.map((co, i) => changeOrderToRow(projectId, co, i)));
  });
}

export async function saveUserProfile(profile: PersistedUserProfile): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userProfilesTable).where(eq(userProfilesTable.userId, profile.userId));
    await tx.insert(userProfilesTable).values({
      userId: profile.userId,
      phone: profile.phone ?? null,
      postalAddress: profile.postalAddress ?? null,
      physicalAddress: profile.physicalAddress ?? null,
    });
  });
}

export async function saveNotificationsSeenForUser(userId: string, ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectNotificationsSeenTable).where(eq(projectNotificationsSeenTable.userId, userId));
    if (ids.length === 0) return;
    await tx.insert(projectNotificationsSeenTable).values(ids.map((notificationId) => ({ userId, notificationId })));
  });
}

export async function saveStructuredVarsForProject(projectId: string, vars: StructuredVariables | undefined): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectStructuredVarsTable).where(eq(projectStructuredVarsTable.projectId, projectId));
    if (!vars) return;
    await tx.insert(projectStructuredVarsTable).values({
      projectId,
      squareMeters: vars.squareMeters,
      zoningCode: vars.zoningCode,
      projectType: vars.projectType,
      submittedAt: vars.submittedAt,
      submittedBy: vars.submittedBy,
    });
  });
}

export async function saveAssistedBudgetForProject(projectId: string, budget: AssistedBudgetRange | undefined): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectAssistedBudgetsTable).where(eq(projectAssistedBudgetsTable.projectId, projectId));
    if (!budget) return;
    await tx.insert(projectAssistedBudgetsTable).values({
      projectId,
      low: budget.low,
      mid: budget.mid,
      high: budget.high,
      currency: budget.currency,
      perSqMeterMid: budget.perSqMeterMid,
    });
  });
}

export async function saveCsvMappingForProject(projectId: string, mappings: PersistedCsvMappings): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectCsvMappingsTable).where(eq(projectCsvMappingsTable.projectId, projectId));
    const rows: (typeof projectCsvMappingsTable.$inferInsert)[] = [];
    for (const [kind, mapping] of Object.entries(mappings)) {
      if (mapping) rows.push({ projectId, kind, mapping });
    }
    if (rows.length === 0) return;
    await tx.insert(projectCsvMappingsTable).values(rows);
  });
}

export async function savePreDesignChecklistForProject(projectId: string, list: PreDesignChecklistItem[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(preDesignChecklistsTable).where(eq(preDesignChecklistsTable.projectId, projectId));
    if (list.length === 0) return;
    await tx.insert(preDesignChecklistsTable).values(
      list.map((c, position) => ({
        projectId,
        id: c.id,
        position,
        label: c.label,
        labelEs: c.labelEs,
        status: c.status,
        assignee: c.assignee,
        completedAt: c.completedAt ?? null,
      })),
    );
  });
}

export async function saveActivitiesForProject(projectId: string, list: ProjectActivity[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectActivitiesTable).where(eq(projectActivitiesTable.projectId, projectId));
    if (list.length === 0) return;
    await tx.insert(projectActivitiesTable).values(
      list.map((a, position) => ({
        projectId,
        id: a.id,
        position,
        timestamp: a.timestamp,
        type: a.type,
        actor: a.actor,
        description: a.description,
        descriptionEs: a.descriptionEs,
      })),
    );
  });
}

export async function saveDocumentsForProject(projectId: string, list: PersistedDocument[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
    if (list.length === 0) return;
    await tx.insert(projectDocumentsTable).values(list.map((d, i) => documentToRow(projectId, d, i)));
  });
}

// ---------------------------------------------------------------------------
// One-time seed → Postgres migration
// ---------------------------------------------------------------------------

const SEED_MIGRATION_ID = "lifecycle-seed-2026-05";

function buildSnapshotFromSeed(): PersistedLifecycleSnapshot {
  const projectTasks: Record<string, PersistedTask[]> = {};
  for (const [projectId, list] of Object.entries(PROJECT_TASKS as Record<string, PersistedTask[]>)) {
    projectTasks[projectId] = structuredClone(list);
  }
  const userProfiles: PersistedUserProfile[] = [];
  for (const u of USERS) {
    if (u.phone || u.postalAddress || u.physicalAddress) {
      const p: PersistedUserProfile = { userId: u.id };
      if (u.phone) p.phone = u.phone;
      if (u.postalAddress) p.postalAddress = u.postalAddress;
      if (u.physicalAddress) p.physicalAddress = u.physicalAddress;
      userProfiles.push(p);
    }
  }
  const structuredVars: Record<string, StructuredVariables> = {};
  for (const [pid, v] of Object.entries(PROJECT_STRUCTURED_VARS)) {
    if (v) structuredVars[pid] = structuredClone(v);
  }
  const assistedBudgets: Record<string, AssistedBudgetRange> = {};
  for (const [pid, v] of Object.entries(PROJECT_ASSISTED_BUDGETS)) {
    if (v) assistedBudgets[pid] = structuredClone(v);
  }
  return {
    projects: structuredClone(PROJECTS) as PersistedProject[],
    projectTasks,
    leads: structuredClone(LEADS),
    inspections: structuredClone(PROJECT_INSPECTIONS),
    changeOrders: structuredClone(PROJECT_CHANGE_ORDERS),
    userProfiles,
    notificationsSeen: {},
    structuredVars,
    assistedBudgets,
    csvMappings: structuredClone(PROJECT_CSV_MAPPINGS) as Record<string, PersistedCsvMappings>,
    preDesignChecklists: structuredClone(PRE_DESIGN_CHECKLISTS),
    activities: structuredClone(PROJECT_ACTIVITIES),
    documents: structuredClone(DOCUMENTS) as Record<string, PersistedDocument[]>,
  };
}

/**
 * On first boot, copy every in-memory seed store into Postgres and record
 * the migration in `lifecycle_migrations` so subsequent boots skip it.
 *
 * Clobber guard: if the marker is missing but ANY lifecycle table already
 * holds rows (e.g. fresh DB pointed at a backup, marker accidentally
 * deleted), we DO NOT replay the seed on top — `_writeSnapshot` truncates
 * and would silently wipe live data. Instead we insert the marker so we
 * stop checking on every boot, log loudly, and bail out untouched.
 */
export async function migrateLifecycleSeedIfNeeded(): Promise<{
  status: "already_applied" | "migrated";
}> {
  const existing = await db
    .select()
    .from(lifecycleMigrationsTable)
    .where(eq(lifecycleMigrationsTable.id, SEED_MIGRATION_ID));
  if (existing.length > 0) return { status: "already_applied" };

  // Clobber guard — count every lifecycle table.
  const [
    projectCount, taskCount, leadCount, insCount, coCount, profileCount,
    seenCount, structCount, budgetCount, csvCount, checkCount, actCount,
    docCount,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(projectsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectTasksTable),
    db.select({ n: sql<number>`count(*)::int` }).from(leadsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectInspectionsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectChangeOrdersTable),
    db.select({ n: sql<number>`count(*)::int` }).from(userProfilesTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectNotificationsSeenTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectStructuredVarsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectAssistedBudgetsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectCsvMappingsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(preDesignChecklistsTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectActivitiesTable),
    db.select({ n: sql<number>`count(*)::int` }).from(projectDocumentsTable),
  ]);
  const totalRows =
    (projectCount[0]?.n ?? 0) + (taskCount[0]?.n ?? 0) + (leadCount[0]?.n ?? 0) +
    (insCount[0]?.n ?? 0) + (coCount[0]?.n ?? 0) + (profileCount[0]?.n ?? 0) +
    (seenCount[0]?.n ?? 0) + (structCount[0]?.n ?? 0) + (budgetCount[0]?.n ?? 0) +
    (csvCount[0]?.n ?? 0) + (checkCount[0]?.n ?? 0) + (actCount[0]?.n ?? 0) +
    (docCount[0]?.n ?? 0);

  if (totalRows > 0) {
    logger.warn(
      { totalRows },
      "lifecycle-store: seed migration marker missing but DB is non-empty — refusing to overwrite. Marking migration as applied.",
    );
    await db.insert(lifecycleMigrationsTable).values({
      id: SEED_MIGRATION_ID,
      details: `skipped: db non-empty (${totalRows} rows)`,
    });
    return { status: "already_applied" };
  }

  const snap = buildSnapshotFromSeed();
  await db.transaction(async (tx) => {
    await _writeSnapshot(tx, snap);
    await tx.insert(lifecycleMigrationsTable).values({
      id: SEED_MIGRATION_ID,
      details: `seeded ${snap.projects.length} projects, ${snap.leads.length} leads`,
    });
  });
  logger.info(
    {
      projects: snap.projects.length,
      leads: snap.leads.length,
      tasks: Object.values(snap.projectTasks).reduce((n, l) => n + l.length, 0),
      activities: Object.values(snap.activities).reduce((n, l) => n + l.length, 0),
    },
    "lifecycle-store: imported seed into Postgres",
  );
  return { status: "migrated" };
}

// Test helper — wipes every lifecycle table + the migration marker so a
// fresh test run gets the same boot-time path the production server does.
export async function __resetLifecycleTablesForTest(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(projectDocumentsTable);
    await tx.delete(projectActivitiesTable);
    await tx.delete(preDesignChecklistsTable);
    await tx.delete(projectCsvMappingsTable);
    await tx.delete(projectAssistedBudgetsTable);
    await tx.delete(projectStructuredVarsTable);
    await tx.delete(projectNotificationsSeenTable);
    await tx.delete(userProfilesTable);
    await tx.delete(projectChangeOrdersTable);
    await tx.delete(projectInspectionsTable);
    await tx.delete(leadsTable);
    await tx.delete(projectTasksTable);
    await tx.delete(projectsTable);
    await tx.execute(sql`DELETE FROM lifecycle_migrations WHERE id = ${SEED_MIGRATION_ID}`);
  });
}
