import { Router, type IRouter } from "express";
import {
  PROJECTS,
  USERS,
  pendingSignatureRequests,
  pendingSignatureKey,
  PROJECT_TASKS,
  WEATHER_DATA,
  DOCUMENTS,
  CALCULATOR_ENTRIES,
  MATERIALS,
  PRE_DESIGN_CHECKLISTS,
  PROJECT_ACTIVITIES,
  PROJECT_STRUCTURED_VARS,
  PROJECT_ASSISTED_BUDGETS,
  WEEKLY_REPORTS,
  PHASE_ORDER,
  appendActivity,
  computeAssistedBudget,
  PROJECT_DESIGN_STATE,
  DESIGN_SUB_PHASE_ORDER,
  DESIGN_SUB_PHASE_LABELS,
  PROJECT_PROPOSALS,
  PROJECT_CHANGE_ORDERS,
  PROJECT_PERMIT_AUTHORIZATIONS,
  PROJECT_REQUIRED_SIGNATURES,
  PROJECT_PERMIT_ITEMS,
  PERMIT_ITEM_STATE_ORDER,
  PROJECT_COST_PLUS,
  PROJECT_INVOICES,
  PROJECT_CONTRACTOR_MONITORING,
  PROJECT_INSPECTIONS,
  STRUCTURAL_ENGINEERS,
  PROJECT_MILESTONES,
  type Inspection,
  type InspectionType,
  type InspectionStatus,
  type Milestone,
  type MilestoneStatus,
  type ChecklistStatus,
  type DesignSubPhase,
  type DesignDeliverableStatus,
  type ChangeOrder,
  type PermitItemState,
  PROJECT_PUNCHLIST,
  punchlistKey,
  getPunchlistForPhase,
  countOpenPunchlistItems,
  PUNCHLIST_STATUSES,
  type PunchlistItem,
  type PunchlistItemStatus,
} from "../data/seed";
import {
  appendActivityAndPersist,
  persistProjectsToDb,
  persistProjectTasksForProject,
  persistInspectionsForProject,
  persistChangeOrdersForProject,
  persistStructuredVarsForProject,
  persistAssistedBudgetForProject,
  persistCsvMappingForProject,
  persistPreDesignChecklistForProject,
  persistDocumentsForProject,
} from "../lib/lifecycle-persistence";
import { savePunchlist } from "../data/punchlist-store";
import { requireRole } from "../middlewares/require-role";
import { getManagedSecret } from "../lib/managed-secrets";
import { EXTRA_MATERIALS, PROJECT_REPORT_TEMPLATE, PROJECT_CONTRACTOR_ESTIMATE, type ContractorEstimateLine, type ReportTemplate } from "./estimating";
import {
  ensureCalculatorHydrated,
  __resetCalculatorHydrationForTest,
  persistCalculatorEntriesForProject,
  flushCalculatorPersistence,
} from "../lib/calculator-persistence";
import { logger } from "../lib/logger";
import { sendTransactional, type Lang as MailerLang } from "../lib/mailer";

// ---------------------------------------------------------------------------
// Mailer helpers (Task #102)
// ---------------------------------------------------------------------------

const SUPERADMIN_NOTIFY_EMAILS = USERS.filter((u) => u.role === "superadmin").map((u) => u.email);

function projectClient(projectId: string): { email: string; name: string; lang: MailerLang } | null {
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;
  const user = USERS.find((u) => u.id === project.clientUserId);
  if (!user) return null;
  return { email: user.email, name: user.name, lang: "en" };
}

function teamRecipients(projectId: string): string[] {
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return [];
  const teamEmails = USERS.filter(
    (u) => (u.role === "admin" || u.role === "architect") && project.teamMembers.includes(u.name),
  ).map((u) => u.email);
  // Always include the studio admin so a missed name match can't drop the message.
  const fallback = USERS.find((u) => u.role === "admin")?.email;
  if (fallback && !teamEmails.includes(fallback)) teamEmails.push(fallback);
  return teamEmails;
}

function projectAbsoluteUrl(projectId: string): string {
  const base =
    process.env["DASHBOARD_BASE_URL"] ||
    (process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : "https://app.konti.com");
  return `${base}/konti-dashboard/projects/${projectId}`;
}

function signatureSignUrl(projectId: string, signatureId: string): string {
  return `${projectAbsoluteUrl(projectId)}#sig-${signatureId}`;
}

/**
 * Wraps a mailer send so the calling route never throws on a delivery failure.
 * Records `email_sent` on success and `email_failed` on failure (both via the
 * activity feed → audit log → Asana hook). The originating mutation has
 * already been persisted before this is invoked, so a mailer outage cannot
 * roll back business state.
 *
 * Returns `{ ok, reason? }` so the route can surface a non-blocking
 * `emailWarning` to the client UI.
 */
async function sendAndRecord(
  projectId: string,
  args: Parameters<typeof sendTransactional>[0],
  description: { en: string; es: string },
  actor = "System",
): Promise<{ ok: boolean; reason?: string }> {
  const result = await sendTransactional(args);
  if (result.ok) {
    await appendActivityAndPersist(projectId, {
      type: "email_sent",
      actor,
      description: description.en,
      descriptionEs: description.es,
    });
    return { ok: true };
  }
  await appendActivityAndPersist(projectId, {
    type: "email_failed",
    actor,
    description: `${description.en} — delivery failed (${result.reason ?? "unknown"})`,
    descriptionEs: `${description.es} — fallo en la entrega (${result.reason ?? "desconocido"})`,
  });
  const reason = result.reason ?? "unknown";
  return { ok: false, reason };
}

// Re-exports kept for backward compatibility — calculator-persistence
// helpers used to live in this file before being extracted to
// `lib/calculator-persistence.ts` to break a circular import with
// `routes/estimating.ts`. Existing callers (tests, index.ts) keep
// working through these re-exports.
export {
  ensureCalculatorHydrated,
  __resetCalculatorHydrationForTest,
  persistCalculatorEntriesForProject,
  flushCalculatorPersistence,
};
import { getAsanaConfig, isAsanaEnabled, isDriveEnabled } from "../lib/integrations-config";
import { listTasksForProject, AsanaNotConnectedError, AsanaApiError } from "../lib/asana-client";
import {
  uploadDocumentToDrive,
  deleteDocumentFromDrive,
  applyVisibilityToDrive,
} from "../lib/drive-sync";
import { enrichProjectForRole, type PhotoDoc } from "../lib/dynamic-cover";

const router: IRouter = Router();

// Phase labels for UI sync — mirrors PHASE_LABELS_MAP in seed.ts
import { PHASE_LABELS_MAP } from "../data/seed";
import { rollupRecordByBucket } from "@workspace/report-categories";
const PHASE_LABELS = PHASE_LABELS_MAP;

const VALID_CHECKLIST_STATUS: ChecklistStatus[] = ["pending", "in_progress", "done"];
const VALID_PROJECT_TYPES = ["residencial", "comercial", "mixto", "contenedor"] as const;
const VALID_ZONING = /^[A-Z]{1,3}-[0-9]{1,2}$/;

// Shared ownership gate. Implementation lives in
// middlewares/client-ownership.ts so estimating.ts can reuse it without
// creating a circular import with this routes file. Re-exported here so
// callers that previously imported from this module keep working.
import { enforceClientOwnership } from "../middlewares/client-ownership";
import { reapplyContainerCount } from "../lib/master-materials-seed";
import { enqueueTranscription } from "../lib/transcribe";
export { enforceClientOwnership };

// HTML escaping for any value that ends up inside the PDF report template
// to keep saved template strings (header/footer/columns) and project fields
// from breaking the markup or injecting tags.
function escapeHtml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render a cost-report table for the PDF using the template's column list
// against the saved contractor estimate (if any). Unknown column names render
// as empty cells so KONTi can use any header text without crashing the export.
function renderTemplateCostReport(
  template: ReportTemplate,
  estimate: { lines: ContractorEstimateLine[]; grandTotal: number } | undefined,
): string {
  if (!estimate || template.columns.length === 0) return "";
  const lookups: Record<string, (l: ContractorEstimateLine) => string> = {
    category: (l) => l.category,
    item: (l) => l.description,
    description: (l) => l.description,
    qty: (l) => String(l.quantity),
    quantity: (l) => String(l.quantity),
    unit: (l) => l.unit,
    "unit price": (l) => `$${l.unitPrice.toFixed(2)}`,
    price: (l) => `$${l.unitPrice.toFixed(2)}`,
    total: (l) => `$${l.lineTotal.toFixed(2)}`,
    "line total": (l) => `$${l.lineTotal.toFixed(2)}`,
  };
  const headerCells = template.columns
    .map((c) => `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">${escapeHtml(c)}</th>`)
    .join("");
  const bodyRows = estimate.lines
    .map((line) => {
      const cells = template.columns
        .map((col) => {
          const fn = lookups[col.toLowerCase()];
          return `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(fn ? fn(line) : "")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const grandTotalRow =
    `<tr><td colspan="${template.columns.length}" style="padding:6px 8px;text-align:right;font-weight:600;border-top:1px solid #999;">` +
    `Grand Total: $${estimate.grandTotal.toFixed(2)}</td></tr>`;
  return (
    `<h2>${escapeHtml(template.name)}</h2>` +
    `<table><thead><tr>${headerCells}</tr></thead>` +
    `<tbody>${bodyRows || `<tr><td colspan="${template.columns.length}" style="padding:8px;color:#888;">No estimate lines.</td></tr>`}${bodyRows ? grandTotalRow : ""}</tbody></table>`
  );
}

// Local helper retained for the PDF route at the bottom of this file.
function clientCanAccessProject(userId: string, projectId: string): boolean {
  const project = PROJECTS.find((p) => p.id === projectId) as { clientUserId?: string } | undefined;
  if (!project || !project.clientUserId) return false;
  return project.clientUserId === userId;
}

// Helper: derive the role-appropriate cover image (Task #134). KONTi roles
// see the most recent `construction_progress` photo for the project; client
// role sees a mockup snapped to the nearest 25 % milestone. The branch is
// enforced server-side via `enrichProjectForRole` so the wrong field is
// omitted from the payload entirely.
function withDynamicCover(project: typeof PROJECTS[number], role: string | undefined) {
  const docs = ((DOCUMENTS as Record<string, unknown[]>)[project.id] ?? []) as PhotoDoc[];
  return enrichProjectForRole(project, role, docs);
}

router.get("/projects", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const user = (req as { user?: { id: string; role: string } }).user;
  const visible = user?.role === "client"
    ? PROJECTS.filter((p) => (p as { clientUserId?: string }).clientUserId === user.id)
    : PROJECTS;
  return res.json(visible.map((p) => withDynamicCover(p, user?.role)));
});

router.post("/projects", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof body["name"] === "string" ? body["name"].trim() : "";
  const clientName = typeof body["clientName"] === "string" ? body["clientName"].trim() : "";
  const location = typeof body["location"] === "string" ? body["location"].trim() : "";
  const description = typeof body["description"] === "string" ? body["description"].trim() : "";
  const budgetAllocatedRaw = body["budgetAllocated"];
  const budgetAllocated = typeof budgetAllocatedRaw === "number" ? budgetAllocatedRaw : 0;
  const clientUserIdRaw = body["clientUserId"];
  const clientUserId = typeof clientUserIdRaw === "string" && clientUserIdRaw.length > 0 ? clientUserIdRaw : undefined;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors["name"] = "required";
  if (!clientName) fieldErrors["clientName"] = "required";
  if (!location) fieldErrors["location"] = "required";
  if (typeof budgetAllocatedRaw !== "number" || !isFinite(budgetAllocated) || budgetAllocated < 0) {
    fieldErrors["budgetAllocated"] = "must be a non-negative number";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      error: "invalid_payload",
      message: "Missing or invalid fields",
      messageEs: "Faltan campos requeridos o son inválidos",
      fields: fieldErrors,
    });
  }

  // Default new projects to "discovery" phase, mirroring the lead → project synthesis path.
  const phase = "discovery" as const;
  const labels = PHASE_LABELS[phase];
  const projectId = `proj-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const oneYearOut = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const newProject = {
    id: projectId,
    name,
    nameEs: name,
    clientName,
    location,
    city: location.split(",")[0]?.trim() ?? location,
    phase,
    phaseLabel: labels.en,
    phaseLabelEs: labels.es,
    phaseNumber: 1,
    progressPercent: 0,
    budgetAllocated,
    budgetUsed: 0,
    startDate: today,
    estimatedEndDate: oneYearOut,
    description: description || `New project for ${clientName}.`,
    coverImage: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop",
    asanaGid: `auto-${Date.now()}`,
    gammaReportUrl: `/projects/${projectId}/report`,
    teamMembers: [(req as { user?: { name?: string } }).user?.name ?? "Team"],
    status: "active" as const,
    ...(clientUserId ? { clientUserId } : {}),
    // B-05: project metadata defaults — team can refine on Project Detail.
    squareMeters: 0,
    bathrooms: 0,
    kitchens: 0,
    projectType: "residencial" as "residencial" | "comercial" | "mixto" | "contenedor",
    contingencyPercent: 8,
  };

  (PROJECTS as Array<typeof newProject>).push(newProject);
  // Durability: persist the new project row before recording the activity
  // (which itself awaits its own persist) and before responding 201.
  await persistProjectsToDb();

  await appendActivityAndPersist(projectId, {
    type: "phase_change",
    actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
    description: `Project "${name}" created in Discovery phase`,
    descriptionEs: `Proyecto "${name}" creado en fase Descubrimiento`,
  });

  return res.status(201).json(newProject);
});

router.get("/projects/:projectId", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["projectId"]);
  if (!project) {
    res.status(404).json({ error: "not_found", message: "Project not found" });
    return;
  }
  if (!enforceClientOwnership(req, res, req.params["projectId"] as string)) return;
  const role = (req as { user?: { role?: string } }).user?.role;
  return res.json(withDynamicCover(project, role));
});

router.get("/projects/:projectId/tasks", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  if (!enforceClientOwnership(req, res, req.params["projectId"] as string)) return;
  const tasks = PROJECT_TASKS[req.params["projectId"] as keyof typeof PROJECT_TASKS] ?? [];
  return res.json(tasks);
});

router.get("/projects/:projectId/weather", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  // C-5: weather endpoint was the last ungated public read on /projects.
  // The other three reads (`/projects`, `/projects/:projectId`, `/projects/:projectId/tasks`)
  // already enforce role + ownership. Match the same gate here so clients
  // can only see weather for projects they own.
  const projectId = req.params["projectId"] as string;
  if (!enforceClientOwnership(req, res, projectId)) return;
  const weather = WEATHER_DATA[projectId as keyof typeof WEATHER_DATA];
  if (!weather) {
    res.status(404).json({ error: "not_found", message: "Weather data not found for project" });
    return;
  }
  return res.json({ ...weather, lastUpdated: new Date().toISOString() });
});

