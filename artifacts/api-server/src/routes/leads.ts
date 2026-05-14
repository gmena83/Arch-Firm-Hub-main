import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import {
  LEADS,
  PROJECTS,
  scaffoldSynthesizedProjectState,
  computeLeadScore,
  type Lead,
  type LeadProjectType,
  type LeadBudget,
  type LeadTerrain,
  type LeadSource,
  type BookingType,
} from "../data/seed";
import { requireRole } from "../middlewares/require-role";
import { getAsanaConfig, isAsanaEnabled } from "../lib/integrations-config";
import { createTask } from "../lib/asana-client";
import { logger } from "../lib/logger";
import { nextId } from "../lib/id";
import { USERS } from "../data/seed";
import { seedCalculatorWithMasterMaterials } from "../lib/master-materials-seed";
import {
  persistLeadsToDb,
  persistProjectsToDb,
  persistPreDesignChecklistForProject,
  persistInspectionsForProject,
  persistChangeOrdersForProject,
  persistActivitiesForProject,
} from "../lib/lifecycle-persistence";

type ProjectRecord = (typeof PROJECTS)[number];

const router: IRouter = Router();

router.get("/leads", requireRole("admin", "architect", "superadmin"), async (_req, res) => {
  // Sort newest first when equal score
  const sorted = [...LEADS].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.localeCompare(a.createdAt);
  });
  res.json(sorted);
});

const VALID_SOURCES: LeadSource[] = ["website", "social", "referral", "media", "events"];
const VALID_TYPES: LeadProjectType[] = ["residencial", "comercial", "mixto", "contenedor"];
const VALID_BUDGETS: LeadBudget[] = ["under_150k", "150k_300k", "300k_500k", "500k_1m", "over_1m"];
const VALID_TERRAINS: LeadTerrain[] = ["no_terrain", "with_terrain", "with_plans"];
const VALID_BOOKING_TYPES: BookingType[] = ["consultation_30min", "weekly_seminar"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// C-1: rate-limit the public lead-intake endpoint. The handler triggers an
// internal team notification + an Asana task creation per submission, both of
// which cost real money or real attention. Without a limit this is a free
// DoS / spam vector keyed on a public URL. 5 requests / 15 minutes / IP is
// generous for legitimate use (typical intake form takes 2-3 minutes to fill
// out) and aggressive enough to make automated abuse uneconomic. Test env
// disables the limit so e2e tests don't trip it.
const leadIntakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env["NODE_ENV"] === "test",
  message: {
    error: "rate_limited",
    message: "Too many submissions from this address. Please try again in 15 minutes.",
    messageEs: "Demasiados envíos desde esta dirección. Intente nuevamente en 15 minutos.",
  },
});

