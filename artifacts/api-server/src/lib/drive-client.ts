// Thin Google Drive client used by the document upload pipeline (Task #128).
//
// We use the Drive REST API directly (no SDK) because the Replit Drive
// connector only hands us an OAuth bearer token via the credential proxy and
// the surface area we need is small: list/create folders, upload, download,
// delete, set sharing. Going direct also keeps token refresh entirely inside
// `getDriveAccessToken()`.

import { logger } from "./logger";

const CONNECTOR_NAME = "google-drive";

interface ConnectorEnvelope {
  items?: Array<{
    settings?: {
      access_token?: string;
      oauth?: { credentials?: { access_token?: string } };
    };
  }>;
}

export class DriveNotConnectedError extends Error {
  constructor(message = "Google Drive connector is not configured") {
    super(message);
    this.name = "DriveNotConnectedError";
  }
}

export class DriveApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Drive API ${status}: ${body.slice(0, 200)}`);
    this.name = "DriveApiError";
    this.status = status;
    this.body = body;
  }
}

// Returns the current OAuth access token from the Replit connector proxy.
// Throws DriveNotConnectedError if the connector isn't bound to this Repl.
export async function getDriveAccessToken(): Promise<string> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  if (!hostname) throw new DriveNotConnectedError("REPLIT_CONNECTORS_HOSTNAME not set");

  const xReplitToken = process.env["REPL_IDENTITY"]
    ? `repl ${process.env["REPL_IDENTITY"]}`
    : process.env["WEB_REPL_RENEWAL"]
      ? `depl ${process.env["WEB_REPL_RENEWAL"]}`
      : null;
  if (!xReplitToken) throw new DriveNotConnectedError("X_REPLIT_TOKEN not available");

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${CONNECTOR_NAME}`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new DriveNotConnectedError(`connector proxy ${resp.status}: ${text.slice(0, 120)}`);
  }
  const env = (await resp.json()) as ConnectorEnvelope;
  const item = env.items?.[0];
  const token =
    item?.settings?.access_token ?? item?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new DriveNotConnectedError("Drive connection has no access_token");
  return token;
}

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getDriveAccessToken();
  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    logger.warn({ url, status: resp.status, body: text.slice(0, 200) }, "drive-client: api error");
    throw new DriveApiError(resp.status, text);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

// List folders directly under a given parent (or root). Used by the Settings
// page picker so the admin can choose a workspace root folder.
export async function listFolders(parentId: string | null = null): Promise<DriveFolder[]> {
  // q syntax: "'<parent>' in parents and mimeType='...folder' and trashed=false"
  // When parentId is null we list folders the user owns at the top level
  // (parents = 'root').
  const parent = parentId ?? "root";
  const q = encodeURIComponent(
    `'${parent}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const data = await driveJson<{ files: DriveFolder[] }>(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,parents)&pageSize=100&orderBy=name`,
  );
  return data.files ?? [];
}

// Find a folder by exact name under a parent, or create it if absent.
// Idempotent — repeated calls return the same folder ID.
export async function findOrCreateFolder(
  name: string,
  parentId: string,
): Promise<DriveFolder> {
  const safeName = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${safeName}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const existing = await driveJson<{ files: DriveFolder[] }>(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,parents)&pageSize=1`,
  );
  if (existing.files && existing.files[0]) return existing.files[0];
  const created = await driveJson<DriveFolder>(`${DRIVE_API}/files?fields=id,name,parents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return created;
}

// Get a folder's metadata (used by the Settings page to show the chosen
// root folder's name even if the picker just stored the ID).
export async function getFolder(folderId: string): Promise<DriveFolder> {
  return await driveJson<DriveFolder>(
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,parents`,
  );
}

export interface UploadedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  size?: string;
}

// Upload a file via Drive's multipart endpoint. The body is sent as a single
// multipart/related request — small enough for our docs (<=10MB per upload
// modal cap), avoids the need for a resumable session.
export async function uploadFile(input: {
  folderId: string;
  name: string;
  mimeType: string;
  data: Buffer;
}): Promise<UploadedDriveFile> {
  const token = await getDriveAccessToken();
  const boundary = `konti-drive-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const metadata = {
    name: input.name,
    parents: [input.folderId],
    mimeType: input.mimeType,
  };
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${input.mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head, "utf8"), input.data, Buffer.from(tail, "utf8")]);
  const resp = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );
  const text = await resp.text();
  if (!resp.ok) {
    logger.warn(
      { status: resp.status, body: text.slice(0, 200), name: input.name },
      "drive-client: upload failed",
    );
    throw new DriveApiError(resp.status, text);
  }
  return JSON.parse(text) as UploadedDriveFile;
}

// Download a file's binary content. Used by the receipt OCR flow once a file
// already lives in Drive but the parser needs the raw bytes.
export async function downloadFile(fileId: string): Promise<Buffer> {
  const token = await getDriveAccessToken();
  const resp = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new DriveApiError(resp.status, t);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

// Returns the file's metadata, including `webViewLink` and `webContentLink`,
// which the dashboard surfaces as "Open in Drive" / "Download" buttons.
export async function getFileMetadata(fileId: string): Promise<UploadedDriveFile> {
  return await driveJson<UploadedDriveFile>(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size`,
  );
}

export async function deleteFile(fileId: string, mode: "trash" | "hard_delete"): Promise<void> {
  if (mode === "hard_delete") {
    const token = await getDriveAccessToken();
    const resp = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok && resp.status !== 404) {
      const t = await resp.text().catch(() => "");
      throw new DriveApiError(resp.status, t);
    }
    return;
  }
  // Trash — patch trashed=true (Drive recovers from the user's UI).
  await driveJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

// Apply a sharing policy to a file. "private" removes any anyone-link
// permission so only the owner (and explicit grants) can read; "anyone_with_link"
// grants reader access via the link.
export async function setSharing(
  fileId: string,
  mode: "private" | "anyone_with_link",
): Promise<void> {
  // List current permissions so we know whether to add or revoke.
  const perms = await driveJson<{ permissions?: Array<{ id: string; type: string; role: string }> }>(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role)`,
  );
  const anyone = (perms.permissions ?? []).find((p) => p.type === "anyone");
  if (mode === "anyone_with_link") {
    if (anyone) return; // already public-with-link
    await driveJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
    return;
  }
  // Private — drop any "anyone" permission if present.
  if (anyone) {
    const token = await getDriveAccessToken();
    const resp = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(anyone.id)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok && resp.status !== 404) {
      const t = await resp.text().catch(() => "");
      throw new DriveApiError(resp.status, t);
    }
  }
}

// Test seam — used by node:test to swap the fetch implementation.
let _fetchOverride: typeof fetch | null = null;
export function _setFetchForTests(impl: typeof fetch | null): void {
  _fetchOverride = impl;
  if (impl) {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = impl;
  }
}
export function _resetFetchForTests(originalFetch: typeof fetch): void {
  _fetchOverride = null;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
}