// Records document metadata for an upload. When Drive is connected and the
// caller supplies `fileBase64`, the bytes are streamed to the project's Drive
// sub-folder and only the Drive ID + viewer link are stored on the document
// record (no in-memory binary). Falls back to metadata-only when Drive is off
// or no payload was supplied so the demo stays usable disconnected.
router.post("/projects/:projectId/documents", requireRole(["team", "admin", "superadmin", "client"]), async (req, res) => {
  const projectId = req.params["projectId"] as string;
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "not_found", message: "Project not found" });
  }
  // Clients may only upload to projects they own.
  if (!enforceClientOwnership(req, res, projectId)) return;
  const role = (req as { user?: { role?: string } }).user?.role;
  const isClient = role === "client";
  const body = (req.body ?? {}) as {
    name?: string; type?: string; category?: string; isClientVisible?: boolean;
    fileSize?: string; description?: string; mimeType?: string;
    photoCategory?: string; caption?: string; imageUrl?: string;
    /** Optional base64 payload (raw or data: URL) — when present and Drive is
     *  enabled, the bytes are streamed to Drive instead of held in memory. */
    fileBase64?: string;
    // P2.4 — photo upload toggle for the punchlist evidence gallery.
    goesToPunchlist?: boolean;
    // P3.3 — Whisper language hint for audio uploads ("en" | "es" | undefined).
    transcriptLanguage?: string;
    // P2.5 — text note body (when type === "note"; the file payload is null).
    noteText?: string;
  };
  if (typeof body.name !== "string" || body.name.length === 0 || body.name.length > 200) {
    return res.status(400).json({ error: "bad_request", message: "name required" });
  }
  const ALLOWED_CATEGORIES = [
    "client_review", "internal", "permits", "construction", "design",
    "contratos", "acuerdos_compra", "otros",
  ] as const;
  // Clients are locked to "client_review" + always client-visible.
  if (isClient) {
    body.category = "client_review";
    body.isClientVisible = true;
  }
  if (
    typeof body.category !== "string" ||
    !(ALLOWED_CATEGORIES as readonly string[]).includes(body.category)
  ) {
    return res.status(400).json({ error: "bad_request", message: "category required" });
  }
  // Normalize `type` to the Document.type enum (jpg/png → photo).
  // P2.5 — extended to include audio / video / note so the site-visit
  // capture pad can land all 4 item types through the same endpoint.
  const ALLOWED_TYPES = ["pdf", "excel", "pptx", "photo", "audio", "video", "note", "other"] as const;
  const ext = (body.name.split(".").pop() ?? "").toLowerCase();
  const inferTypeFromExt = (e: string): typeof ALLOWED_TYPES[number] => {
    if (e === "pdf") return "pdf";
    if (e === "xls" || e === "xlsx") return "excel";
    if (e === "ppt" || e === "pptx") return "pptx";
    if (e === "jpg" || e === "jpeg" || e === "png" || e === "gif" || e === "webp" || e === "heic") return "photo";
    // P2.5: common audio + video extensions.
    if (e === "mp3" || e === "wav" || e === "webm" || e === "m4a" || e === "ogg" || e === "flac") return "audio";
    if (e === "mp4" || e === "mov" || e === "avi" || e === "mkv") return "video";
    return "other";
  };
  const requestedType = typeof body.type === "string" ? body.type.toLowerCase() : "";
  const normalizedType: typeof ALLOWED_TYPES[number] =
    (ALLOWED_TYPES as readonly string[]).includes(requestedType)
      ? (requestedType as typeof ALLOWED_TYPES[number])
      : inferTypeFromExt(ext);
  // P2.5 — text notes require body.noteText (no file payload). Reject any
  // attempt to upload a binary as a note OR to omit the text for a note.
  let noteText: string | undefined;
  if (normalizedType === "note") {
    if (typeof body.noteText !== "string" || body.noteText.trim().length === 0) {
      return res.status(400).json({ error: "bad_request", message: "noteText is required for type=note" });
    }
    noteText = body.noteText.slice(0, 5000);
  }
  // Photo-only fields (#105): require a photoCategory for image uploads so the
  // gallery has a stable bucket to file the photo under. caption/imageUrl are
  // both optional with a soft 500-char cap on caption to mirror the OpenAPI
  // contract and keep storage tidy.
  const PHOTO_CATEGORIES = [
    "site_conditions", "construction_progress", "punchlist_evidence", "final",
  ] as const;
  let photoCategory: typeof PHOTO_CATEGORIES[number] | undefined;
  if (normalizedType === "photo") {
    if (typeof body.photoCategory !== "string" || !(PHOTO_CATEGORIES as readonly string[]).includes(body.photoCategory)) {
      return res.status(400).json({ error: "bad_request", message: "photoCategory required for photo uploads" });
    }
    photoCategory = body.photoCategory as typeof PHOTO_CATEGORIES[number];
  }
  const caption = typeof body.caption === "string" ? body.caption.slice(0, 500) : undefined;
  // Restrict imageUrl to schemes the gallery actually renders (data: URLs from
  // the client uploader, or http(s) seed URLs). This prevents a malformed
  // payload from landing on the client as a broken <img src> or a javascript:
  // URL on a stricter renderer.
  let imageUrl: string | undefined;
  if (typeof body.imageUrl === "string" && body.imageUrl.length > 0) {
    if (/^data:image\//i.test(body.imageUrl) || /^https?:\/\//i.test(body.imageUrl)) {
      imageUrl = body.imageUrl;
    } else {
      return res.status(400).json({ error: "bad_request", message: "imageUrl must be a data:image/* or http(s) URL" });
    }
  }

  const list = (DOCUMENTS as Record<string, unknown[]>)[projectId] ?? [];
  const documentId = `doc-${projectId}-${list.length + 1}-${Date.now()}`;
  const isClientVisible = body.isClientVisible ?? true;

  // Drive upload (Task #128). Triggered when (a) the integration is on and
  // (b) we actually have bytes — either the caller's explicit fileBase64
  // field or the photo dropzone's data:URL imageUrl. Decoded once so the
  // body fragment we ship to Drive matches what the dashboard would render.
  const inboundBase64 =
    typeof body.fileBase64 === "string" && body.fileBase64.length > 0
      ? body.fileBase64
      : (imageUrl && /^data:[^;]+;base64,/.test(imageUrl) ? imageUrl : "");
  let driveFileId: string | undefined;
  let driveFolderId: string | undefined;
  let driveWebViewLink: string | undefined;
  let driveWebContentLink: string | undefined;
  let driveThumbnailLink: string | undefined;
  let storedImageUrl = imageUrl;
  if (isDriveEnabled() && inboundBase64) {
    // Strip the optional data:URL prefix to recover the raw base64 payload.
    const m = inboundBase64.match(/^data:([^;]+);base64,(.+)$/);
    const inferredMime = m ? m[1] : (body.mimeType || "application/octet-stream");
    const rawBase64 = m ? (m[2] ?? "") : inboundBase64;
    let buf: Buffer;
    try {
      buf = Buffer.from(rawBase64, "base64");
    } catch {
      return res.status(400).json({ error: "bad_request", message: "fileBase64 is not valid base64" });
    }
    if (buf.length === 0) {
      return res.status(400).json({ error: "bad_request", message: "fileBase64 decoded to empty payload" });
    }
    // Photos always live in the canonical `Site Photos` Drive folder (Task
     // #128 storage contract), regardless of which dashboard `category` the
     // upload was filed under. For non-photo documents the dashboard category
     // is preserved so admins can still slice by Permits / Contracts / etc.
    const driveCategory = normalizedType === "photo" ? "site_photos" : body.category;
    try {
      const result = await uploadDocumentToDrive({
        projectId,
        projectName: project.name,
        documentId,
        documentName: body.name,
        category: driveCategory,
        mimeType: inferredMime ?? "application/octet-stream",
        data: buf,
        isClientVisible,
      });
      driveFileId = result.driveFileId;
      driveFolderId = result.driveFolderId;
      driveWebViewLink = result.driveWebViewLink ?? undefined;
      driveWebContentLink = result.driveWebContentLink ?? undefined;
      driveThumbnailLink = result.driveThumbnailLink ?? undefined;
      // Once the file is in Drive we don't need the inline base64 — the
      // gallery prefers the Drive thumbnailLink and the lightbox uses the
      // webContentLink. Strip the heavy data:URL to keep the API response
      // (and persisted memory) small.
      if (storedImageUrl && /^data:/.test(storedImageUrl)) storedImageUrl = undefined;
    } catch (err) {
      // Hard failure on the Drive upload: do NOT half-record metadata. The
      // task acceptance criteria is "either the file is in Drive and metadata
      // is saved, or neither" — we surface a 502 and let the client retry.
      const status = err instanceof Error && (err as { status?: number }).status === 404 ? 404 : 502;
      return res.status(status).json({
        error: "drive_upload_failed",
        message: (err as Error).message ?? "Drive upload failed",
      });
    }
  }

  // Surface a proxied download URL (Task #128 step 6) so the dashboard
  // never needs to hand the browser a raw Drive `webContentLink`. The proxy
  // re-checks role + visibility on every request, which means revoking
  // client visibility instantly cuts off file access without waiting for
  // Drive's permission cache to roll over.
  const driveDownloadProxyUrl = driveFileId
    ? `/api/integrations/drive/files/${driveFileId}/download`
    : undefined;
  const doc: Record<string, unknown> = {
    id: documentId,
    projectId,
    name: body.name,
    type: normalizedType,
    category: body.category,
    isClientVisible,
    uploadedBy: (req as { user?: { id?: string } }).user?.id ?? "system",
    uploadedAt: new Date().toISOString(),
    fileSize: body.fileSize ?? "0 KB",
    mimeType: body.mimeType ?? "",
    description: body.description ?? "",
    ...(photoCategory ? { photoCategory } : {}),
    ...(caption ? { caption } : {}),
    ...(storedImageUrl ? { imageUrl: storedImageUrl } : {}),
    ...(driveFileId ? { driveFileId } : {}),
    ...(driveFolderId ? { driveFolderId } : {}),
    ...(driveWebViewLink ? { driveWebViewLink } : {}),
    ...(driveWebContentLink ? { driveWebContentLink } : {}),
    ...(driveThumbnailLink ? { driveThumbnailLink } : {}),
    ...(driveDownloadProxyUrl ? { driveDownloadProxyUrl } : {}),
    // P2.4 — punchlist-evidence toggle. Only meaningful when type === photo.
    ...(body.goesToPunchlist === true ? { goesToPunchlist: true } : {}),
    // P2.5 — inline note payload for type=note.
    ...(noteText ? { noteText } : {}),
    // P3.3 — set transcript status upfront so the UI can show "Transcribing…"
    // before the Whisper job completes. Only set for audio/video uploads.
    ...((normalizedType === "audio" || normalizedType === "video")
      ? { transcriptStatus: "pending" as const }
      : {}),
  };
  (DOCUMENTS as Record<string, unknown[]>)[projectId] = [...list, doc];
  // Persist document metadata to Postgres BEFORE responding so a crash
  // after-ack cannot lose the upload (Task #150 — same durability contract
  // as inspections / change orders). The Drive byte upload above is the
  // canonical store for the file CONTENTS when configured; this row is the
  // canonical store for the metadata either way.
  await persistDocumentsForProject(projectId);
  // Surface upload in the project timeline. Use a dedicated audit type when
  // the uploader is a client so the team's audit log can highlight it.
  const actor = (req as { user?: { name?: string } }).user?.name ?? (isClient ? "Client" : "Team");
  await appendActivityAndPersist(projectId, {
    type: isClient ? "client_upload" : "receipts_upload",
    actor,
    description: `Document "${doc["name"]}" uploaded to ${body.category}`,
    descriptionEs: `Documento "${doc["name"]}" subido a ${body.category}`,
  });
  // P3.3 — enqueue Whisper transcription for audio uploads after the 201
  // response is sent. The job runs via setImmediate so the route never
  // waits on the transcription, and any failure is captured on the
  // document row (transcriptStatus="error") without affecting the upload.
  if (normalizedType === "audio" && inboundBase64) {
    try {
      const m = inboundBase64.match(/^data:([^;]+);base64,(.+)$/);
      const rawBase64 = m ? (m[2] ?? "") : inboundBase64;
      const buf = Buffer.from(rawBase64, "base64");
      const lang = body.transcriptLanguage === "en" || body.transcriptLanguage === "es"
        ? body.transcriptLanguage
        : undefined;
      enqueueTranscription({
        projectId,
        documentId,
        audioBytes: buf,
        fileName: body.name,
        ...(lang ? { language: lang } : {}),
      });
    } catch (err) {
      logger.warn({ err, projectId, documentId }, "transcription enqueue failed (audio decode)");
    }
  }
  return res.status(201).json(doc);
});

// Patch document metadata. The endpoint accepts three independently optional
// fields:
//   - `isClientVisible` (team/admin/superadmin only)
//   - `featuredAsCover`  (team/admin/superadmin only)
//   - `caption`          (team OR the original uploader — Task #158 / A-09 dual gate)
// Clients may PATCH ONLY the caption of a document they themselves uploaded;
// any attempt to set the team-only fields from a client role is rejected
// before any state is mutated.
router.patch(
  "/projects/:projectId/documents/:documentId",
  requireRole(["team", "admin", "superadmin", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const documentId = req.params["documentId"] as string;
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    if (!enforceClientOwnership(req, res, projectId)) return;
    const list = (DOCUMENTS as Record<string, Array<{
      id: string; name: string; type?: string; photoCategory?: string;
      isClientVisible: boolean; featuredAsCover?: boolean; driveFileId?: string;
      uploadedBy?: string; caption?: string;
    }>>)[projectId] ?? [];
    const doc = list.find((d) => d.id === documentId);
    if (!doc) return res.status(404).json({ error: "not_found", message: "Document not found" });
    const body = (req.body ?? {}) as {
      isClientVisible?: boolean;
      featuredAsCover?: boolean;
      caption?: string;
    };
    const wantsVisibility = typeof body.isClientVisible === "boolean";
    const wantsFeatured = typeof body.featuredAsCover === "boolean";
    const wantsCaption = typeof body.caption === "string";
    if (!wantsVisibility && !wantsFeatured && !wantsCaption) {
      return res.status(400).json({
        error: "bad_request",
        message: "isClientVisible, featuredAsCover, and/or caption required",
      });
    }
    const user = (req as { user?: { id?: string; role?: string; name?: string } }).user;
    const isClient = user?.role === "client";
    if (isClient) {
      // Clients can only edit captions, and only on documents they uploaded
      // themselves (mirrors the DELETE rule). Reject team-only fields with
      // 403 BEFORE mutating anything.
      if (wantsVisibility || wantsFeatured) {
        return res.status(403).json({
          error: "forbidden",
          message: "Clients cannot change visibility or cover flags",
        });
      }
      if (doc.uploadedBy !== user?.id) {
        return res.status(403).json({
          error: "forbidden",
          message: "Clients can only edit captions on documents they uploaded themselves",
        });
      }
    }

    // Task #136 — only construction-progress photos can be staff-curated
    // covers. Reject the request explicitly so a buggy client doesn't
    // silently set the flag on a PDF or a punchlist-evidence shot.
    if (wantsFeatured && body.featuredAsCover === true) {
      if (doc.type !== "photo" || doc.photoCategory !== "construction_progress") {
        return res.status(400).json({
          error: "bad_request",
          message: "featuredAsCover may only be set on construction_progress photos",
        });
      }
    }

    let driveWarning: { en: string; es: string } | undefined;

    if (wantsVisibility) {
      const previous = doc.isClientVisible;
      const next = body.isClientVisible as boolean;
      if (previous !== next) {
        doc.isClientVisible = next;
        const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
        const visEn = next ? "visible to client" : "hidden from client";
        const visEs = next ? "visible al cliente" : "oculto al cliente";
        await appendActivityAndPersist(projectId, {
          type: "document_visibility_change",
          actor,
          description: `Document "${doc.name}" marked ${visEn}`,
          descriptionEs: `Documento "${doc.name}" marcado ${visEs}`,
        });
        // Drive sharing propagation (Task #128) — non-blocking per spec step 7.
        // If the Drive call fails the dashboard's own visibility flag still
        // sticks; the user sees a warning and the failure is recorded in the
        // Drive sync log so an admin can resync later.
        if (doc.driveFileId && isDriveEnabled()) {
          const ok = await applyVisibilityToDrive({
            projectId,
            projectName: project.name,
            documentId: doc.id,
            documentName: doc.name,
            driveFileId: doc.driveFileId,
            isClientVisible: next,
          });
          if (!ok) {
            driveWarning = {
              en: "Visibility was updated in the dashboard but the Google Drive sharing change did not go through. Open the Drive integration sync log to retry.",
              es: "La visibilidad se actualizó en el panel pero el cambio de compartido en Google Drive no se aplicó. Abre el registro de sincronización de Drive para reintentar.",
            };
          }
        }
      }
    }

    if (wantsFeatured) {
      const previous = doc.featuredAsCover === true;
      const next = body.featuredAsCover as boolean;
      if (previous !== next) {
        if (next) {
          // Single-cover invariant: flip every other photo in the project off
          // so exactly one document carries the flag at any time.
          for (const other of list) {
            if (other.id !== doc.id && other.featuredAsCover === true) {
              other.featuredAsCover = false;
            }
          }
          doc.featuredAsCover = true;
        } else {
          doc.featuredAsCover = false;
        }
        const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
        const featEn = next ? "set as project cover" : "removed as project cover";
        const featEs = next ? "establecida como portada del proyecto" : "removida como portada del proyecto";
        await appendActivityAndPersist(projectId, {
          type: "document_featured_change",
          actor,
          description: `Photo "${doc.name}" ${featEn}`,
          descriptionEs: `Foto "${doc.name}" ${featEs}`,
        });
      }
    }

    if (wantsCaption) {
      const previous = doc.caption ?? "";
      const next = (body.caption as string).slice(0, 500);
      if (previous !== next) {
        if (next === "") {
          delete (doc as { caption?: string }).caption;
        } else {
          doc.caption = next;
        }
        const actor = user?.name ?? (isClient ? "Client" : "Team");
        await appendActivityAndPersist(projectId, {
          type: "document_visibility_change",
          actor,
          description: `Caption updated on "${doc.name}"`,
          descriptionEs: `Subtítulo actualizado en "${doc.name}"`,
        });
      }
    }

    // Persist (Task #150). Visibility, cover-photo invariant, and caption
    // edits all mutate `list` in place; one save call covers every branch.
    await persistDocumentsForProject(projectId);
    return res.json(driveWarning ? { ...doc, driveWarning } : doc);
  },
);

// Task #158 / A-05 — Append a new version to an existing document. Team-only.
// Auto-increments the version number, refreshes the primary metadata
// (fileSize / uploadedBy / uploadedAt) so the document list shows the latest
// version at a glance, and emits a `document_version_added` activity for the
// project timeline.
router.post(
  "/projects/:projectId/documents/:documentId/versions",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const documentId = req.params["documentId"] as string;
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const list = (DOCUMENTS as Record<string, Array<{
      id: string; name: string; fileSize?: string; uploadedBy?: string; uploadedAt?: string;
      versions?: Array<{ version: number; uploadedBy: string; uploadedAt: string; fileSize: string; notes?: string; notesEs?: string }>;
    }>>)[projectId] ?? [];
    const doc = list.find((d) => d.id === documentId);
    if (!doc) return res.status(404).json({ error: "not_found", message: "Document not found" });
    const body = (req.body ?? {}) as {
      fileSize?: string;
      notes?: string;
      notesEs?: string;
    };
    const user = (req as { user?: { id?: string; name?: string } }).user;
    const versions = Array.isArray(doc.versions) ? doc.versions : [];
    const nextVersionNumber = versions.reduce((max, v) => Math.max(max, v.version ?? 0), 0) + 1;
    const uploadedAt = new Date().toISOString();
    const uploadedBy = user?.name ?? "Team";
    const fileSize = typeof body.fileSize === "string" && body.fileSize.length > 0
      ? body.fileSize
      : (doc.fileSize ?? "0 KB");
    const newEntry: { version: number; uploadedBy: string; uploadedAt: string; fileSize: string; notes?: string; notesEs?: string } = {
      version: nextVersionNumber,
      uploadedBy,
      uploadedAt,
      fileSize,
    };
    if (typeof body.notes === "string" && body.notes.length > 0) newEntry.notes = body.notes.slice(0, 500);
    if (typeof body.notesEs === "string" && body.notesEs.length > 0) newEntry.notesEs = body.notesEs.slice(0, 500);
    doc.versions = [...versions, newEntry];
    // Roll the latest version's size + timestamp forward so list views
    // surface them without a separate fetch. We deliberately DO NOT
    // overwrite `doc.uploadedBy` — that field is the immutable original
    // uploader and is what the A-09 client caption / DELETE dual-gate
    // checks against. The latest version's uploader is preserved on the
    // versions[] entry above.
    doc.fileSize = fileSize;
    doc.uploadedAt = uploadedAt;
    await persistDocumentsForProject(projectId);
    await appendActivityAndPersist(projectId, {
      type: "document_version_added",
      actor: uploadedBy,
      description: `New version v${nextVersionNumber} of "${doc.name}" uploaded`,
      descriptionEs: `Nueva versión v${nextVersionNumber} de "${doc.name}" subida`,
    });
    return res.status(201).json(doc);
  },
);