router.post("/leads", leadIntakeLimiter, async (req, res) => {
  // C-1: honeypot. Bots fill every form field they find; humans never see
  // this one because it's `hidden` in the UI. If the field arrives populated,
  // drop the request silently — return 201 with a fake lead id so the bot
  // believes it succeeded and doesn't try a different vector.
  const honeypot = (req.body && typeof req.body === "object")
    ? (req.body as Record<string, unknown>)["company_url"]
    : undefined;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    logger.warn({ ip: req.ip, honeypot: String(honeypot).slice(0, 100) }, "lead intake honeypot tripped");
    res.status(201).json({ id: nextId("lead-dropped"), status: "new" });
    return;
  }
  const body = req.body as {
    source: LeadSource;
    projectType: LeadProjectType;
    location: string;
    budgetRange: LeadBudget;
    terrainStatus: LeadTerrain;
    contactName: string;
    email: string;
    phone: string;
    notes?: string;
    booking?: { type: BookingType; slot: string; label: string };
  };

  if (
    !body.source || !body.projectType || !body.location ||
    !body.budgetRange || !body.terrainStatus ||
    !body.contactName || !body.email || !body.phone
  ) {
    res.status(400).json({ error: "bad_request", message: "Missing required fields" });
    return;
  }
  if (!VALID_SOURCES.includes(body.source)) {
    res.status(400).json({ error: "bad_request", message: "Invalid source" });
    return;
  }
  if (!VALID_TYPES.includes(body.projectType)) {
    res.status(400).json({ error: "bad_request", message: "Invalid projectType" });
    return;
  }
  if (!VALID_BUDGETS.includes(body.budgetRange)) {
    res.status(400).json({ error: "bad_request", message: "Invalid budgetRange" });
    return;
  }
  if (!VALID_TERRAINS.includes(body.terrainStatus)) {
    res.status(400).json({ error: "bad_request", message: "Invalid terrainStatus" });
    return;
  }
  if (!EMAIL_RE.test(body.email) || body.email.length > 200) {
    res.status(400).json({ error: "bad_request", message: "Invalid email" });
    return;
  }
  if (typeof body.contactName !== "string" || body.contactName.length > 200 ||
      typeof body.phone !== "string" || body.phone.length > 50 ||
      typeof body.location !== "string" || body.location.length > 200) {
    res.status(400).json({ error: "bad_request", message: "Field length exceeded" });
    return;
  }
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2000)) {
    res.status(400).json({ error: "bad_request", message: "Invalid notes" });
    return;
  }
  if (body.booking !== undefined) {
    if (!body.booking || !VALID_BOOKING_TYPES.includes(body.booking.type) ||
        typeof body.booking.slot !== "string" || isNaN(Date.parse(body.booking.slot)) ||
        typeof body.booking.label !== "string" || body.booking.label.length > 200) {
      res.status(400).json({ error: "bad_request", message: "Invalid booking" });
      return;
    }
    // L-1: reject bookings in the past. `isNaN` above only validates that
    // the slot is parseable; without this guard a user could book yesterday.
    if (new Date(body.booking.slot).getTime() <= Date.now()) {
      res.status(400).json({
        error: "booking_in_past",
        message: "Booking slot must be in the future.",
        messageEs: "El horario de la cita debe ser en el futuro.",
      });
      return;
    }
  }

  // M-6: reject duplicate submissions from the same email within 24h.
  // The intake form is public; without this guard a stuck "submit" button
  // produces a notification storm + duplicate Asana tasks. After 24h the
  // same email can re-submit (e.g. follow-up months later).
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const duplicate = LEADS.find(
    (l) =>
      l.email.toLowerCase() === body.email.toLowerCase() &&
      new Date(l.createdAt).getTime() > oneDayAgo,
  );
  if (duplicate) {
    res.status(409).json({
      error: "already_submitted_today",
      message: "A lead from this email was already submitted within the last 24 hours.",
      messageEs: "Ya se envió una solicitud desde este correo en las últimas 24 horas.",
    });
    return;
  }

  const id = nextId("lead");
  const score = computeLeadScore({
    projectType: body.projectType,
    budgetRange: body.budgetRange,
    location: body.location,
    terrainStatus: body.terrainStatus,
  });

  const lead: Lead = {
    id,
    source: body.source,
    projectType: body.projectType,
    location: body.location,
    budgetRange: body.budgetRange,
    terrainStatus: body.terrainStatus,
    contactName: body.contactName,
    email: body.email,
    phone: body.phone,
    notes: body.notes,
    createdAt: new Date().toISOString(),
    score,
    status: "new",
    booking: body.booking,
  };

  LEADS.unshift(lead);
  // Task #144 — persist the new lead row before responding 201 so a
  // crash-after-ack cannot lose acknowledged leads.
  try { await persistLeadsToDb(); }
  catch {
    res.status(500).json({ error: "persist_failed", message: "Lead was captured in memory but failed to save. Please retry." });
    return;
  }
  res.status(201).json(lead);
});

// Task #147 — in-memory cache only. The durable lead → project link is
// the `leadId` column on the projects table; this map is just a fast
// lookup populated as accepts happen in the current process. After a
// restart the map is empty, but the accept handler falls back to a
// scan over PROJECTS keyed by `leadId` so idempotency still holds.
const ACCEPTED_LEAD_PROJECTS = new Map<string, string>();

// M-10 — Serialize concurrent accepts on the same lead. Two simultaneous
// `POST /leads/:id/accept` requests would both miss the cache, both
// synthesize a new project, and both win. We pin an in-flight Promise
// here keyed by leadId so the 2nd caller awaits the 1st and ends up
// returning the same synthesized project.
const ACCEPT_IN_FLIGHT = new Map<string, Promise<{ project: ProjectRecord; lead: Lead }>>();

