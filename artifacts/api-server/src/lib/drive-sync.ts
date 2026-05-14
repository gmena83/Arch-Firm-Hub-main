// High-level Drive integration glue (Task #128). Owns folder bootstrap,
// per-document upload/delete, sharing toggles, and the backfill walker.
//
// All entry points are no-ops when Drive is not enabled — callers can wrap
// every interaction with `if (isDriveEnabled())` and rely on these helpers
// to be idempotent.

import { logger } from "./logger";
import {
  getDriveConfig,
  getDriveProjectFolder,
  setDriveProjectFolder,
  setDriveSubFolder,
  appendDriveSyncLog,
} from "./integrations-config";
import {
  findOrCreateFolder,
  uploadFile,
  deleteFile,
  setSharing,
  getFileMetadata,
  DriveNotConnectedError,
  DriveApiError,
  type UploadedDriveFile,
} from "./drive-client";

// Maps the dashboard's document `category` enum to a friendly Drive sub-folder
// name. Mirrors the team's existing email folder naming.
const SUBFOLDER_NAME: Record<string, { name: string; nameEs: string }> = {
  client_review: { name: "Client Review", nameEs: "Revisión del Cliente" },
  internal: { name: "Internal", nameEs: "Interno" },
  permits: { name: "Permits", nameEs: "Permisos" },
  construction: { name: "Construction", nameEs: "Construcción" },
  design: { name: "Design", nameEs: "Diseño" },
  contratos: { name: "Contracts", nameEs: "Contratos" },
  acuerdos_compra: { name: "Purchase Agreements", nameEs: "Acuerdos de Compra" },
  otros: { name: "Other", nameEs: "Otros" },
  // Cross-cutting buckets used by photo/receipt/report writers (#128 step 6).
  site_photos: { name: "Site Photos", nameEs: "Fotos del Sitio" },
  receipts: { name: "Receipts", nameEs: "Recibos" },
  reports: { name: "Reports", nameEs: "Reportes" },
  punchlist: { name: "Punchlist", nameEs: "Lista de Pendientes" },
};