// Delete a single document. Team/admin/superadmin can remove any document; a
// client may only remove documents they uploaded themselves (matched on
// `uploadedBy === req.user.id`). Returns 204 on success and writes a
// `document_removed` activity entry so the timeline mirrors the upload event.
router.delete(
  "/projects/:projectId/documents/:documentId",
  requireRole(["team", "admin", "superadmin", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const documentId = req.params["documentId"] as string;
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    if (!enforceClientOwnership(req, res, projectId)) return;
    const list = (DOCUMENTS as Record<string, Array<{
      id: string; name: string; category: string; uploadedBy: string; driveFileId?: string;
    }>>)[projectId] ?? [];
    const idx = list.findIndex((d) => d.id === documentId);
    if (idx < 0) {
      return res.status(404).json({ error: "not_found", message: "Document not found" });
    }
    const doc = list[idx]!;
    const user = (req as { user?: { id?: string; role?: string; name?: string } }).user;
    const role = user?.role;
    const isClient = role === "client";
    if (isClient && doc.uploadedBy !== user?.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Clients can only delete documents they uploaded themselves",
      });
    }
    // Drive delete (Task #128) — non-blocking per spec step 5. We always
    // remove the dashboard's own metadata so the user's intent succeeds; if
    // the Drive-side delete fails we add a warning header so the UI can
    // surface the residue, and the failure is recorded in the Drive sync log.
    let driveWarning: { en: string; es: string } | undefined;
    if (doc.driveFileId && isDriveEnabled()) {
      const ok = await deleteDocumentFromDrive({
        projectId,
        projectName: project.name,
        documentId: doc.id,
        documentName: doc.name,
        driveFileId: doc.driveFileId,
      });
      if (!ok) {
        driveWarning = {
          en: "Document removed from the dashboard but the Google Drive copy could not be deleted. Open the Drive integration sync log to retry.",
          es: "El documento se eliminó del panel pero la copia en Google Drive no pudo eliminarse. Abre el registro de sincronización de Drive para reintentar.",
        };
      }
    }
    list.splice(idx, 1);
    (DOCUMENTS as Record<string, unknown[]>)[projectId] = list;
    // Persist deletion (Task #150) — without this the row reappears at
    // boot from hydration of the previous snapshot.
    await persistDocumentsForProject(projectId);
    const actor = user?.name ?? (isClient ? "Client" : "Team");
    await appendActivityAndPersist(projectId, {
      type: "document_removed",
      actor,
      description: `Document "${doc.name}" removed from ${doc.category}`,
      descriptionEs: `Documento "${doc.name}" eliminado de ${doc.category}`,
    });
    // 200 + warning body when Drive lagged so the UI can surface a toast;
    // otherwise the legacy 204 No Content (clients that already handle 204
    // continue to work).
    if (driveWarning) return res.status(200).json({ deleted: true, driveWarning });
    return res.status(204).end();
  },
);

// Documents listing — gated by role + ownership. Clients are server-side
// restricted to docs flagged isClientVisible so internal documents never
// leave the API even if the dashboard's filter is bypassed.
router.get(
  "/projects/:projectId/documents",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    const role = (req as { user?: { role?: string } }).user?.role;
    const clientVisible = req.query["clientVisible"];
    let docs = (DOCUMENTS[projectId as keyof typeof DOCUMENTS] ?? []) as Array<{
      id: string; projectId: string; name: string; type: string; category: string;
      isClientVisible: boolean; uploadedBy: string; uploadedAt: string; fileSize: string; description: string;
    }>;

    if (role === "client") {
      // Hard guarantee: clients never see internal docs from this endpoint.
      docs = docs.filter((d) => d.isClientVisible);
    } else if (clientVisible === "true") {
      docs = docs.filter((d) => d.isClientVisible);
    } else if (clientVisible === "false") {
      docs = docs.filter((d) => !d.isClientVisible);
    }

    // Backfill `driveDownloadProxyUrl` (Task #128 step 6) for any document
    // that has a `driveFileId` but pre-dates the proxy. This keeps the
    // frontend rendering logic uniform across documents uploaded before and
    // after the proxy shipped.
    //
    // For client role we additionally STRIP the raw Drive URLs
    // (`driveWebViewLink`/`driveWebContentLink`/`driveThumbnailLink`) so the
    // browser never sees a link that bypasses the dashboard's proxy. Team /
    // admin / superadmin / architect still see the "Open in Drive" link
    // because it's helpful for their workflow.
    const decorated = docs.map((d) => {
      const record = d as Record<string, unknown>;
      const fileId = record["driveFileId"];
      let next: Record<string, unknown> = { ...record };
      if (typeof fileId === "string" && fileId.length > 0 && !record["driveDownloadProxyUrl"]) {
        next["driveDownloadProxyUrl"] = `/api/integrations/drive/files/${fileId}/download`;
      }
      if (role === "client") {
        delete next["driveWebViewLink"];
        delete next["driveWebContentLink"];
        delete next["driveThumbnailLink"];
      }
      return next;
    });

    return res.json(decorated);
  },
);

router.get("/projects/:projectId/calculations", requireRole(["team", "admin", "superadmin", "architect"]), async (req, res) => {
  const projectId = req.params["projectId"];
  const entries = CALCULATOR_ENTRIES[projectId as keyof typeof CALCULATOR_ENTRIES] ?? [];

  const subtotalByCategory: Record<string, number> = {};
  let grandTotal = 0;

  for (const entry of entries) {
    subtotalByCategory[entry.category] = (subtotalByCategory[entry.category] ?? 0) + entry.lineTotal;
    grandTotal += entry.lineTotal;
  }

  // Roll the trade-level subtotals into the team's five canonical buckets so
  // the project report matches the PROJECT ESTIMATE spreadsheet structure.
  // All five keys are always returned (zero for empty buckets) so the client
  // can render the structure even before any line items are recorded.
  const bucketRollup = rollupRecordByBucket(subtotalByCategory);
  const subtotalByBucket: Record<string, number> = {};
  for (const row of bucketRollup) subtotalByBucket[row.key] = row.total;

  return res.json({
    projectId,
    entries,
    subtotalByCategory,
    subtotalByBucket,
    bucketRollup,
    grandTotal,
  });
});

// Client-safe rollup of the same calculations data. Returns ONLY the five
// canonical buckets (with optional trade-level sub-lines) and the grand
// total — never raw BOM line items, costs per material, or contractor
// margin. This is the read used by the project report so client viewers can
// see the same five-bucket structure the team emails them, without exposing
// internal estimate detail.
router.get(
  "/projects/:projectId/report-rollup",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    const entries = CALCULATOR_ENTRIES[projectId as keyof typeof CALCULATOR_ENTRIES] ?? [];

    const subtotalByCategory: Record<string, number> = {};
    let grandTotal = 0;
    for (const entry of entries) {
      subtotalByCategory[entry.category] = (subtotalByCategory[entry.category] ?? 0) + entry.lineTotal;
      grandTotal += entry.lineTotal;
    }

    const bucketRollup = rollupRecordByBucket(subtotalByCategory);
    const subtotalByBucket: Record<string, number> = {};
    for (const row of bucketRollup) subtotalByBucket[row.key] = row.total;

    return res.json({
      projectId,
      subtotalByBucket,
      bucketRollup,
      grandTotal,
    });
  },
);

