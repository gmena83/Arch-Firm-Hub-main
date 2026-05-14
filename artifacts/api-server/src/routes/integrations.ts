// Settings → Integrations API surface (Task #127).
//
// All routes are admin/superadmin gated. Read endpoints return the current
// connection state; write endpoints persist the chosen workspace + board so
// the sync queue can drain into Asana.

import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/require-role";
import {
  getAsanaConfig,
  updateAsanaConfig,
  getSyncLog,
  findSyncLogEntry,
  enqueueJob,
  listQueue,
  getDriveConfig,
  updateDriveConfig,
  getDriveSyncLog,
  clearDriveProjectFolders,
} from "../lib/integrations-config";
import {
  listWorkspaces,
  listProjectsForWorkspace,
  AsanaNotConnectedError,
  AsanaApiError,
  getAsanaAccessToken,
} from "../lib/asana-client";
import {
  getDriveAccessToken,
  listFolders as listDriveFolders,
  findOrCreateFolder as findOrCreateDriveFolder,
  getFolder as getDriveFolder,
  downloadFile as downloadDriveFile,
  getFileMetadata as getDriveFileMetadata,
  DriveNotConnectedError,
  DriveApiError,
} from "../lib/drive-client";
import { drainQueue } from "../lib/asana-sync";
import {
  backfillDocuments,
  provisionAllProjectFolders,
  type BackfillDocument,
} from "../lib/drive-sync";
import { DOCUMENTS, PROJECTS } from "../data/seed";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ROLES = ["admin", "superadmin"] as const;

// Quick "is the connector even reachable" probe. Doesn't depend on board
// configuration — used by the Settings page to render Connect / Connected.
router.get("/integrations/asana/status", requireRole([...ADMIN_ROLES]), async (_req, res) => {
  const cfg = getAsanaConfig();
  let connected = false;
  let connectionMessage = "Not connected. Use the Replit Asana connector to authorize.";
  let connectionMessageEs = "No conectado. Autoriza el conector Asana de Replit.";
  try {
    await getAsanaAccessToken();
    connected = true;
    connectionMessage = "Connector authorized.";
    connectionMessageEs = "Conector autorizado.";
  } catch (err) {
    if (err instanceof AsanaNotConnectedError) {
      connectionMessage = err.message;
    } else {
      connectionMessage = (err as Error).message ?? connectionMessage;
    }
  }
  // `configured` is true once the admin has picked a workspace + board AND
  // toggled the integration on. UI uses this to decide whether to show the
  // "Link to Asana task" button (which depends on board, not on connector).
  const configured = Boolean(cfg.enabled && cfg.workspaceGid && cfg.boardGid);
  res.json({
    connected,
    configured,
    connectionMessage,
    connectionMessageEs,
    config: cfg,
  });
});