function safeFolderName(input: string): string {
  // Drive technically allows almost anything, but we strip slashes and
  // collapse whitespace so the names render cleanly in Drive's web UI.
  return input.replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Ensures the per-project folder + per-category sub-folder exist under the
// configured workspace root. Idempotent: re-uses any folder IDs already
// stored in IntegrationsConfig.drive.projectFolders.
export async function ensureProjectCategoryFolder(input: {
  projectId: string;
  projectName: string;
  category: string;
}): Promise<{ projectFolderId: string; categoryFolderId: string }> {
  const cfg = getDriveConfig();
  if (!cfg.enabled || !cfg.rootFolderId) {
    throw new DriveNotConnectedError("Drive integration not configured");
  }
  const existing = getDriveProjectFolder(input.projectId);
  let projectFolderId = existing?.projectFolderId;
  if (!projectFolderId) {
    const folderName = `${safeFolderName(input.projectName)} [${input.projectId}]`;
    const folder = await findOrCreateFolder(folderName, cfg.rootFolderId);
    projectFolderId = folder.id;
    setDriveProjectFolder(input.projectId, {
      projectFolderId,
      subFolders: { ...(existing?.subFolders ?? {}) },
    });
  }
  // Sub-folder for the document category.
  const sub = existing?.subFolders[input.category];
  if (sub) {
    return { projectFolderId, categoryFolderId: sub };
  }
  const subName = SUBFOLDER_NAME[input.category]?.name ?? input.category;
  const subFolder = await findOrCreateFolder(safeFolderName(subName), projectFolderId);
  setDriveSubFolder(input.projectId, input.category, subFolder.id);
  return { projectFolderId, categoryFolderId: subFolder.id };
}

export interface DocumentUploadInput {
  projectId: string;
  projectName: string;
  documentId: string;
  documentName: string;
  category: string;
  mimeType: string;
  data: Buffer;
  isClientVisible: boolean;
}

export interface DocumentUploadResult {
  driveFileId: string;
  driveFolderId: string;
  driveWebViewLink: string | null;
  driveWebContentLink: string | null;
  driveThumbnailLink: string | null;
}

// Single-call helper that the upload route uses. Logs every attempt to the
// driveSyncLog so the Settings page surfaces a per-file audit trail.
export async function uploadDocumentToDrive(
  input: DocumentUploadInput,
): Promise<DocumentUploadResult> {
  const cfg = getDriveConfig();
  try {
    const { categoryFolderId } = await ensureProjectCategoryFolder({
      projectId: input.projectId,
      projectName: input.projectName,
      category: input.category,
    });
    const file = await uploadFile({
      folderId: categoryFolderId,
      name: input.documentName,
      mimeType: input.mimeType || "application/octet-stream",
      data: input.data,
    });
    if (cfg.visibilityPolicy === "anyone_with_link" && input.isClientVisible) {
      try {
        await setSharing(file.id, "anyone_with_link");
      } catch (err) {
        // Sharing failure isn't fatal — log it but keep the upload.
        logger.warn(
          { err, fileId: file.id },
          "drive-sync: setSharing failed after upload (non-fatal)",
        );
      }
    }
    appendDriveSyncLog({
      action: "upload",
      status: "ok",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: file.id,
      message: `Uploaded "${input.documentName}" to Drive`,
      messageEs: `Subió "${input.documentName}" a Drive`,
    });
    return {
      driveFileId: file.id,
      driveFolderId: categoryFolderId,
      driveWebViewLink: file.webViewLink ?? null,
      driveWebContentLink: file.webContentLink ?? null,
      driveThumbnailLink: file.thumbnailLink ?? null,
    };
  } catch (err) {
    const isApi = err instanceof DriveApiError;
    appendDriveSyncLog({
      action: "upload",
      status: "failed",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: null,
      message: `Drive upload failed: ${(err as Error).message}`.slice(0, 240),
      messageEs: `Falló la subida a Drive: ${
        isApi ? `Drive ${(err as DriveApiError).status}` : (err as Error).message
      }`.slice(0, 240),
    });
    throw err;
  }
}

// Best-effort delete. Returns true on success, false on failure (the caller
// still removes the dashboard record so a Drive outage doesn't strand the
// document in the UI).
export async function deleteDocumentFromDrive(input: {
  projectId: string;
  projectName: string;
  documentId: string;
  documentName: string;
  driveFileId: string;
}): Promise<boolean> {
  const cfg = getDriveConfig();
  const mode = cfg.deletePolicy;
  try {
    await deleteFile(input.driveFileId, mode);
    appendDriveSyncLog({
      action: "delete",
      status: "ok",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: input.driveFileId,
      message: mode === "trash"
        ? `Trashed "${input.documentName}" in Drive`
        : `Deleted "${input.documentName}" from Drive`,
      messageEs: mode === "trash"
        ? `Movió "${input.documentName}" a la papelera de Drive`
        : `Eliminó "${input.documentName}" de Drive`,
    });
    return true;
  } catch (err) {
    appendDriveSyncLog({
      action: "delete",
      status: "failed",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: input.driveFileId,
      message: `Drive delete failed: ${(err as Error).message}`.slice(0, 240),
      messageEs: `Falló la eliminación en Drive: ${(err as Error).message}`.slice(0, 240),
    });
    return false;
  }
}

// Visibility toggle hook — propagates the dashboard's isClientVisible flag
// to the Drive file's sharing policy. Best-effort: failure is logged, never
// thrown, because the dashboard's local flag is the source of truth.
export async function applyVisibilityToDrive(input: {
  projectId: string;
  projectName: string;
  documentId: string;
  documentName: string;
  driveFileId: string;
  isClientVisible: boolean;
}): Promise<boolean> {
  const cfg = getDriveConfig();
  if (cfg.visibilityPolicy !== "anyone_with_link") {
    // In private mode there's nothing to do — files always stay private and
    // the dashboard handles the visibility flag itself.
    return true;
  }
  const mode = input.isClientVisible ? "anyone_with_link" : "private";
  try {
    await setSharing(input.driveFileId, mode);
    appendDriveSyncLog({
      action: "visibility",
      status: "ok",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: input.driveFileId,
      message: input.isClientVisible
        ? `Shared "${input.documentName}" with anyone-with-link`
        : `Made "${input.documentName}" private in Drive`,
      messageEs: input.isClientVisible
        ? `Compartió "${input.documentName}" con cualquiera con el enlace`
        : `Hizo "${input.documentName}" privado en Drive`,
    });
    return true;
  } catch (err) {
    appendDriveSyncLog({
      action: "visibility",
      status: "failed",
      projectId: input.projectId,
      projectName: input.projectName,
      documentId: input.documentId,
      documentName: input.documentName,
      driveFileId: input.driveFileId,
      message: `Drive sharing update failed: ${(err as Error).message}`.slice(0, 240),
      messageEs: `Falló la actualización del compartido: ${(err as Error).message}`.slice(0, 240),
    });
    return false;
  }
}

// Refresh a stale Drive file's metadata (useful after the team renames a file
// inside Drive). Returns null if the file is gone.
export async function refreshDriveFileMetadata(
  fileId: string,
): Promise<UploadedDriveFile | null> {
  try {
    return await getFileMetadata(fileId);
  } catch (err) {
    if (err instanceof DriveApiError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// First-connect provisioning (Task #128)
// ---------------------------------------------------------------------------

// The fixed sub-folder taxonomy that every per-project folder gets at first
// connect. These are the canonical Drive folders the spec calls out — each
// maps onto one of the dashboard's document-category buckets so future
// uploads land in a folder that already exists.
export const STANDARD_PROJECT_SUBFOLDERS: ReadonlyArray<string> = [
  "permits",
  "contratos",
  "site_photos",
  "reports",
  "receipts",
  "punchlist",
  "otros",
];

export interface ProvisionResult {
  projectId: string;
  status: "ok" | "failed";
  message: string;
}

// Walks every project and ensures its per-project folder + the canonical
// sub-folder set exists in Drive. Idempotent: re-uses any folder ID already
// stored on `IntegrationsConfig.drive.projectFolders`.
export async function provisionAllProjectFolders(
  projects: ReadonlyArray<{ id: string; name: string }>,
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];
  for (const proj of projects) {
    try {
      for (const cat of STANDARD_PROJECT_SUBFOLDERS) {
        await ensureProjectCategoryFolder({
          projectId: proj.id,
          projectName: proj.name,
          category: cat,
        });
      }
      results.push({
        projectId: proj.id,
        status: "ok",
        message: `Provisioned ${STANDARD_PROJECT_SUBFOLDERS.length} sub-folders for "${proj.name}"`,
      });
    } catch (err) {
      results.push({
        projectId: proj.id,
        status: "failed",
        message: `Provisioning failed: ${(err as Error).message}`,
      });
    }
  }
  appendDriveSyncLog({
    action: "first_connect_provision",
    status: results.some((r) => r.status === "failed") ? "failed" : "ok",
    projectId: null,
    projectName: null,
    documentId: null,
    documentName: null,
    driveFileId: null,
    message: `Provisioned folders for ${results.filter((r) => r.status === "ok").length}/${results.length} project(s)`,
    messageEs: `Carpetas creadas para ${results.filter((r) => r.status === "ok").length}/${results.length} proyecto(s)`,
  });
  return results;
}

// ---------------------------------------------------------------------------
// Backfill walker
// ---------------------------------------------------------------------------

export interface BackfillDocument {
  projectId: string;
  projectName: string;
  documentId: string;
  documentName: string;
  category: string;
  mimeType: string;
  /** Pre-existing Drive file ID — backfill is a no-op if present (idempotent). */
  driveFileId?: string | null;
  /** Source bytes (decoded base64 imageUrl, or empty buffer for placeholders). */
  data: Buffer;
  isClientVisible: boolean;
}

export interface BackfillResult {
  documentId: string;
  status: "uploaded" | "skipped" | "failed";
  driveFileId: string | null;
  message: string;
}

// Walks the supplied document list and uploads each one to Drive. Skips any
// document that already has a `driveFileId` (idempotency invariant) so the
// admin can re-run safely. Returns a per-document status array; the caller
// is responsible for writing the new IDs back to the dashboard's data store.
export async function backfillDocuments(
  docs: BackfillDocument[],
  onProgress?: (result: BackfillResult) => void,
): Promise<BackfillResult[]> {
  const results: BackfillResult[] = [];
  for (const doc of docs) {
    if (doc.driveFileId) {
      const r: BackfillResult = {
        documentId: doc.documentId,
        status: "skipped",
        driveFileId: doc.driveFileId,
        message: "Already has driveFileId",
      };
      results.push(r);
      onProgress?.(r);
      appendDriveSyncLog({
        action: "backfill_file",
        status: "skipped",
        projectId: doc.projectId,
        projectName: doc.projectName,
        documentId: doc.documentId,
        documentName: doc.documentName,
        driveFileId: doc.driveFileId,
        message: `Skipped (already in Drive): "${doc.documentName}"`,
        messageEs: `Omitido (ya en Drive): "${doc.documentName}"`,
      });
      continue;
    }
    if (doc.data.length === 0) {
      const r: BackfillResult = {
        documentId: doc.documentId,
        status: "skipped",
        driveFileId: null,
        message: "Empty payload (no source bytes available)",
      };
      results.push(r);
      onProgress?.(r);
      appendDriveSyncLog({
        action: "backfill_file",
        status: "skipped",
        projectId: doc.projectId,
        projectName: doc.projectName,
        documentId: doc.documentId,
        documentName: doc.documentName,
        driveFileId: null,
        message: `Skipped (no source bytes): "${doc.documentName}"`,
        messageEs: `Omitido (sin datos): "${doc.documentName}"`,
      });
      continue;
    }
    try {
      const upload = await uploadDocumentToDrive({
        projectId: doc.projectId,
        projectName: doc.projectName,
        documentId: doc.documentId,
        documentName: doc.documentName,
        category: doc.category,
        mimeType: doc.mimeType,
        data: doc.data,
        isClientVisible: doc.isClientVisible,
      });
      const r: BackfillResult = {
        documentId: doc.documentId,
        status: "uploaded",
        driveFileId: upload.driveFileId,
        message: `Uploaded "${doc.documentName}"`,
      };
      results.push(r);
      onProgress?.(r);
    } catch (err) {
      const r: BackfillResult = {
        documentId: doc.documentId,
        status: "failed",
        driveFileId: null,
        message: `Failed: ${(err as Error).message}`,
      };
      results.push(r);
      onProgress?.(r);
      // uploadDocumentToDrive already wrote a `upload` failed entry; we add a
      // dedicated `backfill_file` failed entry for the admin's audit trail.
      appendDriveSyncLog({
        action: "backfill_file",
        status: "failed",
        projectId: doc.projectId,
        projectName: doc.projectName,
        documentId: doc.documentId,
        documentName: doc.documentName,
        driveFileId: null,
        message: `Backfill failed: ${(err as Error).message}`.slice(0, 240),
        messageEs: `Falló el backfill: ${(err as Error).message}`.slice(0, 240),
      });
    }
  }
  // Summary entry for the run.
  const uploaded = results.filter((r) => r.status === "uploaded").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  appendDriveSyncLog({
    action: "backfill_summary",
    status: failed > 0 ? "failed" : "ok",
    projectId: null,
    projectName: null,
    documentId: null,
    documentName: null,
    driveFileId: null,
    message: `Backfill: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`,
    messageEs: `Backfill: ${uploaded} subidos, ${skipped} omitidos, ${failed} fallidos`,
  });
  return results;
}