// Inline-edit a calculator line (quantity, base price, manual override).
// Recomputes effectivePrice and lineTotal server-side so the report rollup
// always sees consistent values.
router.patch(
  "/projects/:projectId/calculations/:lineId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const lineId = req.params["lineId"] as string;
    const list = CALCULATOR_ENTRIES[projectId as keyof typeof CALCULATOR_ENTRIES] as
      | Array<Record<string, unknown>>
      | undefined;
    if (!list) return res.status(404).json({ error: "project_not_found" });
    const entry = list.find((e) => (e["id"] as string) === lineId);
    if (!entry) return res.status(404).json({ error: "line_not_found" });

    const body = (req.body ?? {}) as {
      quantity?: number | string;
      basePrice?: number | string;
      manualPriceOverride?: number | string | null;
    };

    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    if (body.quantity !== undefined) {
      const q = toNum(body.quantity);
      if (q === null || q < 0) return res.status(400).json({ error: "invalid_quantity" });
      entry["quantity"] = q;
    }
    if (body.basePrice !== undefined) {
      const bp = toNum(body.basePrice);
      if (bp === null || bp < 0) return res.status(400).json({ error: "invalid_base_price" });
      entry["basePrice"] = bp;
    }
    if (body.manualPriceOverride !== undefined) {
      if (body.manualPriceOverride === null || body.manualPriceOverride === "") {
        entry["manualPriceOverride"] = null;
      } else {
        const ov = toNum(body.manualPriceOverride);
        if (ov === null || ov < 0) return res.status(400).json({ error: "invalid_override" });
        entry["manualPriceOverride"] = ov;
      }
    }

    const basePrice = (entry["basePrice"] as number) ?? 0;
    const override = entry["manualPriceOverride"] as number | null;
    const quantity = (entry["quantity"] as number) ?? 0;
    const effective = override !== null && override !== undefined ? override : basePrice;
    entry["effectivePrice"] = effective;
    entry["lineTotal"] = Math.round(effective * quantity * 100) / 100;

    await appendActivityAndPersist(projectId, {
      type: "calculator_line_updated",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Calculator line "${entry["materialName"] ?? lineId}" updated`,
      descriptionEs: `Línea de calculadora "${entry["materialNameEs"] ?? entry["materialName"] ?? lineId}" actualizada`,
    });

    // Task #141 — persist the whole project's entries before responding so
    // a 200 OK guarantees the edit is durably stored. Per-project
    // serialised queue keeps concurrent edits ordered; awaiting it here
    // also surfaces commit failures as 500s instead of silently losing the
    // change after acking.
    try {
      await persistCalculatorEntriesForProject(projectId);
    } catch (err) {
      logger.error({ err, projectId, lineId }, "calculator: PATCH persist failed");
      return res.status(500).json({ error: "persist_failed", message: "Edit was applied in memory but failed to save. Please retry." });
    }

    return res.json({ entry });
  },
);

router.get("/materials", async (req, res) => {
  const category = req.query["category"] as string | undefined;
  const all = [...MATERIALS, ...EXTRA_MATERIALS];
  const materials = category ? all.filter((m) => m.category === category) : all;
  return res.json(materials);
});

let cachedPrices: { prices: Array<{ id: string; item: string; suggestedPrice: number; source: string }>; refreshedAt: string; source: string; cached: boolean } | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

router.post("/materials/prices/refresh", requireRole(["team", "admin", "superadmin", "architect"]), async (req, res) => {
  const perplexityKey = process.env["PERPLEXITY_API_KEY"];
  if (!perplexityKey) {
    res.status(501).json({ error: "perplexity_not_configured", message: "Perplexity API key not configured" });
    return;
  }

  const category = req.query["category"] as string | undefined;

  if (!category && cachedPrices && Date.now() < cacheExpiresAt) {
    res.json({ ...cachedPrices, cached: true });
    return;
  }

  const filteredMaterials = category
    ? MATERIALS.filter((m) => m.category === category)
    : MATERIALS;

  const materialList = filteredMaterials
    .map((m) => `- ${m.id}: ${m.item} (unit: ${m.unit})`)
    .join("\n");

  const prompt = `You are a construction materials pricing assistant for Puerto Rico. Look up current retail prices from Home Depot (USA/Puerto Rico) for each of the following construction materials. Return a JSON array only, no markdown, no explanation.

For each material, return an object with:
- "id": the exact ID provided
- "item": the material name
- "suggestedPrice": a realistic current retail price (number, in USD)
- "source": "Home Depot (estimated)"

Materials to price:
${materialList}

Respond with ONLY a valid JSON array. No code fences. No extra text.`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a construction materials pricing assistant. Always respond with valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "Perplexity API error");
      res.status(502).json({ error: "perplexity_error", message: "Perplexity API request failed" });
      return;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";

    let rawPrices: unknown[] = [];
    try {
      const cleaned = content.replace(/```json|```/g, "").trim();
      rawPrices = JSON.parse(cleaned);
      if (!Array.isArray(rawPrices)) throw new Error("Not an array");
    } catch {
      req.log.error({ content }, "Failed to parse Perplexity response as JSON");
      res.status(502).json({ error: "parse_error", message: "Could not parse pricing data from AI response" });
      return;
    }

    const knownIds = new Set(filteredMaterials.map((m) => m.id));
    const prices: Array<{ id: string; item: string; suggestedPrice: number; source: string }> = [];
    for (const entry of rawPrices) {
      if (
        typeof entry !== "object" || entry === null ||
        typeof (entry as Record<string, unknown>)["id"] !== "string" ||
        typeof (entry as Record<string, unknown>)["item"] !== "string" ||
        typeof (entry as Record<string, unknown>)["suggestedPrice"] !== "number" ||
        !isFinite((entry as Record<string, unknown>)["suggestedPrice"] as number) ||
        (entry as Record<string, unknown>)["suggestedPrice"] as number <= 0 ||
        !knownIds.has((entry as Record<string, unknown>)["id"] as string)
      ) {
        req.log.warn({ entry }, "Skipping invalid price entry from Perplexity");
        continue;
      }
      prices.push({
        id: (entry as Record<string, unknown>)["id"] as string,
        item: (entry as Record<string, unknown>)["item"] as string,
        suggestedPrice: (entry as Record<string, unknown>)["suggestedPrice"] as number,
        source: typeof (entry as Record<string, unknown>)["source"] === "string"
          ? (entry as Record<string, unknown>)["source"] as string
          : "Home Depot (estimated)",
      });
    }

    if (prices.length === 0) {
      req.log.error({ content }, "No valid prices returned from Perplexity");
      res.status(502).json({ error: "parse_error", message: "No valid prices returned from AI" });
      return;
    }

    const result = {
      prices,
      refreshedAt: new Date().toISOString(),
      source: "Home Depot via Perplexity AI (sonar) · Prices sourced from public listings",
      cached: false,
    };

    if (!category) {
      cachedPrices = result;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Perplexity fetch error");
    res.status(502).json({ error: "perplexity_error", message: "Failed to reach Perplexity API" });
  }
});

router.post("/projects/:id/pdf", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) {
    res.status(404).json({ error: "not_found", message: "Project not found" });
    return;
  }

  if (!enforceClientOwnership(req, res, project.id)) return;

  const pdfApiKey = getManagedSecret("PDF_CO_API_KEY");
  if (!pdfApiKey) {
    res.status(501).json({ error: "pdf_not_configured", message: "PDF export not configured" });
    return;
  }

  // Render the status report HTML server-side so the PDF renderer doesn't
  // depend on an authenticated SPA load (the previous URL-based path would
  // have pdf.co fetch the dashboard unauthenticated and rasterize the login
  // screen). HTML contains: project name, phase, location, generated date,
  // status summary, signature block.
  const rawTasks = (PROJECT_TASKS[project.id as keyof typeof PROJECT_TASKS] ?? []) as ReadonlyArray<Record<string, unknown>>;
  const tasks: Array<{ title: string; status: string; phase?: string; assignee?: string }> =
    rawTasks.map((t) => ({
      title: String(t["title"] ?? ""),
      status: String(t["status"] ?? (t["completed"] ? "done" : "open")),
      phase: typeof t["phase"] === "string" ? (t["phase"] as string) : undefined,
      assignee: typeof t["assignee"] === "string" ? (t["assignee"] as string) : undefined,
    }));
  const docs = ((DOCUMENTS as Record<string, unknown[]>)[project.id] ?? []) as Array<{
    name: string; category: string; uploadedAt: string;
  }>;
  const phaseLabel = String(project.phase ?? "discovery").replace(/_/g, " ").toUpperCase();
  // Honor a client-supplied report date (#C-10) when present and shaped as
  // yyyy-mm-dd so the PDF matches what the team configured in the in-app
  // report header. Fall back to "now" in PR time otherwise.
  const requestedDate = (req.body && typeof req.body === "object")
    ? (req.body as Record<string, unknown>)["reportDate"]
    : undefined;
  let generatedAt: string;
  if (typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    // Parse as PR-local midnight so the displayed date matches the picker.
    const d = new Date(`${requestedDate}T12:00:00-04:00`);
    generatedAt = isNaN(d.getTime())
      ? new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" })
      : d.toLocaleDateString("en-US", { timeZone: "America/Puerto_Rico", year: "numeric", month: "long", day: "numeric" });
  } else {
    generatedAt = new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" });
  }
  const taskRows = tasks.slice(0, 12).map((t) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(t.title)}</td>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(t.phase ?? "")}</td>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(t.status)}</td></tr>`).join("");
  const docRows = docs.slice(0, 20).map((d) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(d.name)}</td>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(d.category)}</td></tr>`).join("");

  // Saved report template (if any) overrides the default header/footer and
  // adds a Cost Report table built from the saved contractor estimate using
  // the template's column list. When no template exists, fall back to the
  // hard-coded default layout.
  const template: ReportTemplate | undefined = PROJECT_REPORT_TEMPLATE[project.id];
  const estimate = PROJECT_CONTRACTOR_ESTIMATE[project.id];

  const defaultHeaderHtml =
    `<h1>KONTi Project Status Report</h1>` +
    `<div class="meta"><b>Project:</b> ${escapeHtml(project.name)}<br>` +
    `<b>Location:</b> ${escapeHtml(project.location ?? "—")}<br>` +
    `<b>Phase:</b> ${escapeHtml(phaseLabel)}<br>` +
    `<b>Date:</b> ${escapeHtml(generatedAt)}</div>`;
  const defaultFooterHtml =
    `<div class="sig"><b>Authorized Signature</b><br>KONTi Project Lead</div>`;

  let headerHtml = defaultHeaderHtml;
  let footerHtml = defaultFooterHtml;
  let costReportHtml = "";

  if (template) {
    const [titleLine, ...metaLines] = template.headerLines.length > 0
      ? template.headerLines
      : ["KONTi Project Status Report"];
    const metaHtml = [
      ...metaLines.map((l) => escapeHtml(l)),
      `<b>Phase:</b> ${escapeHtml(phaseLabel)}`,
      `<b>Date:</b> ${escapeHtml(generatedAt)}`,
    ].join("<br>");
    headerHtml =
      `<h1>${escapeHtml(titleLine ?? project.name)}</h1>` +
      `<div class="meta">${metaHtml}</div>`;
    footerHtml = `<div class="footer">${escapeHtml(template.footer)}</div>`;
    costReportHtml = renderTemplateCostReport(template, estimate);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>KONTi Status Report — ${escapeHtml(project.name)}</title>` +
    `<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;margin:32px;}` +
    `h1{color:#4F5E2A;margin:0 0 4px;}h2{font-size:14px;margin:24px 0 8px;color:#333;border-bottom:1px solid #ddd;padding-bottom:4px;}` +
    `.meta{color:#555;font-size:12px;margin:8px 0 16px;}.meta b{color:#222;}` +
    `table{width:100%;border-collapse:collapse;font-size:12px;}` +
    `.sig{margin-top:48px;border-top:1px solid #999;padding-top:8px;width:300px;font-size:12px;color:#444;}` +
    `.footer{margin-top:48px;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#444;text-align:center;}</style></head><body>` +
    headerHtml +
    `<h2>Open Tasks (${tasks.length} total)</h2>` +
    `<table><thead><tr><th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">Task</th>` +
    `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">Phase</th>` +
    `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">Status</th></tr></thead>` +
    `<tbody>${taskRows || '<tr><td colspan=3 style="padding:8px;color:#888;">No tasks recorded.</td></tr>'}</tbody></table>` +
    `<h2>Documents on file (${docs.length})</h2>` +
    `<table><thead><tr><th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">Name</th>` +
    `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc;">Category</th></tr></thead>` +
    `<tbody>${docRows || '<tr><td colspan=2 style="padding:8px;color:#888;">No documents on file.</td></tr>'}</tbody></table>` +
    costReportHtml +
    footerHtml +
    `</body></html>`;

  try {
    const pdfResponse = await fetch("https://api.pdf.co/v1/pdf/convert/from/html", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": pdfApiKey,
      },
      body: JSON.stringify({
        html,
        name: `KONTi-Report-${project.name.replace(/\s+/g, "-")}.pdf`,
        async: false,
        printBackground: true,
        landscape: false,
        paperSize: "Letter",
      }),
    });

    if (!pdfResponse.ok) {
      req.log.error({ status: pdfResponse.status }, "PDF.co API request failed");
      res.status(500).json({ error: "pdf_error", message: "PDF generation failed" });
      return;
    }

    const pdfData = await pdfResponse.json() as { url?: string; error?: boolean; message?: string };

    if (!pdfData.url || pdfData.error) {
      req.log.error({ pdfData }, "PDF.co did not return a URL");
      res.status(500).json({ error: "pdf_error", message: "PDF generation failed" });
      return;
    }

    const fileResponse = await fetch(pdfData.url);
    if (!fileResponse.ok || !fileResponse.body) {
      res.status(500).json({ error: "pdf_download_error", message: "Failed to fetch generated PDF" });
      return;
    }

    const safeName = project.name.replace(/[^a-zA-Z0-9\-_]/g, "-");
    // Buffer the rendered PDF so we can ship it to the user and also archive
    // it to Drive. Reports are typically <1 MB so the memory cost is fine,
    // and buffering avoids tee-ing a Readable stream into two consumers.
    const pdfBytes = Buffer.from(await fileResponse.arrayBuffer());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="KONTi-Report-${safeName}.pdf"`);
    res.send(pdfBytes);

    // Drive archive copy (Task #128 step 6) — fire-and-forget so the
    // response to the user is not delayed by the Drive round-trip. Failures
    // are intentionally swallowed; the Drive sync log is the ledger of
    // record so admins can re-run reports if a copy was missed.
    if (isDriveEnabled()) {
      const reportName = `KONTi-Report-${safeName}-${generatedAt.replace(/[/,:\s]/g, "-")}.pdf`;
      void uploadDocumentToDrive({
        projectId: project.id,
        projectName: project.name,
        documentId: `report-${Date.now()}`,
        documentName: reportName,
        category: "reports",
        mimeType: "application/pdf",
        data: pdfBytes,
        isClientVisible: false,
      }).catch(() => {
        /* logged inside drive-sync */
      });
    }
  } catch (err) {
    req.log.error({ err }, "PDF export error");
    res.status(500).json({ error: "pdf_error", message: "PDF generation failed" });
  }
});

// ---------------------------------------------------------------------------
// Phase 2 — Pre-Design & Viability endpoints
// ---------------------------------------------------------------------------

router.get("/projects/:id/pre-design", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  const user = (req as { user?: { id: string; role: string } }).user;
  if (user?.role === "client" && !clientCanAccessProject(user.id, project.id)) {
    return res.status(403).json({ error: "forbidden", message: "Client cannot access this project" });
  }
  return res.json({
    projectId: project.id,
    checklist: PRE_DESIGN_CHECKLISTS[project.id] ?? [],
    structuredVariables: PROJECT_STRUCTURED_VARS[project.id] ?? null,
    assistedBudgetRange: PROJECT_ASSISTED_BUDGETS[project.id] ?? null,
    weeklyReports: WEEKLY_REPORTS[project.id] ?? [],
    activities: PROJECT_ACTIVITIES[project.id] ?? [],
  });
});

router.post("/projects/:id/checklist-toggle", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const { itemId, status } = req.body ?? {};
  if (typeof itemId !== "string" || !VALID_CHECKLIST_STATUS.includes(status)) {
    return res.status(400).json({ error: "invalid_payload", message: "itemId (string) and status (pending|in_progress|done) required" });
  }
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  const list = PRE_DESIGN_CHECKLISTS[project.id];
  if (!list) return res.status(404).json({ error: "no_checklist" });
  const item = list.find((c) => c.id === itemId);
  if (!item) return res.status(404).json({ error: "item_not_found" });
  item.status = status;
  item.completedAt = status === "done" ? new Date().toISOString() : undefined;
  await persistPreDesignChecklistForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "checklist_toggle",
    actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
    description: `Checklist item "${item.label}" → ${status}`,
    descriptionEs: `Tarea "${item.labelEs}" → ${status}`,
  });
  return res.json({ projectId: project.id, item });
});

router.post("/projects/:id/structured-variables", requireRole(["admin", "superadmin"]), async (req, res) => {
  const { squareMeters, zoningCode, projectType } = req.body ?? {};
  if (typeof squareMeters !== "number" || squareMeters <= 0 || squareMeters > 100000) {
    return res.status(400).json({ error: "invalid_square_meters" });
  }
  if (typeof zoningCode !== "string" || !VALID_ZONING.test(zoningCode)) {
    return res.status(400).json({ error: "invalid_zoning_code", message: "Format: R-3, C-2, etc." });
  }
  if (!VALID_PROJECT_TYPES.includes(projectType)) {
    return res.status(400).json({ error: "invalid_project_type" });
  }
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });

  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  const vars = {
    squareMeters,
    zoningCode,
    projectType,
    submittedAt: new Date().toISOString(),
    submittedBy: actor,
  };
  PROJECT_STRUCTURED_VARS[project.id] = vars;
  const budget = computeAssistedBudget(vars);
  PROJECT_ASSISTED_BUDGETS[project.id] = budget;
  await persistStructuredVarsForProject(project.id);
  await persistAssistedBudgetForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "structured_variables",
    actor,
    description: `Structured variables saved: ${squareMeters} m², ${zoningCode}, ${projectType}`,
    descriptionEs: `Variables estructuradas guardadas: ${squareMeters} m², ${zoningCode}, ${projectType}`,
  });
  return res.json({ projectId: project.id, structuredVariables: vars, assistedBudgetRange: budget });
});

router.post("/projects/:id/advance-phase", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  const user = (req as { user?: { id: string; name?: string; role?: string } }).user;
  const isClient = user?.role === "client";

  // Ownership gate first — non-owning clients should get 403 regardless of
  // project state, so we don't leak phase information to unauthorized callers.
  if (!enforceClientOwnership(req, res, project.id)) return;

  const idx = PHASE_ORDER.indexOf(project.phase);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) {
    return res.status(400).json({ error: "cannot_advance", message: "Project is already in final phase" });
  }

  // Client gate: clients may only approve the consultation → pre_design transition.
  if (isClient && project.phase !== "consultation") {
    return res.status(400).json({ error: "client_gate_invalid", message: "Clients may only approve the consultation gate" });
  }

  // Punchlist gate: refuse if any non-done, non-waived items remain in the
  // current phase. Returns a structured payload so the UI can render the
  // bilingual reason and link to the open items.
  const openItems = getPunchlistForPhase(project.id, project.phase).filter(
    (i) => i.status !== "done" && i.status !== "waived",
  );
  if (openItems.length > 0) {
    return res.status(400).json({
      error: "punchlist_open",
      message: `Phase has ${openItems.length} open punchlist item(s). Complete or waive them first.`,
      messageEs: `La fase tiene ${openItems.length} ítem(s) de punchlist abiertos. Compleétalos o renúncialos primero.`,
      openCount: openItems.length,
      openItems: openItems.map((i) => ({ id: i.id, label: i.label, labelEs: i.labelEs, status: i.status })),
    });
  }

  const nextPhase = PHASE_ORDER[idx + 1];
  const labels = PHASE_LABELS[nextPhase];
  (project as { phase: typeof nextPhase }).phase = nextPhase;
  (project as { phaseLabel: string }).phaseLabel = labels.en;
  (project as { phaseLabelEs: string }).phaseLabelEs = labels.es;
  (project as { phaseNumber: number }).phaseNumber = idx + 2;

  const actor = user?.name ?? "Client";
  await appendActivityAndPersist(project.id, {
    type: "phase_change",
    actor,
    description: `Phase advanced to ${labels.en}${isClient ? " (client decision)" : ""}`,
    descriptionEs: `Fase avanzada a ${labels.es}${isClient ? " (decisión del cliente)" : ""}`,
  });

  // Real Pre-Design kickoff email to client + team (Task #102 — was simulated).
  let emailWarning: string | undefined;
  if (isClient) {
    const client = projectClient(project.id);
    const team = teamRecipients(project.id);
    const recipients = [
      ...(client ? [client.email] : []),
      ...team,
    ];
    if (recipients.length > 0) {
      const send = await sendAndRecord(
        project.id,
        {
          template: "phase_kickoff",
          lang: client?.lang ?? "en",
          to: recipients,
          vars: {
            projectName: project.name,
            recipientName: client?.name ?? "Team",
            nextPhaseEn: labels.en,
            nextPhaseEs: labels.es,
            projectUrl: projectAbsoluteUrl(project.id),
          },
        },
        {
          en: "Pre-Design kickoff email sent to client and team",
          es: "Correo de inicio de Pre-Diseño enviado al cliente y al equipo",
        },
      );
      if (!send.ok) emailWarning = send.reason;
    }
    await appendActivityAndPersist(project.id, {
      type: "invoice_sent",
      actor: "System",
      description: "Pre-Design & Viability Study invoice issued",
      descriptionEs: "Factura del Estudio de Pre-Diseño y Viabilidad emitida",
    });
  }

  // Task #144 — persist project (phase + label fields mutated above) before ack.
  try { await persistProjectsToDb(); }
  catch { return res.status(500).json({ error: "persist_failed", message: "Phase advance was applied in memory but failed to save. Please retry." }); }

  return res.json({ project, advancedTo: nextPhase, ...(emailWarning ? { emailWarning } : {}) });
});

router.post("/projects/:id/decline-phase", requireRole(["client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  const { reason } = req.body ?? {};
  const user = (req as { user?: { id: string; name?: string } }).user;
  if (!enforceClientOwnership(req, res, project.id)) return;
  if (project.phase !== "consultation") {
    return res.status(400).json({ error: "client_gate_invalid", message: "Decline only available at the consultation gate" });
  }
  const note = typeof reason === "string" && reason.trim().length > 0 ? `: ${reason.trim().slice(0, 200)}` : "";
  await appendActivityAndPersist(project.id, {
    type: "phase_change",
    actor: user?.name ?? "Client",
    description: `Client declined to advance to Pre-Design${note}`,
    descriptionEs: `El cliente no aprobó avanzar a Pre-Diseño${note}`,
  });
  // Real decline-notify email to the team (Task #102 — was simulated).
  const teamMails = teamRecipients(project.id);
  let declineEmailWarning: string | undefined;
  if (teamMails.length > 0) {
    const send = await sendAndRecord(
      project.id,
      {
        template: "decline_notify",
        lang: "en",
        to: teamMails,
        vars: {
          projectName: project.name,
          clientName: user?.name ?? "Client",
          reason: typeof reason === "string" ? reason.trim().slice(0, 500) : "",
          projectUrl: projectAbsoluteUrl(project.id),
        },
      },
      {
        en: "Internal team notified of client decline",
        es: "Equipo interno notificado del rechazo del cliente",
      },
    );
    if (!send.ok) declineEmailWarning = send.reason;
  }
  return res.json({
    project,
    declinedAt: new Date().toISOString(),
    ...(declineEmailWarning ? { emailWarning: declineEmailWarning } : {}),
  });
});

// ---------------------------------------------------------------------------
// Phase Punchlist — phase advancement gate
// ---------------------------------------------------------------------------

router.get("/projects/:id/punchlist", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const phaseFilter = typeof req.query["phase"] === "string" ? (req.query["phase"] as string) : project.phase;
  const items = getPunchlistForPhase(project.id, phaseFilter);
  const openCount = items.filter((i) => i.status !== "done" && i.status !== "waived").length;
  return res.json({
    projectId: project.id,
    phase: phaseFilter,
    items,
    openCount,
    totalCount: items.length,
    doneCount: items.filter((i) => i.status === "done").length,
    waivedCount: items.filter((i) => i.status === "waived").length,
  });
});

router.post("/projects/:id/punchlist", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const { label, labelEs, owner, dueDate, phase } = req.body ?? {};
  if (typeof label !== "string" || label.trim().length === 0 || typeof labelEs !== "string" || labelEs.trim().length === 0) {
    return res.status(400).json({ error: "invalid_payload", message: "label and labelEs are required" });
  }
  if (typeof owner !== "string" || owner.trim().length === 0) {
    return res.status(400).json({ error: "invalid_payload", message: "owner is required" });
  }
  const targetPhase = typeof phase === "string" && phase.length > 0 ? phase : project.phase;
  const key = punchlistKey(project.id, targetPhase);
  const list = PROJECT_PUNCHLIST[key] ?? (PROJECT_PUNCHLIST[key] = []);
  const item: PunchlistItem = {
    id: `pl-${project.id}-${Date.now()}`,
    projectId: project.id,
    phase: targetPhase as PunchlistItem["phase"],
    label: label.trim().slice(0, 200),
    labelEs: labelEs.trim().slice(0, 200),
    owner: owner.trim().slice(0, 100),
    dueDate: typeof dueDate === "string" && dueDate.length > 0 ? dueDate : undefined,
    status: "open",
    updatedAt: new Date().toISOString(),
  };
  list.push(item);
  savePunchlist(PROJECT_PUNCHLIST);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "punchlist_change",
    actor,
    description: `Punchlist item added: "${item.label}"`,
    descriptionEs: `Ítem de punchlist agregado: "${item.labelEs}"`,
  });
  return res.status(201).json({ projectId: project.id, item });
});

router.patch("/projects/:id/punchlist/:itemId", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const itemId = req.params["itemId"];
  let found: PunchlistItem | undefined;
  for (const list of Object.values(PROJECT_PUNCHLIST)) {
    found = list.find((i) => i.id === itemId && i.projectId === project.id);
    if (found) break;
  }
  if (!found) return res.status(404).json({ error: "item_not_found" });
  const { label, labelEs, owner, dueDate } = req.body ?? {};
  if (typeof label === "string" && label.trim().length > 0) found.label = label.trim().slice(0, 200);
  if (typeof labelEs === "string" && labelEs.trim().length > 0) found.labelEs = labelEs.trim().slice(0, 200);
  if (typeof owner === "string" && owner.trim().length > 0) found.owner = owner.trim().slice(0, 100);
  if (typeof dueDate === "string") found.dueDate = dueDate.length > 0 ? dueDate : undefined;
  found.updatedAt = new Date().toISOString();
  savePunchlist(PROJECT_PUNCHLIST);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "punchlist_change",
    actor,
    description: `Punchlist item edited: "${found.label}"`,
    descriptionEs: `Ítem de punchlist editado: "${found.labelEs}"`,
  });
  return res.json({ projectId: project.id, item: found });
});

router.post("/projects/:id/punchlist/:itemId/status", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const { status, waiverReason } = req.body ?? {};
  if (typeof status !== "string" || !PUNCHLIST_STATUSES.includes(status as PunchlistItemStatus)) {
    return res.status(400).json({ error: "invalid_payload", message: `status must be one of ${PUNCHLIST_STATUSES.join("|")}` });
  }
  if (status === "waived" && (typeof waiverReason !== "string" || waiverReason.trim().length < 3)) {
    return res.status(400).json({ error: "waiver_reason_required", message: "Waiving an item requires a justification (≥3 chars)" });
  }
  const itemId = req.params["itemId"];
  let found: PunchlistItem | undefined;
  for (const list of Object.values(PROJECT_PUNCHLIST)) {
    found = list.find((i) => i.id === itemId && i.projectId === project.id);
    if (found) break;
  }
  if (!found) return res.status(404).json({ error: "item_not_found" });
  const prev = found.status;
  found.status = status as PunchlistItemStatus;
  found.updatedAt = new Date().toISOString();
  if (status === "done") found.completedAt = new Date().toISOString();
  else if (status !== "done") found.completedAt = undefined;
  if (status === "waived") found.waiverReason = (waiverReason as string).trim().slice(0, 300);
  else found.waiverReason = undefined;
  savePunchlist(PROJECT_PUNCHLIST);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  const justSuffix = status === "waived" ? `: ${found.waiverReason}` : "";
  await appendActivityAndPersist(project.id, {
    type: "punchlist_change",
    actor,
    description: `Punchlist "${found.label}" → ${status} (was ${prev})${justSuffix}`,
    descriptionEs: `Punchlist "${found.labelEs}" → ${status} (antes ${prev})${justSuffix}`,
  });
  return res.json({ projectId: project.id, item: found });
});

router.delete("/projects/:id/punchlist/:itemId", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const itemId = req.params["itemId"];
  for (const [key, list] of Object.entries(PROJECT_PUNCHLIST)) {
    const idx = list.findIndex((i) => i.id === itemId && i.projectId === project.id);
    if (idx !== -1) {
      const [removed] = list.splice(idx, 1);
      if (list.length === 0) delete PROJECT_PUNCHLIST[key];
      savePunchlist(PROJECT_PUNCHLIST);
      const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
      await appendActivityAndPersist(project.id, {
        type: "punchlist_change",
        actor,
        description: `Punchlist item removed: "${removed!.label}"`,
        descriptionEs: `Ítem de punchlist eliminado: "${removed!.labelEs}"`,
      });
      return res.json({ projectId: project.id, removedId: itemId });
    }
  }
  return res.status(404).json({ error: "item_not_found" });
});

router.post("/projects/:id/gamma-report", requireRole(["team"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found" });
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  const reportId = `gamma-${project.id}-${Date.now()}`;
  const url = `https://gamma.app/docs/konti-${project.id}-${reportId}`;
  (project as { gammaReportUrl?: string }).gammaReportUrl = url;
  await appendActivityAndPersist(project.id, {
    type: "gamma_generated",
    actor: `${actor} via GAMMA`,
    description: "GAMMA presentation generated for client review",
    descriptionEs: "Presentación GAMMA generada para revisión del cliente",
  });
  try { await persistProjectsToDb(); }
  catch { return res.status(500).json({ error: "persist_failed", message: "GAMMA URL was set in memory but failed to save. Please retry." }); }
  return res.json({
    projectId: project.id,
    reportId,
    gammaReportUrl: url,
    url,
    generatedAt: new Date().toISOString(),
    generatedBy: "GAMMA",
    pages: 12,
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — Design sub-phases, Proposals & Change Orders
// ---------------------------------------------------------------------------

const VALID_DELIVERABLE_STATUS: DesignDeliverableStatus[] = ["pending", "in_progress", "done"];

function getProjectOr404(id: string, res: import("express").Response) {
  const project = PROJECTS.find((p) => p.id === id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return project;
}

// Backwards-compatible alias — read endpoints still use this name. New code
// should call enforceClientOwnership directly.
const clientCanReadOrForbid = enforceClientOwnership;

router.get("/projects/:id/design", requireRole(["team", "client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!clientCanReadOrForbid(req, res, project.id)) return;
  const state = PROJECT_DESIGN_STATE[project.id];
  // Derive current sub-phase from canonical project phase
  let derivedCurrent: DesignSubPhase | "complete" | null = null;
  if (DESIGN_SUB_PHASE_ORDER.includes(project.phase as DesignSubPhase)) {
    derivedCurrent = project.phase as DesignSubPhase;
  } else if (PHASE_ORDER.indexOf(project.phase) > PHASE_ORDER.indexOf("construction_documents")) {
    derivedCurrent = "complete";
  }
  const inDesign = derivedCurrent !== null;
  const stateOut = state && derivedCurrent !== null ? { ...state, currentSubPhase: derivedCurrent } : state;
  return res.json({
    projectId: project.id,
    available: !!state,
    isProjectInDesign: inDesign,
    state: stateOut ?? null,
    subPhaseOrder: DESIGN_SUB_PHASE_ORDER,
    subPhaseLabels: DESIGN_SUB_PHASE_LABELS,
    docVersionCadence: {
      schematic_design: { maxVersions: 3, label: "SD up to V3" },
      design_development: { maxVersions: 3, label: "DD up to V3" },
      construction_documents: { maxVersions: 2, label: "CD up to V2" },
    },
  });
});

router.post("/projects/:id/design/deliverable", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const { subPhase, deliverableId, status } = req.body ?? {};
  if (!DESIGN_SUB_PHASE_ORDER.includes(subPhase)) return res.status(400).json({ error: "invalid_sub_phase" });
  if (!VALID_DELIVERABLE_STATUS.includes(status)) return res.status(400).json({ error: "invalid_status" });
  const state = PROJECT_DESIGN_STATE[project.id];
  if (!state) return res.status(404).json({ error: "no_design_state" });
  const sp = state.subPhases[subPhase as DesignSubPhase];
  const item = sp.deliverables.find((d) => d.id === deliverableId);
  if (!item) return res.status(404).json({ error: "deliverable_not_found" });
  item.status = status;
  item.completedAt = status === "done" ? new Date().toISOString() : undefined;
  return res.json({ projectId: project.id, subPhase, item });
});

router.post("/projects/:id/design/advance-sub-phase", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const state = PROJECT_DESIGN_STATE[project.id];
  if (!state) return res.status(404).json({ error: "no_design_state" });
  // Resolve current sub-phase from canonical project phase
  if (!DESIGN_SUB_PHASE_ORDER.includes(project.phase as DesignSubPhase)) {
    return res.status(400).json({ error: "not_in_design", message: "Project is not currently in a design sub-phase" });
  }
  const currentSub = project.phase as DesignSubPhase;
  const idx = DESIGN_SUB_PHASE_ORDER.indexOf(currentSub);
  const current = state.subPhases[currentSub];
  const allDone = current.deliverables.every((d) => d.status === "done");
  if (!allDone) {
    return res.status(400).json({ error: "deliverables_incomplete", message: "All deliverables must be marked done before advancing" });
  }
  const now = new Date().toISOString();
  current.completedAt = now;
  const completedLabel = DESIGN_SUB_PHASE_LABELS[currentSub];
  let nextPhase: typeof project.phase;
  if (idx === DESIGN_SUB_PHASE_ORDER.length - 1) {
    state.currentSubPhase = "complete";
    nextPhase = "permits";
    await appendActivityAndPersist(project.id, {
      type: "sub_phase_advanced",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Design complete — ${completedLabel.en} signed off, advanced to Permits`,
      descriptionEs: `Diseño completo — ${completedLabel.es} aprobado, avanzado a Permisos`,
    });
  } else {
    const next = DESIGN_SUB_PHASE_ORDER[idx + 1];
    state.currentSubPhase = next;
    state.subPhases[next].startedAt = now;
    nextPhase = next;
    const nextLabel = DESIGN_SUB_PHASE_LABELS[next];
    await appendActivityAndPersist(project.id, {
      type: "sub_phase_advanced",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Advanced to ${nextLabel.en} (${completedLabel.en} complete)`,
      descriptionEs: `Avanzado a ${nextLabel.es} (${completedLabel.es} completado)`,
    });
  }
  // Sync canonical project phase
  const labels = PHASE_LABELS[nextPhase];
  (project as { phase: typeof nextPhase }).phase = nextPhase;
  (project as { phaseLabel: string }).phaseLabel = labels.en;
  (project as { phaseLabelEs: string }).phaseLabelEs = labels.es;
  (project as { phaseNumber: number }).phaseNumber = PHASE_ORDER.indexOf(nextPhase) + 1;
  try { await persistProjectsToDb(); }
  catch { return res.status(500).json({ error: "persist_failed", message: "Sub-phase advance was applied in memory but failed to save. Please retry." }); }
  return res.json({ projectId: project.id, state, project });
});

router.get("/projects/:id/proposals", requireRole(["team", "client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!clientCanReadOrForbid(req, res, project.id)) return;
  return res.json({ projectId: project.id, proposals: PROJECT_PROPOSALS[project.id] ?? [] });
});

router.post("/projects/:id/proposals/:proposalId/approve", requireRole(["client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!enforceClientOwnership(req, res, project.id)) return;
  const user = (req as { user?: { id: string; name?: string } }).user;
  const list = PROJECT_PROPOSALS[project.id] ?? [];
  const target = list.find((p) => p.id === String(req.params["proposalId"]));
  if (!target) return res.status(404).json({ error: "proposal_not_found" });
  if (list.some((p) => p.status === "approved")) {
    return res.status(400).json({ error: "already_approved", message: "A proposal has already been approved for this project" });
  }
  // Phase gate: only approvable while the project is still in pre-design or schematic design (i.e. before permits)
  const allowedPhases = ["pre_design", "schematic_design"];
  if (!allowedPhases.includes(project.phase)) {
    return res.status(400).json({
      error: "invalid_phase",
      message: `Proposal approval is only allowed during ${allowedPhases.join(" or ")} (current: ${project.phase})`,
    });
  }
  const now = new Date().toISOString();
  for (const p of list) {
    if (p.id === target.id) {
      p.status = "approved";
      p.decidedAt = now;
      p.decidedBy = user?.name ?? "Client";
    } else if (p.status === "pending") {
      p.status = "rejected";
      p.decidedAt = now;
      p.decidedBy = user?.name ?? "Client";
    }
  }
  await appendActivityAndPersist(project.id, {
    type: "proposal_decision",
    actor: user?.name ?? "Client",
    description: `Client approved "${target.title}" ($${target.totalCost.toLocaleString()})`,
    descriptionEs: `Cliente aprobó "${target.titleEs}" ($${target.totalCost.toLocaleString()})`,
  });
  // Real proposal-acceptance receipt to the client (Task #102 — was simulated).
  const proposalClient = projectClient(project.id);
  let proposalEmailWarning: string | undefined;
  if (proposalClient) {
    const send = await sendAndRecord(
      project.id,
      {
        template: "proposal_accept",
        lang: proposalClient.lang,
        to: proposalClient.email,
        cc: teamRecipients(project.id),
        vars: {
          projectName: project.name,
          proposalTitle: target.title,
          proposalTitleEs: target.titleEs,
          totalCost: target.totalCost,
          recipientName: proposalClient.name,
        },
      },
      {
        en: "Proposal acceptance receipt and contract draft sent",
        es: "Recibo de aceptación de propuesta y borrador de contrato enviados",
      },
    );
    if (!send.ok) proposalEmailWarning = send.reason;
  }
  // Stash the warning on the closure so the response below can surface it.
  (req as { _emailWarning?: string })._emailWarning = proposalEmailWarning;
  // Approving a proposal commits the contract — auto-advance the project to Permits
  const labels = PHASE_LABELS["permits"];
  (project as { phase: "permits" }).phase = "permits";
  (project as { phaseLabel: string }).phaseLabel = labels.en;
  (project as { phaseLabelEs: string }).phaseLabelEs = labels.es;
  (project as { phaseNumber: number }).phaseNumber = PHASE_ORDER.indexOf("permits") + 1;
  await appendActivityAndPersist(project.id, {
    type: "phase_change",
    actor: "System",
    description: `Phase advanced to ${labels.en} (proposal approved)`,
    descriptionEs: `Fase avanzada a ${labels.es} (propuesta aprobada)`,
  });
  try { await persistProjectsToDb(); }
  catch { return res.status(500).json({ error: "persist_failed", message: "Proposal approval was applied in memory but failed to save. Please retry." }); }
  const stashedWarning = (req as { _emailWarning?: string })._emailWarning;
  return res.json({
    projectId: project.id,
    proposals: list,
    approved: target,
    project,
    ...(stashedWarning ? { emailWarning: stashedWarning } : {}),
  });
});

router.get("/projects/:id/change-orders", requireRole(["team", "client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!clientCanReadOrForbid(req, res, project.id)) return;
  const orders = PROJECT_CHANGE_ORDERS[project.id] ?? [];
  const totals = {
    approvedDelta: orders.filter((o) => o.status === "approved").reduce((s, o) => s + o.amountDelta, 0),
    pendingDelta: orders.filter((o) => o.status === "pending").reduce((s, o) => s + o.amountDelta, 0),
    approvedDays: orders.filter((o) => o.status === "approved").reduce((s, o) => s + o.scheduleImpactDays, 0),
  };
  return res.json({ projectId: project.id, changeOrders: orders, totals });
});

router.post("/projects/:id/change-orders", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const { title, titleEs, description, descriptionEs, amountDelta, scheduleImpactDays, reason, reasonEs, outsideOfScope } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length < 3) return res.status(400).json({ error: "invalid_title" });
  if (typeof amountDelta !== "number" || !isFinite(amountDelta)) return res.status(400).json({ error: "invalid_amount" });
  if (typeof scheduleImpactDays !== "number" || !isFinite(scheduleImpactDays) || scheduleImpactDays < 0) {
    return res.status(400).json({ error: "invalid_schedule" });
  }
  const list = PROJECT_CHANGE_ORDERS[project.id] ?? (PROJECT_CHANGE_ORDERS[project.id] = []);
  const number = `CO-${String(list.length + 1).padStart(3, "0")}`;
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  const co: ChangeOrder = {
    id: `co-${project.id}-${Date.now()}`,
    projectId: project.id,
    number,
    title: title.trim(),
    titleEs: typeof titleEs === "string" && titleEs.trim() ? titleEs.trim() : title.trim(),
    description: typeof description === "string" ? description : "",
    descriptionEs: typeof descriptionEs === "string" ? descriptionEs : (typeof description === "string" ? description : ""),
    amountDelta,
    scheduleImpactDays,
    reason: typeof reason === "string" ? reason : "",
    reasonEs: typeof reasonEs === "string" ? reasonEs : (typeof reason === "string" ? reason : ""),
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
    status: "pending",
    outsideOfScope: typeof outsideOfScope === "boolean" ? outsideOfScope : false,
  };
  list.push(co);
  await persistChangeOrdersForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "change_order_created",
    actor,
    description: `${number} created: ${co.title} (${amountDelta >= 0 ? "+" : "−"}$${Math.abs(amountDelta).toLocaleString()})`,
    descriptionEs: `${number} creada: ${co.titleEs} (${amountDelta >= 0 ? "+" : "−"}$${Math.abs(amountDelta).toLocaleString()})`,
  });
  return res.status(201).json({ projectId: project.id, changeOrder: co });
});

router.patch("/projects/:id/change-orders/:coId", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const list = PROJECT_CHANGE_ORDERS[project.id] ?? [];
  const co = list.find((o) => o.id === String(req.params["coId"]));
  if (!co) return res.status(404).json({ error: "change_order_not_found" });
  if (co.status !== "pending") {
    return res.status(400).json({ error: "cannot_edit_decided", message: "Only pending change orders can be edited" });
  }
  const body = (req.body ?? {}) as Partial<ChangeOrder>;
  const changes: string[] = [];
  if (typeof body.title === "string" && body.title.trim().length >= 3 && body.title.trim() !== co.title) {
    co.title = body.title.trim(); changes.push("title");
  }
  if (typeof body.titleEs === "string" && body.titleEs.trim() && body.titleEs.trim() !== co.titleEs) {
    co.titleEs = body.titleEs.trim(); changes.push("titleEs");
  }
  if (typeof body.description === "string" && body.description !== co.description) {
    co.description = body.description; changes.push("description");
  }
  if (typeof body.descriptionEs === "string" && body.descriptionEs !== co.descriptionEs) {
    co.descriptionEs = body.descriptionEs; changes.push("descriptionEs");
  }
  if (typeof body.reason === "string" && body.reason !== co.reason) {
    co.reason = body.reason; changes.push("reason");
  }
  if (typeof body.reasonEs === "string" && body.reasonEs !== co.reasonEs) {
    co.reasonEs = body.reasonEs; changes.push("reasonEs");
  }
  if (typeof body.amountDelta === "number" && isFinite(body.amountDelta) && body.amountDelta !== co.amountDelta) {
    co.amountDelta = body.amountDelta; changes.push("amount");
  }
  if (typeof body.scheduleImpactDays === "number" && isFinite(body.scheduleImpactDays) && body.scheduleImpactDays >= 0 && body.scheduleImpactDays !== co.scheduleImpactDays) {
    co.scheduleImpactDays = body.scheduleImpactDays; changes.push("schedule");
  }
  if (typeof body.outsideOfScope === "boolean" && body.outsideOfScope !== co.outsideOfScope) {
    co.outsideOfScope = body.outsideOfScope; changes.push("outsideOfScope");
  }
  if (changes.length === 0) {
    return res.status(400).json({ error: "no_changes" });
  }
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await persistChangeOrdersForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "change_order_created",
    actor,
    description: `${co.number} edited (${changes.join(", ")})`,
    descriptionEs: `${co.number} editada (${changes.join(", ")})`,
  });
  return res.json({ projectId: project.id, changeOrder: co });
});