router.get("/integrations/asana/workspaces", requireRole([...ADMIN_ROLES]), async (_req, res) => {
  try {
    const data = await listWorkspaces();
    res.json({ workspaces: data });
  } catch (err) {
    if (err instanceof AsanaNotConnectedError) {
      return res.status(412).json({ error: "not_connected", message: err.message });
    }
    if (err instanceof AsanaApiError) {
      return res.status(502).json({ error: "asana_error", status: err.status, message: err.message });
    }
    return res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

router.get("/integrations/asana/boards", requireRole([...ADMIN_ROLES]), async (req, res) => {
  const workspaceGid = String(req.query["workspaceGid"] ?? "");
  if (!workspaceGid) {
    return res.status(400).json({ error: "bad_request", message: "workspaceGid query param required" });
  }
  try {
    const data = await listProjectsForWorkspace(workspaceGid);
    res.json({ boards: data });
  } catch (err) {
    if (err instanceof AsanaNotConnectedError) {
      return res.status(412).json({ error: "not_connected", message: err.message });
    }
    if (err instanceof AsanaApiError) {
      return res.status(502).json({ error: "asana_error", status: err.status, message: err.message });
    }
    return res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

// Save the chosen workspace + board and flip the integration on. The
// dashboardBaseUrl is captured so deep-link URLs in Asana comments are
// absolute (e.g. https://abc-def.replit.dev). If the admin doesn't supply
// one, we derive it from the request — first preference is the Origin
// header (sent by the browser when the admin clicks Save in the panel),
// falling back to REPLIT_DEV_DOMAIN. Without an absolute URL the comments
// would contain bare paths like "/konti-dashboard/..." which are useless
// from inside Asana.
function deriveDashboardBaseUrl(req: { get(name: string): string | undefined }): string | null {
  const origin = req.get("origin");
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  const referer = req.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch { /* fall through */ }
  }
  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (replitDomain) return `https://${replitDomain}`;
  return null;
}

router.post("/integrations/asana/configure", requireRole([...ADMIN_ROLES]), (req, res) => {
  const body = (req.body ?? {}) as {
    workspaceGid?: unknown; workspaceName?: unknown;
    boardGid?: unknown; boardName?: unknown;
    defaultAssigneeGid?: unknown; dashboardBaseUrl?: unknown;
  };
  const workspaceGid = typeof body.workspaceGid === "string" ? body.workspaceGid.trim() : "";
  const boardGid = typeof body.boardGid === "string" ? body.boardGid.trim() : "";
  if (!workspaceGid || !boardGid) {
    return res.status(400).json({ error: "bad_request", message: "workspaceGid and boardGid required" });
  }
  const user = (req as { user?: { name?: string } }).user;
  const explicitBaseUrl =
    typeof body.dashboardBaseUrl === "string" && body.dashboardBaseUrl.length > 0
      ? body.dashboardBaseUrl.replace(/\/+$/, "").slice(0, 200)
      : null;
  const next = updateAsanaConfig({
    enabled: true,
    workspaceGid,
    boardGid,
    workspaceName: typeof body.workspaceName === "string" ? body.workspaceName.slice(0, 200) : null,
    boardName: typeof body.boardName === "string" ? body.boardName.slice(0, 200) : null,
    defaultAssigneeGid:
      typeof body.defaultAssigneeGid === "string" && body.defaultAssigneeGid.length > 0
        ? body.defaultAssigneeGid.slice(0, 64)
        : null,
    dashboardBaseUrl: explicitBaseUrl ?? deriveDashboardBaseUrl(req),
    connectedAt: new Date().toISOString(),
    connectedBy: user?.name ?? "Admin",
  });
  res.json({ config: next });
});

router.post("/integrations/asana/disconnect", requireRole([...ADMIN_ROLES]), (_req, res) => {
  const next = updateAsanaConfig({
    enabled: false,
    workspaceGid: null,
    workspaceName: null,
    boardGid: null,
    boardName: null,
    defaultAssigneeGid: null,
    dashboardBaseUrl: null,
    connectedAt: null,
    connectedBy: null,
  });
  res.json({ config: next });
});

router.get("/integrations/asana/sync-log", requireRole([...ADMIN_ROLES]), (_req, res) => {
  res.json({ entries: getSyncLog(), queueLength: listQueue().length });
});

// Re-enqueue a previously failed/skipped log entry so the next drain tick
// retries it. The entry stays in the log (for the audit trail) but a fresh
// queue job is created with attempts=0.
router.post("/integrations/asana/sync-log/:id/retry", requireRole([...ADMIN_ROLES]), async (req, res) => {
  const id = req.params["id"] as string;
  const entry = findSyncLogEntry(id);
  if (!entry) {
    return res.status(404).json({ error: "not_found", message: "Sync log entry not found" });
  }
  enqueueJob({
    projectId: entry.projectId,
    activity: {
      id: entry.payload.activityId,
      timestamp: new Date().toISOString(),
      type: entry.payload.type,
      actor: entry.payload.actor,
      description: entry.payload.description,
      descriptionEs: entry.payload.descriptionEs,
    },
  });
  // Best-effort drain so a manual retry feels immediate.
  void drainQueue().catch(() => undefined);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Drive integration (Task #128)
// ---------------------------------------------------------------------------

router.get("/integrations/drive/status", requireRole([...ADMIN_ROLES]), async (_req, res) => {
  const cfg = getDriveConfig();
  let connected = false;
  let connectionMessage = "Not connected. Use the Replit Google Drive connector to authorize.";
  let connectionMessageEs = "No conectado. Autoriza el conector de Google Drive de Replit.";
  try {
    await getDriveAccessToken();
    connected = true;
    connectionMessage = "Connector authorized.";
    connectionMessageEs = "Conector autorizado.";
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      connectionMessage = err.message;
    } else {
      connectionMessage = (err as Error).message ?? connectionMessage;
    }
  }
  const configured = Boolean(cfg.enabled && cfg.rootFolderId);
  res.json({
    connected,
    configured,
    connectionMessage,
    connectionMessageEs,
    config: cfg,
  });
});

// List folders directly under a Drive parent (or root). Used by the Settings
// UI's root-folder picker. `parentId` query is optional — defaults to "root".
router.get("/integrations/drive/folders", requireRole([...ADMIN_ROLES]), async (req, res) => {
  const parentId =
    typeof req.query["parentId"] === "string" && req.query["parentId"].length > 0
      ? (req.query["parentId"] as string)
      : null;
  try {
    const folders = await listDriveFolders(parentId);
    res.json({ folders, parentId });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return res.status(412).json({ error: "not_connected", message: err.message });
    }
    if (err instanceof DriveApiError) {
      return res.status(502).json({ error: "drive_error", status: err.status, message: err.message });
    }
    return res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

// Save the chosen root folder (and optionally create a brand-new folder
// `KONTi Dashboard` under My Drive if `createName` is supplied). Flips the
// integration on so subsequent uploads route to Drive.
router.post("/integrations/drive/configure", requireRole([...ADMIN_ROLES]), async (req, res) => {
  const body = (req.body ?? {}) as {
    rootFolderId?: unknown;
    rootFolderName?: unknown;
    createName?: unknown;
    visibilityPolicy?: unknown;
    deletePolicy?: unknown;
  };
  let rootFolderId =
    typeof body.rootFolderId === "string" ? body.rootFolderId.trim() : "";
  let rootFolderName =
    typeof body.rootFolderName === "string" ? body.rootFolderName.slice(0, 200) : "";
  const createName =
    typeof body.createName === "string" ? body.createName.trim().slice(0, 120) : "";
  // Either pick an existing folder OR create one — at least one is required.
  if (!rootFolderId && !createName) {
    return res.status(400).json({
      error: "bad_request",
      message: "Provide rootFolderId (existing folder) or createName (new folder).",
    });
  }
  try {
    if (!rootFolderId && createName) {
      // Create under "root" (My Drive). Idempotent — if an admin clicks
      // Connect twice with the same name they get the same folder back.
      const folder = await findOrCreateDriveFolder(createName, "root");
      rootFolderId = folder.id;
      rootFolderName = folder.name;
    } else if (rootFolderId && !rootFolderName) {
      // Resolve the chosen folder's display name so the UI doesn't have to.
      try {
        const f = await getDriveFolder(rootFolderId);
        rootFolderName = f.name;
      } catch {
        rootFolderName = "Drive folder";
      }
    }
    const visibilityPolicy =
      body.visibilityPolicy === "private" || body.visibilityPolicy === "anyone_with_link"
        ? body.visibilityPolicy
        : "anyone_with_link";
    const deletePolicy =
      body.deletePolicy === "trash" || body.deletePolicy === "hard_delete"
        ? body.deletePolicy
        : "trash";
    const user = (req as { user?: { name?: string } }).user;
    const previousCfg = getDriveConfig();
    const wasFirstConnect = !previousCfg.firstConnectCompletedAt;
    // Reconnect safety. The per-project folder map was built under the
    // *previous* Drive root — if the admin is now picking a different root
    // (including the disconnect → reconnect-to-different-root flow, where
    // `rootFolderId` was nulled out by /disconnect but
    // `lastConfiguredRootFolderId` still remembers the old value), the
    // cached folder IDs point at folders in the OLD root and would
    // silently misroute uploads into a different Drive workspace. Wipe
    // the map so the next upload re-provisions under the new root.
    // Reconnects to the SAME root keep the map for free.
    const lastRoot = previousCfg.lastConfiguredRootFolderId;
    if (
      lastRoot &&
      lastRoot !== rootFolderId &&
      Object.keys(previousCfg.projectFolders).length > 0
    ) {
      clearDriveProjectFolders();
      logger.info(
        { previousRoot: lastRoot, newRoot: rootFolderId },
        "drive: root folder changed on reconnect — cleared per-project folder map",
      );
    }
    let next = updateDriveConfig({
      enabled: true,
      rootFolderId,
      rootFolderName,
      visibilityPolicy,
      deletePolicy,
      connectedAt: new Date().toISOString(),
      connectedBy: user?.name ?? "Admin",
      // Track the root we just connected to so future reconnect-after-
      // disconnect flows can detect a root change even after `rootFolderId`
      // was nulled by /disconnect.
      lastConfiguredRootFolderId: rootFolderId,
    });
    // First-connect bootstrap (Task #128). On the very first successful
    // connect we (a) provision the canonical per-project sub-folder set in
    // Drive and (b) run an idempotent backfill of any in-memory document
    // that does not yet have a driveFileId. Both steps are run-once —
    // gated by `firstConnectCompletedAt` — so a re-connect after disconnect
    // does not re-trigger the (potentially long) bootstrap. Failures here
    // do NOT roll back the connection: connect succeeds and the admin can
    // re-run the bootstrap manually from the Settings page.
    let firstConnectBootstrap:
      | { provisioned: number; provisionFailed: number; uploaded: number; skipped: number; failed: number }
      | undefined;
    if (wasFirstConnect) {
      try {
        const provisionResults = await provisionAllProjectFolders(PROJECTS);
        const backfillResults = await backfillDocuments(flattenDocsForBackfill());
        applyBackfillResultsToDocs(backfillResults);
        firstConnectBootstrap = {
          provisioned: provisionResults.filter((r) => r.status === "ok").length,
          provisionFailed: provisionResults.filter((r) => r.status === "failed").length,
          uploaded: backfillResults.filter((r) => r.status === "uploaded").length,
          skipped: backfillResults.filter((r) => r.status === "skipped").length,
          failed: backfillResults.filter((r) => r.status === "failed").length,
        };
      } catch (err) {
        logger.warn(
          { err },
          "drive: first-connect bootstrap failed (connection itself stays up)",
        );
      }
      // Persist the run-once marker even if the bootstrap partially failed —
      // the admin can rerun via the manual Backfill button. This avoids
      // re-running the heavy walk on every subsequent restart/connect.
      next = updateDriveConfig({ firstConnectCompletedAt: new Date().toISOString() });
    }
    res.json({ config: next, ...(firstConnectBootstrap ? { firstConnectBootstrap } : {}) });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return res.status(412).json({ error: "not_connected", message: err.message });
    }
    if (err instanceof DriveApiError) {
      return res.status(502).json({ error: "drive_error", status: err.status, message: err.message });
    }
    return res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

router.post("/integrations/drive/disconnect", requireRole([...ADMIN_ROLES]), (_req, res) => {
  // Disconnect clears the configured folder + flag but **keeps** the per-
  // project folder map so a re-connect doesn't re-create folders that are
  // still in Drive (or strand existing files outside the new root). Admin
  // can manually wipe the map by editing `.data/integrations.json` if they
  // are intentionally moving Drives.
  const next = updateDriveConfig({
    enabled: false,
    rootFolderId: null,
    rootFolderName: null,
    connectedAt: null,
    connectedBy: null,
  });
  res.json({ config: next });
});

router.get("/integrations/drive/sync-log", requireRole([...ADMIN_ROLES]), (_req, res) => {
  res.json({ entries: getDriveSyncLog() });
});

// Backfill — walks the in-memory DOCUMENTS map and uploads any document that
// doesn't yet have a `driveFileId`. Idempotent (skips already-synced docs).
// Decodes base64 `imageUrl` payloads when present; documents that only carry
// a remote http(s) URL or no source bytes are reported as "skipped" so the
// admin can see they need a manual re-upload.
// Walks the in-memory DOCUMENTS map and produces the flattened
// BackfillDocument list the drive-sync helper expects. Photos are routed to
// the canonical `site_photos` Drive folder (matches the live upload path)
// so the backfill stays consistent with new uploads.
function flattenDocsForBackfill(): BackfillDocument[] {
  const docs: BackfillDocument[] = [];
  const projectsById = new Map(PROJECTS.map((p) => [p.id, p]));
  for (const [projectId, list] of Object.entries(DOCUMENTS)) {
    const proj = projectsById.get(projectId);
    if (!proj) continue;
    for (const raw of list as Array<Record<string, unknown>>) {
      const driveFileId =
        typeof raw["driveFileId"] === "string" ? (raw["driveFileId"] as string) : null;
      const imageUrl = typeof raw["imageUrl"] === "string" ? (raw["imageUrl"] as string) : "";
      let data = Buffer.alloc(0);
      let mimeType = (raw["mimeType"] as string) || "application/octet-stream";
      if (/^data:([^;]+);base64,/.test(imageUrl)) {
        const m = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          mimeType = m[1] ?? mimeType;
          try {
            data = Buffer.from(m[2] ?? "", "base64");
          } catch {
            data = Buffer.alloc(0);
          }
        }
      }
      const docType = typeof raw["type"] === "string" ? (raw["type"] as string) : "";
      const dashboardCategory = (raw["category"] as string) ?? "otros";
      // Photos always live in `site_photos` regardless of dashboard category.
      const driveCategory = docType === "photo" ? "site_photos" : dashboardCategory;
      docs.push({
        projectId,
        projectName: proj.name,
        documentId: raw["id"] as string,
        documentName: (raw["name"] as string) ?? "untitled",
        category: driveCategory,
        mimeType,
        driveFileId,
        data,
        isClientVisible: Boolean(raw["isClientVisible"]),
      });
    }
  }
  return docs;
}

// Writes any newly-uploaded driveFileId values back onto the in-memory
// DOCUMENTS records. Shared by the manual backfill route and the
// first-connect auto-backfill triggered from /configure.
function applyBackfillResultsToDocs(
  results: ReadonlyArray<{ documentId: string; status: string; driveFileId: string | null }>,
): void {
  for (const r of results) {
    if (r.status !== "uploaded" || !r.driveFileId) continue;
    for (const list of Object.values(DOCUMENTS)) {
      const target = (list as Array<Record<string, unknown>>).find(
        (d) => d["id"] === r.documentId,
      );
      if (target) {
        target["driveFileId"] = r.driveFileId;
      }
    }
  }
}

router.post("/integrations/drive/backfill", requireRole([...ADMIN_ROLES]), async (_req, res) => {
  const cfg = getDriveConfig();
  if (!cfg.enabled || !cfg.rootFolderId) {
    return res.status(412).json({
      error: "not_configured",
      message: "Connect a Drive root folder before running backfill.",
    });
  }
  const docs = flattenDocsForBackfill();
  try {
    const results = await backfillDocuments(docs);
    // Write the new driveFileId back onto the dashboard's in-memory record so
    // subsequent reads expose the "Open in Drive" link without a restart.
    applyBackfillResultsToDocs(results);
    const summary = {
      uploaded: results.filter((r) => r.status === "uploaded").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      total: results.length,
    };
    res.json({ summary, results });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return res.status(412).json({ error: "not_connected", message: err.message });
    }
    return res.status(500).json({ error: "internal", message: (err as Error).message });
  }
});

// Download proxy (Task #128 step 6) — streams the bytes of a Drive file
// back through the API so the dashboard never has to expose Drive's
// `webContentLink` directly to the browser. Auth + role checks are enforced
// here: clients can only fetch files attached to a document that is
// (a) flagged isClientVisible AND (b) lives on a project the client owns.
// Team/admin/superadmin/architect can fetch any document the dashboard
// already exposes to them.
router.get(
  "/integrations/drive/files/:fileId/download",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  async (req, res) => {
    const fileIdRaw = req.params["fileId"];
    const fileId = (typeof fileIdRaw === "string" ? fileIdRaw : "").trim();
    if (!fileId) {
      return res.status(400).json({ error: "bad_request", message: "fileId required" });
    }
    // Find the dashboard's record for this Drive file so we can apply the
    // same visibility/ownership rules that gate /documents listing. We
    // reject the request if the file is unknown — without a record we
    // can't reason about whether the caller is allowed to see it.
    let owningProjectId: string | null = null;
    let docName = "drive-file";
    let docMime = "application/octet-stream";
    let docIsClientVisible = false;
    for (const [projectId, list] of Object.entries(DOCUMENTS)) {
      const hit = (list as Array<Record<string, unknown>>).find(
        (d) => d["driveFileId"] === fileId,
      );
      if (hit) {
        owningProjectId = projectId;
        docName = (hit["name"] as string) ?? docName;
        docMime = (hit["mimeType"] as string) ?? docMime;
        docIsClientVisible = Boolean(hit["isClientVisible"]);
        break;
      }
    }
    if (!owningProjectId) {
      return res.status(404).json({ error: "not_found", message: "Unknown Drive file" });
    }
    const user = (req as { user?: { id?: string; role?: string } }).user;
    const role = user?.role ?? "team";
    if (role === "client") {
      if (!docIsClientVisible) {
        return res.status(403).json({ error: "forbidden", message: "Document is not client-visible" });
      }
      // Mirror enforceClientOwnership: a client may only download files
      // attached to projects where they are the assigned `clientUserId`.
      const project = PROJECTS.find((p) => p.id === owningProjectId) as
        | { id: string; clientUserId?: string }
        | undefined;
      if (!project || project.clientUserId !== user?.id) {
        return res.status(403).json({ error: "forbidden", message: "Project not assigned to this client" });
      }
    }
    try {
      const bytes = await downloadDriveFile(fileId);
      // Pull MIME from Drive metadata (best-effort) so the proxy reflects
      // the live state of the file rather than the dashboard's stale guess.
      try {
        const meta = await getDriveFileMetadata(fileId);
        if (meta.mimeType) docMime = meta.mimeType;
      } catch {
        /* keep the dashboard's recorded MIME */
      }
      res.setHeader("Content-Type", docMime);
      res.setHeader("Content-Disposition", `inline; filename="${docName.replace(/"/g, "")}"`);
      // Conservative caching: short-lived so visibility revocations
      // propagate quickly, but enough to avoid hammering Drive on
      // back-to-back loads (e.g. report viewers).
      res.setHeader("Cache-Control", "private, max-age=60");
      res.send(bytes);
    } catch (err) {
      if (err instanceof DriveNotConnectedError) {
        return res.status(412).json({ error: "not_connected", message: err.message });
      }
      if (err instanceof DriveApiError) {
        // Treat Drive 404 as a dashboard 404 so the UI can surface "file
        // missing or trashed" rather than a generic upstream error.
        if (err.status === 404) {
          return res.status(404).json({ error: "drive_file_missing", message: "File no longer exists in Drive" });
        }
        return res.status(502).json({ error: "drive_error", status: err.status, message: err.message });
      }
      return res.status(500).json({ error: "internal", message: (err as Error).message });
    }
  },
);

export default router;