// Test-only: clear the in-process accept cache so a "simulated restart"
// in the persistence tests truly forces the handler down the
// `findProjectForAcceptedLead` cold-path (DB-backed `leadId` scan).
// Production code never calls this.
export function __resetAcceptedLeadProjectsCacheForTest(): void {
  ACCEPTED_LEAD_PROJECTS.clear();
  ACCEPT_IN_FLIGHT.clear();
}

function findProjectForAcceptedLead(leadId: string): ProjectRecord | undefined {
  const cachedId = ACCEPTED_LEAD_PROJECTS.get(leadId);
  if (cachedId) {
    const cached = PROJECTS.find((p) => p.id === cachedId);
    if (cached) return cached;
  }
  // Cache miss (cold start after restart) — scan PROJECTS for the
  // persisted leadId column. Hydrate the cache on hit so subsequent
  // calls in the same process are O(1).
  const found = PROJECTS.find((p) => (p as Record<string, unknown>)["leadId"] === leadId);
  if (found) ACCEPTED_LEAD_PROJECTS.set(leadId, found.id);
  return found;
}

router.post("/leads/:id/accept", requireRole("admin", "architect", "superadmin"), async (req, res) => {
  const lead = LEADS.find((l) => l.id === req.params["id"]);
  if (!lead) {
    res.status(404).json({ error: "not_found", message: "Lead not found" });
    return;
  }

  // M-10 — Concurrent-accept serialization. Two operators clicking Accept on
  // the same lead at once would both pass the `lead.status === "new"` check
  // and both synthesize a project. We pin an in-flight promise for the
  // duration of this handler so the 2nd caller short-circuits to the 1st's
  // result. The pinning happens BEFORE the first await so JS's single-thread
  // semantics guarantee atomicity here.
  const inFlight = ACCEPT_IN_FLIGHT.get(lead.id);
  if (inFlight) {
    try {
      const result = await inFlight;
      res.status(200).json({
        lead: result.lead,
        project: result.project,
        asanaGid: result.lead.asanaGid ?? "",
        asanaMessage: "Lead accept already in flight (returned in-flight result)",
      });
      return;
    } catch {
      ACCEPT_IN_FLIGHT.delete(lead.id);
      // Fall through and try a fresh accept.
    }
  }

  let resolveAccept!: (result: { project: ProjectRecord; lead: Lead }) => void;
  let rejectAccept!: (err: unknown) => void;
  const acceptPromise = new Promise<{ project: ProjectRecord; lead: Lead }>((resolve, reject) => {
    resolveAccept = resolve;
    rejectAccept = reject;
  });
  ACCEPT_IN_FLIGHT.set(lead.id, acceptPromise);
  // Silence the unhandled-rejection warning in case nobody awaits this.
  acceptPromise.catch(() => undefined);

  const acceptBody = (req.body ?? {}) as Record<string, unknown>;

  // Idempotent: if already accepted, look up the original synthesized
  // project. The lookup uses the persisted `leadId` column so it survives
  // a restart — see findProjectForAcceptedLead above.
  if (lead.status === "accepted") {
    const existingProject = findProjectForAcceptedLead(lead.id);
    if (existingProject) {
      resolveAccept({ project: existingProject, lead });
      ACCEPT_IN_FLIGHT.delete(lead.id);
      res.status(200).json({
        lead,
        project: existingProject,
        asanaGid: lead.asanaGid ?? "",
        asanaMessage: `Lead already accepted (ASANA gid: ${lead.asanaGid ?? "n/a"})`,
      });
      return;
    }
    // The lead is marked accepted but the project row is gone (e.g. the
    // operator deleted it manually). Refuse to silently synthesize a
    // duplicate — the team must reset the lead status before re-accepting.
    rejectAccept(new Error("already_accepted_orphan"));
    ACCEPT_IN_FLIGHT.delete(lead.id);
    res.status(409).json({
      error: "already_accepted_orphan",
      message: "This lead is already marked accepted but the original project was not found. Reset the lead before re-accepting.",
      messageEs: "Este lead ya está marcado como aceptado pero no se encontró el proyecto original. Restablezca el lead antes de volver a aceptarlo.",
    });
    return;
  }

  lead.status = "accepted";
  // Task #127 — when the Asana integration is configured, create a real
  // Asana task and stamp the returned gid on both the lead and project.
  // Otherwise fall back to the demo stub so the rest of the flow still works.
  let asanaMessageEn = "";
  let asanaMessageEs = "";
  if (isAsanaEnabled()) {
    const cfg = getAsanaConfig();
    const taskName = `${lead.contactName} — ${lead.projectType} (${lead.location})`;
    const notes = [
      `KONTi lead accepted from ${lead.source}.`,
      `Budget range: ${lead.budgetRange}. Land status: ${lead.terrainStatus}.`,
      `Phone: ${lead.phone} · Email: ${lead.email}`,
      lead.notes ? `Notes: ${lead.notes}` : "",
    ].filter(Boolean).join("\n");
    try {
      const task = await createTask({
        name: taskName,
        notes,
        workspaceGid: cfg.workspaceGid as string,
        boardGid: cfg.boardGid as string,
        ...(cfg.defaultAssigneeGid ? { assigneeGid: cfg.defaultAssigneeGid } : {}),
      });
      lead.asanaGid = task.gid;
      asanaMessageEn = `ASANA task created (gid: ${task.gid})`;
      asanaMessageEs = `Tarea ASANA creada (gid: ${task.gid})`;
    } catch (err) {
      logger.warn({ err: (err as Error).message, leadId: lead.id }, "lead-accept: Asana createTask failed; falling back to stub");
      // C-4: prefixed stub gid is grep-able in logs so operators can tell
      // a fallback from a real Asana id without checking Asana itself.
      lead.asanaGid = `STUB-${nextId("asana")}`;
      asanaMessageEn = `Asana unavailable; using local stub gid ${lead.asanaGid}`;
      asanaMessageEs = `Asana no disponible; usando gid local ${lead.asanaGid}`;
    }
  } else {
    // C-4: stub Asana gid is clearly prefixed so operators can spot it in
    // logs and not mistake it for a real Asana task id.
    lead.asanaGid = `STUB-${nextId("asana")}`;
    asanaMessageEn = `ASANA task created (gid: ${lead.asanaGid})`;
    asanaMessageEs = `Tarea ASANA creada (gid: ${lead.asanaGid})`;
  }

  // H-3: validate clientUserId. The caller is `admin | architect | superadmin`
  // (gated by requireRole above). Allow an explicit `clientUserId` only if it
  // matches an existing user with role === "client"; otherwise fall back to
  // the legacy demo client. Refusing arbitrary strings prevents a malicious
  // admin payload from synthesizing a project owned by an unrelated user.
  const requestedClientUserId = typeof acceptBody["clientUserId"] === "string"
    ? acceptBody["clientUserId"]
    : undefined;
  let resolvedClientUserId = "user-client-1";
  if (requestedClientUserId) {
    const u = USERS.find((x) => x.id === requestedClientUserId);
    if (u && u.role === "client") {
      resolvedClientUserId = u.id;
    } else {
      rejectAccept(new Error("invalid_client_user_id"));
      ACCEPT_IN_FLIGHT.delete(lead.id);
      res.status(400).json({
        error: "invalid_client_user_id",
        message: "clientUserId must refer to an existing user with role 'client'.",
        messageEs: "clientUserId debe corresponder a un usuario existente con el rol 'client'.",
      });
      return;
    }
  }

  // M-5: lead.location can be undefined for legacy/migrated leads.
  // The intake form requires it today, but defensive parsing keeps
  // the accept flow resilient against historical data shape changes.
  const locationStr = typeof lead.location === "string" ? lead.location : "";
  const parsedCity = (locationStr.split(",")[0] ?? "").trim() || locationStr || "—";

  // Synthesize a discovery-phase project (in-memory only)
  const projectId = nextId("proj");
  const newProject: ProjectRecord = {
    id: projectId,
    name: `Discovery — ${lead.contactName}`,
    nameEs: `Descubrimiento — ${lead.contactName}`,
    clientName: lead.contactName,
    location: locationStr,
    city: parsedCity,
    phase: "discovery" as const,
    phaseLabel: "Discovery & Pre-Design",
    phaseLabelEs: "Descubrimiento y Pre-Diseño",
    phaseNumber: 1,
    progressPercent: 5,
    budgetAllocated: 0,
    budgetUsed: 0,
    startDate: new Date().toISOString().slice(0, 10),
    estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    description: lead.notes ?? `New ${lead.projectType} project from ${lead.source} lead.`,
    coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop",
    asanaGid: lead.asanaGid,
    gammaReportUrl: `/projects/${projectId}/report`,
    teamMembers: ["Carla Gautier"],
    status: "active" as const,
    clientUserId: resolvedClientUserId,
    clientPhone: "",
    clientPostalAddress: "",
    clientPhysicalAddress: "",
    currentStatusNote: "",
    currentStatusNoteEs: "",
    // B-05: project metadata defaults — team can refine on Project Detail.
    squareMeters: 0,
    bathrooms: 0,
    kitchens: 0,
    projectType: lead.projectType,
    contingencyPercent: 8,
  };
  // Task #147 — stamp the durable lead → project link so the projects
  // row carries it through `persistProjectsToDb()` below. After a
  // restart, `findProjectForAcceptedLead()` rebuilds the in-memory map
  // from this column.
  (newProject as Record<string, unknown>)["leadId"] = lead.id;
  // P1.3 / P1.9 / P6.4 — stamp the new project-metadata defaults the
  // calculator needs. Container count is 1 until the team edits it on
  // the calculator's Estimate tab; risk defaults to "Making a Movie"
  // per Jorge's xlsx; cost list defaults to "urban".
  (newProject as Record<string, unknown>)["containerCount"] = 1;
  (newProject as Record<string, unknown>)["riskClassification"] = "making_a_movie";
  (newProject as Record<string, unknown>)["marginPercent"] = 20;
  (newProject as Record<string, unknown>)["costListVariant"] = "urban";
  PROJECTS.push(newProject);
  ACCEPTED_LEAD_PROJECTS.set(lead.id, projectId);
  // Scaffold full per-project state so the new project can be driven through
  // the entire lifecycle (pre-design checklist, design stepper, signatures,
  // permit items, calculator/cost-plus/inspections/milestones).
  scaffoldSynthesizedProjectState(projectId);

  // P1.2 — Default-load the canonical master materials list into this
  // project's calculator. Per the 2026-05-11 meeting, every new project
  // starts with KONTi's full materials inventory pre-populated; the team
  // deletes or zeros out non-applicable items rather than building from
  // scratch. `seedCalculatorWithMasterMaterials` awaits its own persist,
  // so a 200 OK from this endpoint guarantees the calculator rows are
  // durably committed alongside the project row.
  try {
    await seedCalculatorWithMasterMaterials(projectId, 1);
  } catch (err) {
    logger.error({ err, projectId }, "lead-accept: master materials seed failed");
    rejectAccept(err);
    ACCEPT_IN_FLIGHT.delete(lead.id);
    res.status(500).json({
      error: "persist_failed",
      message: "Project was created but materials seed failed. Please retry or contact support.",
      messageEs: "El proyecto se creó pero la carga de materiales falló. Reintente o contacte soporte.",
    });
    return;
  }

  // Task #144 + H-4 — persist BOTH the updated lead (status flip + asanaGid)
  // AND the synthesized project (plus every lifecycle-backed store the
  // scaffold writes into) before we ack 200 so a crash cannot lose any side
  // of the acceptance. H-4 note: a true Drizzle transaction would be ideal
  // here, but the current `persist*` helpers each open their own connection.
  // For V1 we use Promise.all + a uniform 500 on any failure, which matches
  // the documented retry contract. A real transaction wrap is queued for
  // Session 3 when the zod-validation refactor lands.
  try {
    await Promise.all([
      persistProjectsToDb(),
      persistLeadsToDb(),
      persistPreDesignChecklistForProject(projectId),
      persistInspectionsForProject(projectId),
      persistChangeOrdersForProject(projectId),
      persistActivitiesForProject(projectId),
    ]);
  } catch (err) {
    rejectAccept(err);
    ACCEPT_IN_FLIGHT.delete(lead.id);
    res.status(500).json({ error: "persist_failed", message: "Lead acceptance was applied in memory but failed to save. Please retry." });
    return;
  }

  // M-10 — Resolve the in-flight promise so any concurrent caller waiting
  // on this lead sees the successful result. Clean up the map so the next
  // accept on the same lead doesn't hit a stale resolved promise.
  resolveAccept({ project: newProject, lead });
  ACCEPT_IN_FLIGHT.delete(lead.id);

  res.json({
    lead,
    project: newProject,
    asanaGid: lead.asanaGid,
    asanaMessage: asanaMessageEn,
    asanaMessageEs,
  });
});

export default router;