router.delete("/projects/:id/change-orders/:coId", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const list = PROJECT_CHANGE_ORDERS[project.id] ?? [];
  const idx = list.findIndex((o) => o.id === String(req.params["coId"]));
  if (idx === -1) return res.status(404).json({ error: "change_order_not_found" });
  const co = list[idx];
  if (co.status !== "pending") {
    return res.status(400).json({ error: "cannot_delete_decided", message: "Only pending change orders can be deleted" });
  }
  list.splice(idx, 1);
  await persistChangeOrdersForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "change_order_decision",
    actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
    description: `${co.number} withdrawn before decision`,
    descriptionEs: `${co.number} retirada antes de la decisión`,
  });
  return res.json({ projectId: project.id, deleted: co.id });
});

// Change-order status is admin/architect-only per spec — clients have read-only access.
router.post("/projects/:id/change-orders/:coId/status", requireRole(["team", "admin", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const user = (req as { user?: { id: string; name?: string } }).user;
  const { status, note } = req.body ?? {};
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return res.status(400).json({ error: "invalid_status" });
  }
  const list = PROJECT_CHANGE_ORDERS[project.id] ?? [];
  const co = list.find((o) => o.id === String(req.params["coId"]));
  if (!co) return res.status(404).json({ error: "change_order_not_found" });
  co.status = status;
  if (status === "pending") {
    co.decidedAt = undefined;
    co.decidedBy = undefined;
    co.decisionNote = undefined;
  } else {
    co.decidedAt = new Date().toISOString();
    co.decidedBy = user?.name ?? "Team";
    if (typeof note === "string" && note.trim()) co.decisionNote = note.trim().slice(0, 300);
  }
  await persistChangeOrdersForProject(project.id);
  await appendActivityAndPersist(project.id, {
    type: "change_order_decision",
    actor: user?.name ?? "Team",
    description: `${co.number} marked ${status}${co.decisionNote ? `: ${co.decisionNote}` : ""}`,
    descriptionEs: `${co.number} marcada ${status === "approved" ? "aprobada" : status === "rejected" ? "rechazada" : "pendiente"}${co.decisionNote ? `: ${co.decisionNote}` : ""}`,
  });
  return res.json({ projectId: project.id, changeOrder: co });
});

// ---------------------------------------------------------------------------
// Phase 4 — Permits Authorization Workflow
// ---------------------------------------------------------------------------

function computePermitMilestones(projectId: string) {
  const auth = PROJECT_PERMIT_AUTHORIZATIONS[projectId] ?? { status: "none" as const, summaryAccepted: false };
  const sigs = PROJECT_REQUIRED_SIGNATURES[projectId] ?? [];
  const items = PROJECT_PERMIT_ITEMS[projectId] ?? [];
  const allSigned = sigs.length > 0 && sigs.filter((s) => s.required).every((s) => !!s.signedAt);
  const anySubmitted = items.some((i) => i.state !== "not_submitted");
  const anyInReviewLike = items.some((i) => i.state === "in_review" || i.state === "approved" || i.state === "revision_requested");
  const allApproved = items.length > 0 && items.every((i) => i.state === "approved");
  return {
    auth, sigs, items, allSigned, anySubmitted, anyInReviewLike, allApproved,
    milestones: {
      authorization: auth.status === "authorized",
      signatures: allSigned,
      submission: anySubmitted,
      review: anyInReviewLike,
      approval: allApproved,
    },
  };
}

router.get("/projects/:id/permits", requireRole(["team", "client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!clientCanReadOrForbid(req, res, project.id)) return;
  const m = computePermitMilestones(project.id);
  return res.json({
    projectId: project.id,
    authorization: m.auth,
    requiredSignatures: m.sigs,
    permitItems: m.items,
    milestones: m.milestones,
    canSubmitToOgpe: m.auth.status === "authorized" && m.allSigned && m.items.some((i) => i.state === "not_submitted"),
    stateOrder: PERMIT_ITEM_STATE_ORDER,
  });
});

router.post("/projects/:id/authorize-permits", requireRole(["client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!enforceClientOwnership(req, res, project.id)) return;
  const user = (req as { user?: { id: string; name?: string } }).user;
  if (project.phase !== "permits") {
    return res.status(400).json({ error: "invalid_phase", message: "Project is not in the permits phase" });
  }
  const auth = PROJECT_PERMIT_AUTHORIZATIONS[project.id] ?? (PROJECT_PERMIT_AUTHORIZATIONS[project.id] = { status: "none", summaryAccepted: false });
  if (auth.status === "authorized") {
    return res.status(400).json({ error: "already_authorized" });
  }
  auth.status = "authorized";
  auth.authorizedBy = user?.name ?? "Client";
  auth.authorizedAt = new Date().toISOString();
  auth.summaryAccepted = true;
  // Capture client IP for the audit trail. Demo data is in-memory, so we
  // accept the proxied request IP and fall back to a mock placeholder.
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  auth.authorizedIpMock = fwd || req.ip || req.socket?.remoteAddress || "127.0.0.1 (mock)";
  await appendActivityAndPersist(project.id, {
    type: "permit_authorization",
    actor: user?.name ?? "Client",
    description: "Client authorized OGPE submission packet",
    descriptionEs: "Cliente autorizó el paquete de sometimiento a OGPE",
  });
  return res.json({ projectId: project.id, authorization: auth });
});

router.post("/projects/:id/sign/:signatureId", requireRole(["client"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  if (!enforceClientOwnership(req, res, project.id)) return;
  if (project.phase !== "permits") {
    return res.status(400).json({ error: "invalid_phase", message: "Signatures only accepted during the permits phase" });
  }
  // Sequencing: client must authorize the OGPE packet before signing forms.
  const auth = PROJECT_PERMIT_AUTHORIZATIONS[project.id];
  if (!auth || auth.status !== "authorized") {
    return res.status(400).json({ error: "not_authorized", message: "Authorize the OGPE submission packet before signing forms" });
  }
  const { signatureName } = req.body ?? {};
  if (typeof signatureName !== "string" || signatureName.trim().length < 2) {
    return res.status(400).json({ error: "invalid_signature_name", message: "Signature name must be at least 2 characters" });
  }
  const sigs = PROJECT_REQUIRED_SIGNATURES[project.id] ?? [];
  const sig = sigs.find((s) => s.id === String(req.params["signatureId"]));
  if (!sig) return res.status(404).json({ error: "signature_not_found" });
  if (sig.signedAt) return res.status(400).json({ error: "already_signed" });
  sig.signedBy = signatureName.trim().slice(0, 100);
  sig.signedAt = new Date().toISOString();
  // Clear any pending request-signature dedupe key now that the signature is filled.
  pendingSignatureRequests.delete(pendingSignatureKey(project.id, sig.id));
  await appendActivityAndPersist(project.id, {
    type: "permit_signature",
    actor: sig.signedBy,
    description: `Signed: ${sig.formName}`,
    descriptionEs: `Firmado: ${sig.formNameEs}`,
  });
  // Real signature-completed email to the team (Task #102).
  const team = teamRecipients(project.id);
  let signEmailWarning: string | undefined;
  if (team.length > 0) {
    const remaining = sigs.filter((s) => s.required && !s.signedAt).length;
    const send = await sendAndRecord(
      project.id,
      {
        template: "signature_completed",
        lang: "en",
        to: team,
        cc: SUPERADMIN_NOTIFY_EMAILS,
        vars: {
          projectName: project.name,
          formName: sig.formName,
          formNameEs: sig.formNameEs,
          signedBy: sig.signedBy,
          signedAt: new Date(sig.signedAt).toLocaleString(),
          remainingCount: remaining,
        },
      },
      {
        en: `Signature completion notice sent to team: ${sig.formName}`,
        es: `Aviso de firma enviado al equipo: ${sig.formNameEs}`,
      },
    );
    if (!send.ok) signEmailWarning = send.reason;
  }
  return res.json({
    projectId: project.id,
    signature: sig,
    ...(signEmailWarning ? { emailWarning: signEmailWarning } : {}),
  });
});

// Task #102 — Staff (admin/architect/superadmin) sends or re-sends a signature
// request email to the project's client. Dedupes per (projectId, signatureId)
// while pending; the dedupe key is cleared automatically when the client signs.
router.post(
  "/projects/:id/request-signature/:signatureId",
  requireRole(["admin", "architect", "superadmin"]),
  async (req, res) => {
    const project = getProjectOr404(String(req.params["id"]), res);
    if (!project) return;
    if (project.phase !== "permits") {
      return res.status(400).json({ error: "invalid_phase", message: "Signature requests are only valid during the permits phase" });
    }
    const authzn = PROJECT_PERMIT_AUTHORIZATIONS[project.id];
    if (!authzn || authzn.status !== "authorized") {
      return res.status(400).json({ error: "not_authorized", message: "Client must authorize the OGPE packet before signature requests are valid" });
    }
    const sigs = PROJECT_REQUIRED_SIGNATURES[project.id] ?? [];
    const sig = sigs.find((s) => s.id === String(req.params["signatureId"]));
    if (!sig) return res.status(404).json({ error: "signature_not_found" });
    if (sig.signedAt) {
      return res.status(400).json({ error: "already_signed", message: "Signature already collected" });
    }
    const dedupeKey = pendingSignatureKey(project.id, sig.id);
    if (pendingSignatureRequests.has(dedupeKey)) {
      return res.json({
        projectId: project.id,
        signatureId: sig.id,
        emailSent: false,
        deduped: true,
        reason: "already_pending",
      });
    }
    const client = projectClient(project.id);
    if (!client) {
      return res.status(400).json({ error: "no_client_email", message: "Project has no client on file" });
    }
    const user = (req as { user?: { name?: string } }).user;
    pendingSignatureRequests.add(dedupeKey);
    const send = await sendAndRecord(
      project.id,
      {
        template: "signature_request",
        lang: client.lang,
        to: client.email,
        vars: {
          projectName: project.name,
          formName: sig.formName,
          formNameEs: sig.formNameEs,
          recipientName: client.name,
          signUrl: signatureSignUrl(project.id, sig.id),
          requestedBy: user?.name ?? "KONTi Team",
        },
      },
      {
        en: `Signature request sent to client: ${sig.formName}`,
        es: `Solicitud de firma enviada al cliente: ${sig.formNameEs}`,
      },
      user?.name ?? "System",
    );
    if (!send.ok) {
      // Failed sends free the dedupe key so staff can retry immediately.
      pendingSignatureRequests.delete(dedupeKey);
    }
    return res.json({
      projectId: project.id,
      signatureId: sig.id,
      emailSent: send.ok,
      deduped: false,
      ...(send.reason ? { reason: send.reason } : {}),
    });
  },
);

router.post("/projects/:id/permit-items/submit-to-ogpe", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const auth = PROJECT_PERMIT_AUTHORIZATIONS[project.id];
  const sigs = PROJECT_REQUIRED_SIGNATURES[project.id] ?? [];
  const items = PROJECT_PERMIT_ITEMS[project.id] ?? [];
  if (!auth || auth.status !== "authorized") {
    return res.status(400).json({ error: "not_authorized", message: "Client authorization required before submitting" });
  }
  if (!sigs.filter((s) => s.required).every((s) => !!s.signedAt)) {
    return res.status(400).json({ error: "signatures_incomplete", message: "All required signatures must be collected first" });
  }
  const now = new Date().toISOString();
  let count = 0;
  for (const it of items) {
    if (it.state === "not_submitted") {
      it.state = "submitted";
      it.lastUpdatedAt = now;
      count++;
    }
  }
  if (count === 0) {
    return res.status(400).json({ error: "nothing_to_submit", message: "All permit items have already been submitted" });
  }
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "permit_submitted",
    actor,
    description: `Submitted ${count} permit item${count === 1 ? "" : "s"} to OGPE`,
    descriptionEs: `Enviados ${count} ítem${count === 1 ? "" : "s"} de permiso a OGPE`,
  });
  return res.json({ projectId: project.id, permitItems: items, submittedCount: count });
});

router.post("/projects/:id/permit-items/:itemId/state", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = getProjectOr404(String(req.params["id"]), res);
  if (!project) return;
  const { state, revisionNote, revisionNoteEs } = req.body ?? {};
  if (!PERMIT_ITEM_STATE_ORDER.includes(state)) {
    return res.status(400).json({ error: "invalid_state" });
  }
  const items = PROJECT_PERMIT_ITEMS[project.id] ?? [];
  const item = items.find((i) => i.id === String(req.params["itemId"]));
  if (!item) return res.status(404).json({ error: "permit_item_not_found" });
  const targetState: PermitItemState = state;
  item.state = targetState;
  item.lastUpdatedAt = new Date().toISOString();
  if (targetState === "revision_requested") {
    if (typeof revisionNote === "string" && revisionNote.trim()) item.revisionNote = revisionNote.trim().slice(0, 300);
    if (typeof revisionNoteEs === "string" && revisionNoteEs.trim()) item.revisionNoteEs = revisionNoteEs.trim().slice(0, 300);
  } else if (targetState === "approved" || targetState === "submitted" || targetState === "in_review") {
    item.revisionNote = undefined;
    item.revisionNoteEs = undefined;
  }
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "permit_state_change",
    actor,
    description: `${item.name} → ${targetState}`,
    descriptionEs: `${item.nameEs} → ${targetState}`,
  });
  // Auto-advance to construction when all permit items are approved
  let advanced = false;
  if (project.phase === "permits" && items.length > 0 && items.every((i) => i.state === "approved")) {
    const labels = PHASE_LABELS["construction"];
    (project as { phase: "construction" }).phase = "construction";
    (project as { phaseLabel: string }).phaseLabel = labels.en;
    (project as { phaseLabelEs: string }).phaseLabelEs = labels.es;
    (project as { phaseNumber: number }).phaseNumber = PHASE_ORDER.indexOf("construction") + 1;
    await appendActivityAndPersist(project.id, {
      type: "phase_change",
      actor: "System",
      description: "All permits approved — advanced to Construction",
      descriptionEs: "Todos los permisos aprobados — avanzado a Construcción",
    });
    advanced = true;
  }
  // Task #144 — `project.phase` may have been auto-advanced; persist before ack.
  if (advanced) {
    try { await persistProjectsToDb(); }
    catch { return res.status(500).json({ error: "persist_failed", message: "Phase auto-advance was applied in memory but failed to save. Please retry." }); }
  }
  return res.json({ projectId: project.id, permitItem: item, project, advancedToConstruction: advanced });
});

// ---------------------------------------------------------------------------
// Phase 5 — Construction: Cost-Plus, Inspections, Milestones, Engineers
// ---------------------------------------------------------------------------

const VALID_INSPECTION_TYPES: InspectionType[] = ["foundation", "framing", "electrical", "plumbing", "final"];
const VALID_INSPECTION_STATUS: InspectionStatus[] = ["scheduled", "passed", "failed", "re_inspect"];
const VALID_MILESTONE_STATUS: MilestoneStatus[] = ["completed", "in_progress", "upcoming"];

router.get("/structural-engineers", requireRole(["admin", "architect", "superadmin"]), async (_req, res) => {
  res.json(STRUCTURAL_ENGINEERS);
});

router.get("/projects/:id/cost-plus", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const cp = PROJECT_COST_PLUS[project.id];
  if (!cp) return res.status(404).json({ error: "not_found", message: "Cost-plus budget not configured" });
  return res.json(cp);
});

router.get("/projects/:id/invoices", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const invoices = PROJECT_INVOICES[project.id] ?? [];
  return res.json({ projectId: project.id, invoices });
});

router.get("/projects/:id/contractor-monitoring", requireRole(["team", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const rows = PROJECT_CONTRACTOR_MONITORING[project.id] ?? [];
  return res.json({ projectId: project.id, rows });
});

// Last-100 client-facing activity feed. Team consumes this on the project page;
// `?clientOnly=true` narrows to entries triggered by client behaviour. Clients
// may only fetch the audit log for projects they own (enforceClientOwnership).
router.get("/projects/:id/audit-log", requireRole(["team", "client", "admin", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const clientOnly = String(req.query["clientOnly"] ?? "").toLowerCase() === "true";
  const CLIENT_TYPES = new Set([
    "client_view",
    "document_download",
    "client_upload",
    "profile_update",
    "document_visibility_change",
    "proposal_decision",
    "change_order_decision",
  ]);
  const all = PROJECT_ACTIVITIES[project.id] ?? [];
  const filtered = clientOnly ? all.filter((a) => CLIENT_TYPES.has(a.type)) : all;
  // Most recent first, capped at 100 to keep payload small.
  const sorted = [...filtered].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 100);
  return res.json({ projectId: project.id, entries: sorted });
});

router.get("/projects/:id/inspections", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const list = PROJECT_INSPECTIONS[project.id] ?? [];
  return res.json({ projectId: project.id, inspections: list });
});

router.get("/projects/:id/inspections/:insId", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const insp = (PROJECT_INSPECTIONS[project.id] ?? []).find((i) => i.id === req.params["insId"]);
  if (!insp) return res.status(404).json({ error: "not_found", message: "Inspection not found" });
  return res.json({ projectId: project.id, inspection: insp });
});

router.post("/projects/:id/inspections", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  const body = (req.body ?? {}) as Partial<Inspection>;
  if (!body.type || !VALID_INSPECTION_TYPES.includes(body.type)) {
    return res.status(400).json({ error: "validation", message: "type required" });
  }
  if (!body.title || !body.titleEs || !body.inspector || !body.scheduledDate) {
    return res.status(400).json({ error: "validation", message: "title, titleEs, inspector, scheduledDate required" });
  }
  const status: InspectionStatus = body.status && VALID_INSPECTION_STATUS.includes(body.status) ? body.status : "scheduled";
  const list = PROJECT_INSPECTIONS[project.id] ?? (PROJECT_INSPECTIONS[project.id] = []);
  const inspection: Inspection = {
    id: `ins-${project.id}-${Date.now()}`,
    projectId: project.id,
    type: body.type,
    title: body.title,
    titleEs: body.titleEs,
    inspector: body.inspector,
    scheduledDate: body.scheduledDate,
    status,
    ...(body.completedDate ? { completedDate: body.completedDate } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
    ...(body.notesEs ? { notesEs: body.notesEs } : {}),
  };
  list.push(inspection);
  await persistInspectionsForProject(project.id);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "inspection_scheduled",
    actor,
    description: `Inspection scheduled: ${inspection.title} (${inspection.scheduledDate})`,
    descriptionEs: `Inspección programada: ${inspection.titleEs} (${inspection.scheduledDate})`,
  });
  return res.status(201).json({ projectId: project.id, inspection });
});

router.patch("/projects/:id/inspections/:insId", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  const list = PROJECT_INSPECTIONS[project.id] ?? [];
  const insp = list.find((i) => i.id === req.params["insId"]);
  if (!insp) return res.status(404).json({ error: "not_found", message: "Inspection not found" });
  const body = (req.body ?? {}) as Partial<Inspection>;
  const prevStatus = insp.status;
  if (body.status !== undefined) {
    if (!VALID_INSPECTION_STATUS.includes(body.status)) {
      return res.status(400).json({ error: "validation", message: "invalid status" });
    }
    insp.status = body.status;
    if ((body.status === "passed" || body.status === "failed") && !insp.completedDate) {
      insp.completedDate = body.completedDate ?? new Date().toISOString().slice(0, 10);
    }
  }
  if (body.scheduledDate !== undefined) insp.scheduledDate = body.scheduledDate;
  if (body.completedDate !== undefined) insp.completedDate = body.completedDate;
  if (body.inspector !== undefined) insp.inspector = body.inspector;
  if (body.notes !== undefined) insp.notes = body.notes;
  if (body.notesEs !== undefined) insp.notesEs = body.notesEs;
  if (body.title !== undefined) insp.title = body.title;
  if (body.titleEs !== undefined) insp.titleEs = body.titleEs;
  if (body.reportDocumentUrl !== undefined) insp.reportDocumentUrl = body.reportDocumentUrl;
  if (body.reportDocumentName !== undefined) insp.reportDocumentName = body.reportDocumentName;
  await persistInspectionsForProject(project.id);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  if (body.status !== undefined && body.status !== prevStatus) {
    await appendActivityAndPersist(project.id, {
      type: "inspection_status_change",
      actor,
      description: `${insp.title}: ${prevStatus} → ${insp.status}`,
      descriptionEs: `${insp.titleEs}: ${prevStatus} → ${insp.status}`,
    });
  }
  return res.json({ projectId: project.id, inspection: insp });
});

router.delete("/projects/:id/inspections/:insId", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  const list = PROJECT_INSPECTIONS[project.id] ?? [];
  const idx = list.findIndex((i) => i.id === req.params["insId"]);
  if (idx === -1) return res.status(404).json({ error: "not_found", message: "Inspection not found" });
  const removed = list[idx]!;
  list.splice(idx, 1);
  await persistInspectionsForProject(project.id);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "inspection_removed",
    actor,
    description: `Inspection removed: ${removed.title} (${removed.scheduledDate})`,
    descriptionEs: `Inspección eliminada: ${removed.titleEs} (${removed.scheduledDate})`,
  });
  return res.json({ projectId: project.id, deleted: removed.id });
});

router.post("/projects/:id/inspections/:insId/send-report", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  const list = PROJECT_INSPECTIONS[project.id] ?? [];
  const insp = list.find((i) => i.id === req.params["insId"]);
  if (!insp) return res.status(404).json({ error: "not_found", message: "Inspection not found" });
  if (insp.status !== "passed" && insp.status !== "failed" && insp.status !== "re_inspect") {
    return res.status(400).json({ error: "validation", message: "Report can only be sent for completed inspections" });
  }
  const body = (req.body ?? {}) as { engineerId?: string; note?: string };
  const engineer = STRUCTURAL_ENGINEERS.find((e) => e.id === body.engineerId);
  if (!engineer) return res.status(400).json({ error: "validation", message: "engineerId required" });
  insp.reportSentTo = engineer.id;
  insp.reportSentToName = engineer.name;
  insp.reportSentAt = new Date().toISOString();
  if (body.note) insp.reportSentNote = body.note;
  await persistInspectionsForProject(project.id);
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  await appendActivityAndPersist(project.id, {
    type: "inspection_report_sent",
    actor,
    description: `${insp.title} report sent to ${engineer.name} (${engineer.firm})`,
    descriptionEs: `Reporte de ${insp.titleEs} enviado a ${engineer.name} (${engineer.firm})`,
  });
  return res.json({ projectId: project.id, inspection: insp });
});

router.get("/projects/:id/milestones", requireRole(["team", "admin", "superadmin", "architect", "client"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  if (!enforceClientOwnership(req, res, project.id)) return;
  const list = PROJECT_MILESTONES[project.id] ?? [];
  return res.json({ projectId: project.id, milestones: list });
});

router.patch("/projects/:id/milestones/:milestoneId", requireRole(["admin", "architect", "superadmin"]), async (req, res) => {
  const project = PROJECTS.find((p) => p.id === req.params["id"]);
  if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
  const list = PROJECT_MILESTONES[project.id] ?? [];
  const m = list.find((x) => x.id === req.params["milestoneId"]);
  if (!m) return res.status(404).json({ error: "not_found", message: "Milestone not found" });
  const body = (req.body ?? {}) as Partial<Milestone>;
  const prev = m.status;
  if (body.status !== undefined) {
    if (!VALID_MILESTONE_STATUS.includes(body.status)) {
      return res.status(400).json({ error: "validation", message: "invalid status" });
    }
    m.status = body.status;
  }
  if (body.startDate !== undefined) m.startDate = body.startDate;
  if (body.endDate !== undefined) m.endDate = body.endDate;
  const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
  if (body.status !== undefined && body.status !== prev) {
    await appendActivityAndPersist(project.id, {
      type: "milestone_status_change",
      actor,
      description: `Milestone ${m.title}: ${prev} → ${m.status}`,
      descriptionEs: `Hito ${m.titleEs}: ${prev} → ${m.status}`,
    });
  }
  return res.json({ projectId: project.id, milestone: m });
});

// PATCH client contact info on a project (phone, postal address, physical address).
// Lets team members maintain a per-project copy of the client's reach-out info
// without forcing the client to update their own profile (CSV item #20).
router.patch(
  "/projects/:projectId/client-contact",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const project = PROJECTS.find((p) => p.id === req.params["projectId"]);
    if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const next = project as typeof project & {
      clientPhone?: string;
      clientPostalAddress?: string;
      clientPhysicalAddress?: string;
    };
    const apply = (key: "clientPhone" | "clientPostalAddress" | "clientPhysicalAddress") => {
      if (body[key] !== undefined) {
        const raw = body[key];
        next[key] = typeof raw === "string" ? raw.trim() : "";
      }
    };
    apply("clientPhone");
    apply("clientPostalAddress");
    apply("clientPhysicalAddress");
    await persistProjectsToDb();
    await appendActivityAndPersist(project.id, {
      type: "client_contact_updated",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Client contact info updated for ${project.clientName}.`,
      descriptionEs: `Información de contacto del cliente actualizada para ${project.clientName}.`,
    });
    return res.json({
      projectId: project.id,
      clientPhone: next.clientPhone ?? "",
      clientPostalAddress: next.clientPostalAddress ?? "",
      clientPhysicalAddress: next.clientPhysicalAddress ?? "",
    });
  },
);

// PATCH the plain-language "what's happening now" status sentence (EN + ES).
// Team members can keep this paragraph fresh from the project page so clients
// always see a friendly, current summary on their dashboard card.
router.patch(
  "/projects/:projectId/status-note",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const project = PROJECTS.find((p) => p.id === req.params["projectId"]);
    if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const next = project as typeof project & {
      currentStatusNote?: string;
      currentStatusNoteEs?: string;
    };
    const apply = (key: "currentStatusNote" | "currentStatusNoteEs") => {
      if (body[key] !== undefined) {
        const raw = body[key];
        next[key] = typeof raw === "string" ? raw.trim() : "";
      }
    };
    apply("currentStatusNote");
    apply("currentStatusNoteEs");
    await persistProjectsToDb();
    await appendActivityAndPersist(project.id, {
      type: "status_note_updated",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Status note updated for ${project.clientName}.`,
      descriptionEs: `Nota de estado actualizada para ${project.clientName}.`,
    });
    return res.json({
      projectId: project.id,
      currentStatusNote: next.currentStatusNote ?? "",
      currentStatusNoteEs: next.currentStatusNoteEs ?? "",
    });
  },
);

// PATCH project-level metadata (B-05 + P1.3 + P1.9 + P6.4).
// Square meters / bathrooms / kitchens / project type / contingency % live on
// the Project record so the Contractor Calculator and other estimating tools
// can read them as a single source of truth instead of being re-typed each
// time an estimate is generated. P1 extends this with containerCount,
// riskClassification, marginPercent, and costListVariant.
const PROJECT_TYPE_VALUES = ["residencial", "comercial", "mixto", "contenedor"] as const;
type ProjectType = (typeof PROJECT_TYPE_VALUES)[number];

// P1.9 — risk classification keys + contingency multipliers. Source:
// `1b) KONTI DESIGN CONSTRUCTION ESTIMATE` DATA sheet rows 35-38.
const RISK_CLASSIFICATION_VALUES = [
  "paint_by_numbers",  // 1.05 — low risk
  "quest",              // 1.10 — medium risk
  "making_a_movie",    // 1.15 — medium risk (default)
  "lost_in_the_fog",   // 1.20 — high risk
] as const;
type RiskClassification = (typeof RISK_CLASSIFICATION_VALUES)[number];

// P6.4 — urban vs rural cost list selector. Both variants ship with identical
// pricing today; the field is forward-compatible until Jorge supplies the
// rural-only price adjustments.
const COST_LIST_VARIANT_VALUES = ["urban", "rural"] as const;
type CostListVariant = (typeof COST_LIST_VARIANT_VALUES)[number];

// M-7 — bounds checker. Returns a human field-error string on failure or
// undefined on success. Centralized so every numeric field's bounds are
// declared in one place instead of inline per route.
function bounds(
  value: unknown,
  spec: { min: number; max: number; integer?: boolean; label?: string },
): string | undefined {
  const n = Number(value);
  if (!isFinite(n)) return `${spec.label ?? "value"} must be a finite number`;
  if (spec.integer && !Number.isInteger(n)) return `${spec.label ?? "value"} must be an integer`;
  if (n < spec.min || n > spec.max) return `${spec.label ?? "value"} must be between ${spec.min} and ${spec.max}`;
  return undefined;
}

router.patch(
  "/projects/:projectId/metadata",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const project = PROJECTS.find((p) => p.id === req.params["projectId"]);
    if (!project) return res.status(404).json({ error: "not_found", message: "Project not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fieldErrors: Record<string, string> = {};

    const next = project as typeof project & {
      squareMeters?: number;
      bathrooms?: number;
      kitchens?: number;
      projectType?: ProjectType;
      contingencyPercent?: number;
      // P1.3 / P1.9 / P6.4 — extension fields.
      containerCount?: number;
      riskClassification?: RiskClassification;
      marginPercent?: number;
      costListVariant?: CostListVariant;
    };

    // M-7 — replace ad-hoc `> 0` checks with the centralized bounds helper.
    if (body["squareMeters"] !== undefined) {
      const err = bounds(body["squareMeters"], { min: 1, max: 100_000, label: "squareMeters" });
      if (err) fieldErrors["squareMeters"] = err;
      else next.squareMeters = Number(body["squareMeters"]);
    }
    if (body["bathrooms"] !== undefined) {
      const err = bounds(body["bathrooms"], { min: 0, max: 50, integer: true, label: "bathrooms" });
      if (err) fieldErrors["bathrooms"] = err;
      else next.bathrooms = Number(body["bathrooms"]);
    }
    if (body["kitchens"] !== undefined) {
      const err = bounds(body["kitchens"], { min: 0, max: 20, integer: true, label: "kitchens" });
      if (err) fieldErrors["kitchens"] = err;
      else next.kitchens = Number(body["kitchens"]);
    }
    if (body["projectType"] !== undefined) {
      const v = String(body["projectType"]);
      if (!PROJECT_TYPE_VALUES.includes(v as ProjectType)) {
        fieldErrors["projectType"] = `must be one of ${PROJECT_TYPE_VALUES.join(", ")}`;
      } else {
        next.projectType = v as ProjectType;
      }
    }
    if (body["contingencyPercent"] !== undefined) {
      const err = bounds(body["contingencyPercent"], { min: 0, max: 50, label: "contingencyPercent" });
      if (err) fieldErrors["contingencyPercent"] = err;
      else next.contingencyPercent = Number(body["contingencyPercent"]);
    }

    // P1.3 — containerCount. Triggers a calculator-entry recompute below.
    let containerCountChanged = false;
    if (body["containerCount"] !== undefined) {
      const err = bounds(body["containerCount"], { min: 1, max: 50, integer: true, label: "containerCount" });
      if (err) fieldErrors["containerCount"] = err;
      else {
        const before = next.containerCount ?? 1;
        next.containerCount = Number(body["containerCount"]);
        containerCountChanged = before !== next.containerCount;
      }
    }
    // P1.4 / Appendix A.2 — project-level margin %.
    if (body["marginPercent"] !== undefined) {
      const err = bounds(body["marginPercent"], { min: 0, max: 100, label: "marginPercent" });
      if (err) fieldErrors["marginPercent"] = err;
      else next.marginPercent = Number(body["marginPercent"]);
    }
    // P1.9 — risk classification.
    if (body["riskClassification"] !== undefined) {
      const v = String(body["riskClassification"]);
      if (!RISK_CLASSIFICATION_VALUES.includes(v as RiskClassification)) {
        fieldErrors["riskClassification"] = `must be one of ${RISK_CLASSIFICATION_VALUES.join(", ")}`;
      } else {
        next.riskClassification = v as RiskClassification;
      }
    }
    // P6.4 — cost list variant.
    if (body["costListVariant"] !== undefined) {
      const v = String(body["costListVariant"]);
      if (!COST_LIST_VARIANT_VALUES.includes(v as CostListVariant)) {
        fieldErrors["costListVariant"] = `must be one of ${COST_LIST_VARIANT_VALUES.join(", ")}`;
      } else {
        next.costListVariant = v as CostListVariant;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({
        error: "invalid_payload",
        message: "Missing or invalid fields",
        messageEs: "Faltan campos requeridos o son inválidos",
        fields: fieldErrors,
      });
    }

    // P1.3 — when containerCount changes, recompute the calculator entries
    // so material qty and lineTotal cascade through the BOM. The helper
    // awaits its own persist, so a 200 OK from this route guarantees the
    // calculator state is durable.
    if (containerCountChanged && next.containerCount !== undefined) {
      try {
        await reapplyContainerCount(project.id, next.containerCount);
      } catch (err) {
        logger.error({ err, projectId: project.id }, "containerCount: reapply failed");
        return res.status(500).json({
          error: "persist_failed",
          message: "Container count was updated but recomputing the calculator failed. Please retry.",
          messageEs: "El conteo de contenedores se actualizó pero el recálculo de la calculadora falló. Reintente.",
        });
      }
    }

    await appendActivityAndPersist(project.id, {
      type: "project_metadata_updated",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Project metadata updated for ${project.name}.`,
      descriptionEs: `Metadatos del proyecto actualizados para ${project.name}.`,
    });

    try { await persistProjectsToDb(); }
    catch { return res.status(500).json({ error: "persist_failed", message: "Metadata edits were applied in memory but failed to save. Please retry." }); }

    return res.json({
      projectId: project.id,
      squareMeters: next.squareMeters ?? 0,
      bathrooms: next.bathrooms ?? 0,
      kitchens: next.kitchens ?? 0,
      projectType: next.projectType ?? "residencial",
      contingencyPercent: next.contingencyPercent ?? 0,
      containerCount: next.containerCount ?? 1,
      marginPercent: next.marginPercent ?? 20,
      riskClassification: next.riskClassification ?? "making_a_movie",
      costListVariant: next.costListVariant ?? "urban",
    });
  },
);

// P2.2 — Report section visibility. Per the 2026-05-11 meeting:
// "activar por defecto todos los campos del reporte para el cliente,
// habilitar la selección de campos visibles mediante toggles." The
// default behavior (no row stored / empty map) is "everything visible";
// the team toggles individual sections OFF per project as needed.
const REPORT_SECTION_KEYS = [
  "metadata",
  "status_sentence",
  "phase_timeline",
  "milestones",
  "cost_plus_budget",
  "variance_report",
  "punchlist",
  "site_photos",
  "contractor_monitoring",
  "documents",
  "client_questions",
] as const;
type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

router.get(
  "/projects/:projectId/report-visibility",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) return res.status(404).json({ error: "not_found" });
    const stored = ((project as Record<string, unknown>)["reportSectionVisibility"] ?? {}) as Record<string, boolean>;
    // Default: everything visible. The map only carries OVERRIDES, so an
    // empty map means "all true" — the client UI builds its toggles from
    // REPORT_SECTION_KEYS and falls back to `true` for missing keys.
    return res.json({
      projectId,
      sections: REPORT_SECTION_KEYS.map((k) => ({
        key: k,
        visible: stored[k] !== false, // undefined → true, false → false
      })),
    });
  },
);

router.patch(
  "/projects/:projectId/report-visibility",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) return res.status(404).json({ error: "not_found" });
    const body = (req.body ?? {}) as { sections?: Record<string, boolean> };
    if (!body.sections || typeof body.sections !== "object") {
      return res.status(400).json({ error: "invalid_payload", message: "sections map required" });
    }
    // Whitelist keys to the canonical list so a malicious / typo'd payload
    // can't pollute the map with arbitrary keys.
    const sanitized: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(body.sections)) {
      if ((REPORT_SECTION_KEYS as readonly string[]).includes(k) && typeof v === "boolean") {
        sanitized[k] = v;
      }
    }
    (project as Record<string, unknown>)["reportSectionVisibility"] = sanitized;
    try { await persistProjectsToDb(); }
    catch {
      return res.status(500).json({
        error: "persist_failed",
        message: "Visibility toggles applied but failed to save. Please retry.",
        messageEs: "Cambios aplicados pero fallaron al guardar. Reintente.",
      });
    }
    return res.json({
      projectId,
      sections: REPORT_SECTION_KEYS.map((k) => ({
        key: k,
        visible: sanitized[k] !== false,
      })),
    });
  },
);

// ---------------------------------------------------------------------------
// Task #127 — Site visit + client interaction logs
// New manual log endpoints. Both write a single ProjectActivity which the
// Asana sync hook (when configured) mirrors into the linked Asana task.
// ---------------------------------------------------------------------------

type SiteVisitChannel = "site" | "remote";

// P3.1 — Site visits are now first-class records with header (this route)
// + per-item attachments (photos, audios, videos, notes). Items reference
// existing project_documents IDs (for binary uploads) or carry inline text.
//
// In-memory store keyed by projectId → list of visits. Each visit has its
// own items[] array. This is the V1 shape; Session 4 will migrate to the
// new `site_visits` + `site_visit_items` Drizzle tables.
interface SiteVisitItem {
  id: string;
  itemType: "photo" | "audio" | "video" | "note";
  documentId?: string;
  noteText?: string;
  clientVisible: boolean;
  createdAt: string;
}
interface SiteVisit {
  id: string;
  projectId: string;
  visitor: string;
  visitDate: string;
  channel: SiteVisitChannel;
  notes?: string;
  items: SiteVisitItem[];
  createdAt: string;
  driveFolderId?: string;
}
const SITE_VISITS: Record<string, SiteVisit[]> = {};

function defaultClientVisible(itemType: SiteVisitItem["itemType"]): boolean {
  // Per P3.4 / Session 2 acceptance criteria:
  //   photos / videos → client-visible by default (the cover-photo flow)
  //   audios / notes  → internal-only by default (candid commentary)
  if (itemType === "audio" || itemType === "note") return false;
  return true;
}

router.get(
  "/projects/:projectId/site-visits",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    const role = (req as { user?: { role?: string } }).user?.role;
    const visits = SITE_VISITS[projectId] ?? [];
    if (role === "client") {
      // Clients only see items flagged client-visible.
      return res.json({
        projectId,
        visits: visits.map((v) => ({ ...v, items: v.items.filter((i) => i.clientVisible) })),
      });
    }
    return res.json({ projectId, visits });
  },
);

router.post(
  "/projects/:projectId/site-visits",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const body = (req.body ?? {}) as {
      visitDate?: string; visitor?: string; note?: string; channel?: SiteVisitChannel;
      // P3.1 — optional initial items array. Each item is either a
      // document reference (photo/audio/video already uploaded via the
      // /documents endpoint) or an inline note. Items can also be added
      // later via POST /projects/:projectId/site-visits/:visitId/items.
      items?: Array<{
        itemType?: "photo" | "audio" | "video" | "note";
        documentId?: string;
        noteText?: string;
        clientVisible?: boolean;
      }>;
    };
    const visitor = typeof body.visitor === "string" ? body.visitor.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
    const visitDate = typeof body.visitDate === "string" ? body.visitDate.trim() : "";
    const channel: SiteVisitChannel = body.channel === "remote" ? "remote" : "site";
    if (!visitor || !visitDate) {
      return res.status(400).json({ error: "bad_request", message: "visitor and visitDate are required" });
    }
    if (Number.isNaN(Date.parse(visitDate))) {
      return res.status(400).json({ error: "bad_request", message: "visitDate must be ISO-8601" });
    }
    // P3.1 — synthesize the visit row + items[]. Each item gets a stable id
    // derived from the visit id + index so reordering/identification stays
    // deterministic across re-renders.
    const visitId = `sv-${projectId}-${Date.now()}`;
    const items: SiteVisitItem[] = Array.isArray(body.items)
      ? body.items.map((raw, i) => {
          const itemType: SiteVisitItem["itemType"] =
            raw.itemType === "audio" || raw.itemType === "video" || raw.itemType === "note"
              ? raw.itemType
              : "photo";
          return {
            id: `${visitId}-item-${i + 1}`,
            itemType,
            ...(raw.documentId ? { documentId: String(raw.documentId).slice(0, 200) } : {}),
            ...(raw.noteText ? { noteText: String(raw.noteText).slice(0, 5000) } : {}),
            clientVisible: typeof raw.clientVisible === "boolean"
              ? raw.clientVisible
              : defaultClientVisible(itemType),
            createdAt: new Date().toISOString(),
          };
        })
      : [];
    const visit: SiteVisit = {
      id: visitId,
      projectId,
      visitor,
      visitDate,
      channel,
      ...(note ? { notes: note } : {}),
      items,
      createdAt: new Date().toISOString(),
    };
    SITE_VISITS[projectId] = [...(SITE_VISITS[projectId] ?? []), visit];

    const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
    const channelEn = channel === "remote" ? "remote check" : "on-site visit";
    const channelEs = channel === "remote" ? "revisión remota" : "visita al sitio";
    const itemCount = items.length;
    await appendActivityAndPersist(projectId, {
      type: "site_visit_logged",
      actor,
      description: `${channelEn} on ${visitDate} by ${visitor}${note ? `: ${note}` : ""}${itemCount > 0 ? ` · ${itemCount} item(s)` : ""}`,
      descriptionEs: `${channelEs} el ${visitDate} por ${visitor}${note ? `: ${note}` : ""}${itemCount > 0 ? ` · ${itemCount} ítem(s)` : ""}`,
    });
    res.status(201).json(visit);
  },
);

// P3.4 — toggle a single item's client-visibility on/off.
router.patch(
  "/projects/:projectId/site-visits/:visitId/items/:itemId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const visit = (SITE_VISITS[projectId] ?? []).find((v) => v.id === req.params["visitId"]);
    if (!visit) return res.status(404).json({ error: "not_found", message: "Visit not found" });
    const item = visit.items.find((i) => i.id === req.params["itemId"]);
    if (!item) return res.status(404).json({ error: "not_found", message: "Item not found" });
    const body = (req.body ?? {}) as { clientVisible?: boolean };
    if (typeof body.clientVisible === "boolean") item.clientVisible = body.clientVisible;
    return res.json(item);
  },
);

// P3.1 — Add an item to an existing visit (e.g. user records audio after
// the visit was first saved). The audio/photo binary is uploaded via the
// /documents endpoint; this route only carries the metadata link.
router.post(
  "/projects/:projectId/site-visits/:visitId/items",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const visit = (SITE_VISITS[projectId] ?? []).find((v) => v.id === req.params["visitId"]);
    if (!visit) return res.status(404).json({ error: "not_found", message: "Visit not found" });
    const body = (req.body ?? {}) as {
      itemType?: "photo" | "audio" | "video" | "note";
      documentId?: string;
      noteText?: string;
      clientVisible?: boolean;
    };
    const itemType: SiteVisitItem["itemType"] =
      body.itemType === "audio" || body.itemType === "video" || body.itemType === "note"
        ? body.itemType
        : "photo";
    const item: SiteVisitItem = {
      id: `${visit.id}-item-${visit.items.length + 1}`,
      itemType,
      ...(body.documentId ? { documentId: String(body.documentId).slice(0, 200) } : {}),
      ...(body.noteText ? { noteText: String(body.noteText).slice(0, 5000) } : {}),
      clientVisible: typeof body.clientVisible === "boolean"
        ? body.clientVisible
        : defaultClientVisible(itemType),
      createdAt: new Date().toISOString(),
    };
    visit.items.push(item);
    res.status(201).json(item);
  },
);

type ClientChannel = "call" | "meeting" | "email" | "whatsapp";
const VALID_CHANNELS: ClientChannel[] = ["call", "meeting", "email", "whatsapp"];

router.post(
  "/projects/:projectId/client-interactions",
  requireRole(["team", "admin", "superadmin", "architect"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const body = (req.body ?? {}) as {
      occurredAt?: string; channel?: ClientChannel; with?: string; note?: string;
    };
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt.trim() : "";
    const channel = body.channel as ClientChannel;
    const withWhom = typeof body.with === "string" ? body.with.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if (!occurredAt || !channel || !withWhom) {
      return res.status(400).json({ error: "bad_request", message: "occurredAt, channel, with are required" });
    }
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: "bad_request", message: "channel must be call|meeting|email|whatsapp" });
    }
    if (Number.isNaN(Date.parse(occurredAt))) {
      return res.status(400).json({ error: "bad_request", message: "occurredAt must be ISO-8601" });
    }
    const channelEn = { call: "Call", meeting: "Meeting", email: "Email", whatsapp: "WhatsApp" }[channel];
    const channelEs = { call: "Llamada", meeting: "Reunión", email: "Email", whatsapp: "WhatsApp" }[channel];
    const actor = (req as { user?: { name?: string } }).user?.name ?? "Team";
    const entry = await appendActivityAndPersist(projectId, {
      type: "client_interaction_logged",
      actor,
      description: `${channelEn} with ${withWhom} on ${occurredAt}${note ? `: ${note}` : ""}`,
      descriptionEs: `${channelEs} con ${withWhom} el ${occurredAt}${note ? `: ${note}` : ""}`,
    });
    res.status(201).json(entry);
  },
);

// ---------------------------------------------------------------------------
// Asana task picker for projects whose asanaGid is unset / stale.
// ---------------------------------------------------------------------------
router.get(
  "/projects/:projectId/asana-candidates",
  requireRole(["team", "admin", "superadmin"]),
  async (_req, res) => {
    if (!isAsanaEnabled()) {
      return res.status(412).json({ error: "not_configured", message: "Asana integration is not configured." });
    }
    const cfg = getAsanaConfig();
    try {
      const candidates = await listTasksForProject(cfg.boardGid as string, 100);
      res.json({ candidates });
    } catch (err) {
      if (err instanceof AsanaNotConnectedError) {
        return res.status(412).json({ error: "not_connected", message: err.message });
      }
      if (err instanceof AsanaApiError) {
        return res.status(502).json({ error: "asana_error", status: err.status, message: err.message });
      }
      return res.status(500).json({ error: "internal", message: (err as Error).message });
    }
  },
);

router.post(
  "/projects/:projectId/asana-link",
  requireRole(["team", "admin", "superadmin"]),
  async (req, res) => {
    const projectId = req.params["projectId"] as string;
    const project = PROJECTS.find((p) => p.id === projectId) as { id: string; name: string; asanaGid?: string } | undefined;
    if (!project) {
      return res.status(404).json({ error: "not_found", message: "Project not found" });
    }
    const body = (req.body ?? {}) as { asanaGid?: unknown; asanaTaskName?: unknown };
    const gid = typeof body.asanaGid === "string" ? body.asanaGid.trim() : "";
    if (!gid) {
      return res.status(400).json({ error: "bad_request", message: "asanaGid required" });
    }
    project.asanaGid = gid;
    await persistProjectsToDb();
    const taskName = typeof body.asanaTaskName === "string" ? body.asanaTaskName.trim() : "";
    await appendActivityAndPersist(projectId, {
      type: "asana_task_linked",
      actor: (req as { user?: { name?: string } }).user?.name ?? "Team",
      description: `Project linked to Asana task ${gid}${taskName ? ` ("${taskName}")` : ""}`,
      descriptionEs: `Proyecto vinculado a tarea Asana ${gid}${taskName ? ` ("${taskName}")` : ""}`,
    });
    res.json({ projectId, asanaGid: gid });
  },
);

export default router;
