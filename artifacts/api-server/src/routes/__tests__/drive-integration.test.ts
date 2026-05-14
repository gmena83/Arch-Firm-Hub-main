import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { DOCUMENTS, PROJECTS } from "../../data/seed";
import {
  updateDriveConfig,
  getDriveConfig,
  isDriveEnabled,
  getDriveSyncLog,
  setDriveProjectFolder,
  _resetForTests,
} from "../../lib/integrations-config";
import {
  uploadDocumentToDrive,
  deleteDocumentFromDrive,
  applyVisibilityToDrive,
  backfillDocuments,
  type BackfillDocument,
} from "../../lib/drive-sync";
import {
  _setFetchForTests,
  _resetFetchForTests,
  DriveNotConnectedError,
  getDriveAccessToken,
  uploadFile,
  listFolders,
} from "../../lib/drive-client";

// ---------------------------------------------------------------------------
// Test fixture: a fetch stub that knows how to answer Drive REST calls and
// the connector-proxy access-token request. Each test installs the stub at
// setup and restores the real fetch on teardown.
// ---------------------------------------------------------------------------

interface DriveFakeState {
  /** All folders ever created, keyed by id. */
  folders: Map<string, { id: string; name: string; parents: string[]; mimeType: string }>;
  /** All files ever uploaded, keyed by id. */
  files: Map<string, {
    id: string; name: string; mimeType: string; parents: string[];
    permissions: Map<string, { id: string; type: string; role: string }>;
    trashed: boolean; deleted: boolean;
  }>;
  /** Counter used to mint deterministic IDs. */
  seq: number;
  /** Track every URL the fake handled — useful for assertions. */
  calls: Array<{ method: string; url: string }>;
}

function makeDriveFake(originalFetch: typeof fetch): { state: DriveFakeState; fetch: typeof fetch } {
  const state: DriveFakeState = {
    folders: new Map(),
    files: new Map(),
    seq: 0,
    calls: [],
  };
  const nextId = (prefix: string) => `${prefix}-${++state.seq}`;
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fakeFetch: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    // Pass-through for any URL we don't own (test server, login, etc.).
    const isDriveUrl =
      url.includes("googleapis.com") || url.includes("/api/v2/connection?");
    if (!isDriveUrl) return originalFetch(input as Parameters<typeof fetch>[0], init);

    state.calls.push({ method, url });

    // Connector proxy → return a fake bearer token.
    if (url.includes("/api/v2/connection")) {
      return json(200, {
        items: [{ settings: { access_token: "fake-token-xyz" } }],
      });
    }

    // Drive: list files/folders. We only need the q= filter behavior for
    // findOrCreateFolder + listFolders.
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?") && method === "GET") {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      const folders = [...state.folders.values()].filter((f) => {
        // q is a Drive REST query; we approximate the two patterns we use.
        // Pattern 1: parent + name + folder mime
        const nameMatch = q.match(/name\s*=\s*'([^']+)'/);
        const parentMatch = q.match(/'([^']+)'\s+in\s+parents/);
        if (nameMatch && f.name !== nameMatch[1]) return false;
        if (parentMatch && !f.parents.includes(parentMatch[1] ?? "")) return false;
        if (!q.includes("application/vnd.google-apps.folder")) return false;
        if (q.includes("trashed=false") && false) return false;
        return true;
      });
      return json(200, { files: folders });
    }

    // Create a folder (POST /drive/v3/files with mimeType=folder body).
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?fields=id,name,parents") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        name: string; parents?: string[]; mimeType: string;
      };
      const id = nextId("folder");
      const folder = {
        id,
        name: body.name,
        parents: body.parents ?? [],
        mimeType: body.mimeType,
      };
      state.folders.set(id, folder);
      return json(200, folder);
    }

    // Get folder by id.
    {
      const m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\?fields=id,name,parents/);
      if (m && method === "GET") {
        const f = state.folders.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        return json(200, f);
      }
    }

    // Multipart upload.
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")) {
      // Parse the metadata fragment out of the multipart body — we only
      // need the JSON metadata block, not the binary payload.
      const raw = init?.body;
      const text = typeof raw === "string"
        ? raw
        : raw instanceof Buffer
          ? raw.toString("utf8")
          : raw instanceof Uint8Array
            ? Buffer.from(raw).toString("utf8")
            : "";
      const metaMatch = text.match(/Content-Type: application\/json[^\{]*({[\s\S]*?})\r\n--/);
      const meta = metaMatch ? JSON.parse(metaMatch[1] ?? "{}") : {};
      const id = nextId("file");
      state.files.set(id, {
        id,
        name: meta.name ?? "untitled",
        mimeType: meta.mimeType ?? "application/octet-stream",
        parents: meta.parents ?? [],
        permissions: new Map(),
        trashed: false,
        deleted: false,
      });
      return json(200, {
        id,
        name: meta.name,
        mimeType: meta.mimeType,
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
        webContentLink: `https://drive.google.com/uc?id=${id}`,
        thumbnailLink: `https://lh3.googleusercontent.com/${id}=s220`,
        size: "1024",
      });
    }

    // GET /files/{id}?alt=media → return raw bytes (download proxy uses this).
    {
      const m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\?alt=media/);
      if (m && method === "GET") {
        const f = state.files.get(m[1] as string);
        if (!f) return new Response("", { status: 404 });
        return new Response(`bytes-of-${f.id}`, {
          status: 200,
          headers: { "Content-Type": f.mimeType },
        });
      }
    }

    // GET /files/{id}?fields=id,name,mimeType,... → metadata for proxy MIME.
    {
      const m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\?fields=id/);
      if (m && method === "GET") {
        const f = state.files.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        return json(200, {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
          webContentLink: `https://drive.google.com/uc?id=${f.id}`,
          thumbnailLink: `https://lh3.googleusercontent.com/${f.id}=s220`,
          size: "1024",
        });
      }
    }

    // PATCH /files/{id} → trash.
    {
      const m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)$/);
      if (m && method === "PATCH") {
        const f = state.files.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        f.trashed = true;
        return json(200, { id: f.id, trashed: true });
      }
      if (m && method === "DELETE") {
        const f = state.files.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        f.deleted = true;
        return json(204, {});
      }
    }

    // List permissions.
    {
      const m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/]+)\/permissions/);
      if (m && method === "GET") {
        const f = state.files.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        return json(200, { permissions: [...f.permissions.values()] });
      }
      if (m && method === "POST") {
        const f = state.files.get(m[1] as string);
        if (!f) return json(404, { error: { message: "not found" } });
        const body = JSON.parse(String(init?.body ?? "{}")) as { role: string; type: string };
        const id = nextId("perm");
        f.permissions.set(id, { id, role: body.role, type: body.type });
        return json(200, { id, role: body.role, type: body.type });
      }
      const md = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/]+)\/permissions\/([^?]+)/);
      if (md && method === "DELETE") {
        const f = state.files.get(md[1] as string);
        if (!f) return new Response(null, { status: 204 });
        f.permissions.delete(md[2] as string);
        return new Response(null, { status: 204 });
      }
    }

    // Catch-all so missing routes are easy to spot in test output.
    return json(404, { error: { message: `unmocked ${method} ${url}` } });
  }) as typeof fetch;

  return { state, fetch: fakeFetch };
}

// Helpers replicated from asana-integration.test.ts (server lifecycle + login).
async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function login(baseUrl: string, email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "konti2026" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string };
  return body.token;
}
function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function installDriveFetchStub(): { state: DriveFakeState; restore: () => void } {
  const original = globalThis.fetch;
  const { state, fetch: fakeFetch } = makeDriveFake(original);
  process.env["REPLIT_CONNECTORS_HOSTNAME"] = "connectors.test.repl.co";
  process.env["REPL_IDENTITY"] = "test-identity";
  _setFetchForTests(fakeFetch);
  return {
    state,
    restore: () => {
      _resetFetchForTests(original);
      delete process.env["REPLIT_CONNECTORS_HOSTNAME"];
      delete process.env["REPL_IDENTITY"];
      _resetForTests();
    },
  };
}

const PROJECT_ID = "proj-1";

// ---------------------------------------------------------------------------
// drive-client wrapper: token + folder operations
// ---------------------------------------------------------------------------
test("drive-client: getDriveAccessToken throws DriveNotConnectedError without REPLIT_CONNECTORS_HOSTNAME", async () => {
  const before = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  delete process.env["REPLIT_CONNECTORS_HOSTNAME"];
  try {
    await assert.rejects(getDriveAccessToken(), DriveNotConnectedError);
  } finally {
    if (before) process.env["REPLIT_CONNECTORS_HOSTNAME"] = before;
  }
});

test("drive-client: listFolders + uploadFile happy path against the fake", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    // Seed a folder so listFolders returns something.
    state.folders.set("root-folder", {
      id: "root-folder", name: "KONTi Dashboard", parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    const folders = await listFolders(null);
    assert.ok(folders.length >= 1);

    const upload = await uploadFile({
      folderId: "root-folder",
      name: "test.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("hello-bytes"),
    });
    assert.ok(upload.id);
    assert.equal(upload.name, "test.pdf");
    assert.match(upload.webViewLink ?? "", /drive\.google\.com\/file\/d\//);
    // The fake recorded the upload call.
    assert.ok(state.calls.some((c) => c.url.includes("/upload/drive/v3/files")));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// drive-sync.uploadDocumentToDrive
// ---------------------------------------------------------------------------
test("drive-sync.uploadDocumentToDrive: creates project folder + sub-folder, returns viewer link", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.folders.set("root-folder", {
      id: "root-folder", name: "KONTi Dashboard", parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });

    const result = await uploadDocumentToDrive({
      projectId: PROJECT_ID,
      projectName: "Demo Project",
      documentId: "doc-test-1",
      documentName: "permit.pdf",
      category: "permits",
      mimeType: "application/pdf",
      data: Buffer.from("PDFBYTES"),
      isClientVisible: true,
    });
    assert.ok(result.driveFileId);
    assert.ok(result.driveFolderId);
    assert.match(result.driveWebViewLink ?? "", /drive\.google\.com/);

    // Sync log records the upload.
    const log = getDriveSyncLog();
    assert.ok(log.some((e) => e.action === "upload" && e.status === "ok" && e.documentId === "doc-test-1"));

    // Anyone-with-link permission was created because isClientVisible=true.
    const file = state.files.get(result.driveFileId);
    assert.ok(file);
    assert.ok([...file.permissions.values()].some((p) => p.type === "anyone"));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// drive-sync.deleteDocumentFromDrive
// ---------------------------------------------------------------------------
test("drive-sync.deleteDocumentFromDrive: trashes the file and logs", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.files.set("file-123", {
      id: "file-123", name: "x.pdf", mimeType: "application/pdf",
      parents: [], permissions: new Map(), trashed: false, deleted: false,
    });
    const ok = await deleteDocumentFromDrive({
      projectId: PROJECT_ID,
      projectName: "Demo",
      documentId: "doc-1",
      documentName: "x.pdf",
      driveFileId: "file-123",
    });
    assert.equal(ok, true);
    assert.equal(state.files.get("file-123")?.trashed, true);
    const log = getDriveSyncLog();
    assert.ok(log.some((e) => e.action === "delete" && e.status === "ok" && e.driveFileId === "file-123"));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// drive-sync.applyVisibilityToDrive
// ---------------------------------------------------------------------------
test("drive-sync.applyVisibilityToDrive: adds anyone permission when made visible", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.files.set("file-vis", {
      id: "file-vis", name: "doc.pdf", mimeType: "application/pdf",
      parents: [], permissions: new Map(), trashed: false, deleted: false,
    });
    const ok = await applyVisibilityToDrive({
      projectId: PROJECT_ID,
      projectName: "Demo",
      documentId: "doc-vis",
      documentName: "doc.pdf",
      driveFileId: "file-vis",
      isClientVisible: true,
    });
    assert.equal(ok, true);
    const f = state.files.get("file-vis")!;
    assert.ok([...f.permissions.values()].some((p) => p.type === "anyone"));

    // Toggle off → permission removed.
    await applyVisibilityToDrive({
      projectId: PROJECT_ID,
      projectName: "Demo",
      documentId: "doc-vis",
      documentName: "doc.pdf",
      driveFileId: "file-vis",
      isClientVisible: false,
    });
    assert.equal([...f.permissions.values()].filter((p) => p.type === "anyone").length, 0);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// drive-sync.backfillDocuments — idempotent over already-uploaded docs.
// ---------------------------------------------------------------------------
test("drive-sync.backfillDocuments: skips docs that already have a driveFileId or no payload", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.folders.set("root-folder", {
      id: "root-folder", name: "KONTi Dashboard", parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    const docs: BackfillDocument[] = [
      // (a) Already has a driveFileId → skipped.
      {
        projectId: PROJECT_ID, projectName: "Demo", documentId: "d-a",
        documentName: "a.pdf", category: "internal", mimeType: "application/pdf",
        driveFileId: "existing-id", data: Buffer.from("ignored"), isClientVisible: false,
      },
      // (b) Empty payload → skipped.
      {
        projectId: PROJECT_ID, projectName: "Demo", documentId: "d-b",
        documentName: "b.pdf", category: "internal", mimeType: "application/pdf",
        driveFileId: null, data: Buffer.alloc(0), isClientVisible: false,
      },
      // (c) Real payload → uploaded.
      {
        projectId: PROJECT_ID, projectName: "Demo", documentId: "d-c",
        documentName: "c.pdf", category: "internal", mimeType: "application/pdf",
        driveFileId: null, data: Buffer.from("REAL"), isClientVisible: false,
      },
    ];
    const results = await backfillDocuments(docs);
    const byId = new Map(results.map((r) => [r.documentId, r]));
    assert.equal(byId.get("d-a")?.status, "skipped");
    assert.equal(byId.get("d-b")?.status, "skipped");
    assert.equal(byId.get("d-c")?.status, "uploaded");
    assert.ok(byId.get("d-c")?.driveFileId);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Disabled mode → upload route must NOT touch Drive.
// ---------------------------------------------------------------------------
test("POST /projects/:id/documents: when Drive is disabled, no Drive fetch is made", async () => {
  _resetForTests();
  // Force-disable: clear any state and ensure isDriveEnabled=false.
  assert.equal(isDriveEnabled(), false);
  let droveCalls = 0;
  const original = globalThis.fetch;
  const wrapped: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("googleapis.com") || url.includes("/api/v2/connection")) {
      droveCalls++;
    }
    return original(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
  _setFetchForTests(wrapped);
  try {
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const before = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID]?.length ?? 0;
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "no-drive.pdf",
          category: "internal",
          fileBase64: Buffer.from("hello").toString("base64"),
          mimeType: "application/pdf",
        }),
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as Record<string, unknown>;
      assert.equal(created["driveFileId"], undefined);
      assert.equal(droveCalls, 0);
      // And the in-memory list grew by one (metadata-only fallback).
      const after = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID]?.length ?? 0;
      assert.equal(after, before + 1);
      // Clean up the doc we just inserted so the test doesn't pollute fixtures.
      const list = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] ?? [];
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => (d as Record<string, unknown>)["id"] !== created["id"],
      );
    });
  } finally {
    _resetFetchForTests(original);
  }
});

// ---------------------------------------------------------------------------
// Enabled mode → upload route streams to Drive and stores driveFileId.
// ---------------------------------------------------------------------------
test("POST /projects/:id/documents: when Drive is enabled + fileBase64 present, file lands in Drive", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.folders.set("root-folder", {
      id: "root-folder", name: "KONTi Dashboard", parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });

    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "drive-permit.pdf",
          category: "permits",
          fileBase64: Buffer.from("RealPDFBytes").toString("base64"),
          mimeType: "application/pdf",
        }),
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as Record<string, unknown>;
      assert.ok(typeof created["driveFileId"] === "string", "driveFileId on response");
      assert.match(String(created["driveWebViewLink"] ?? ""), /drive\.google\.com/);

      // The stored doc carries the IDs too (read back via GET).
      const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
      const stored = list.find((d) => d["id"] === created["id"]);
      assert.ok(stored, "stored doc exists");
      assert.equal(stored["driveFileId"], created["driveFileId"]);

      // Clean up.
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== created["id"],
      );
    });
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Per-project sub-folder reuse — ensureProjectCategoryFolder is idempotent.
// ---------------------------------------------------------------------------
test("drive-sync: subsequent uploads reuse the same project sub-folder", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.folders.set("root-folder", {
      id: "root-folder", name: "KONTi Dashboard", parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    // Prime the project folder map so we exercise the cached path.
    setDriveProjectFolder(PROJECT_ID, {
      projectFolderId: "cached-proj-folder",
      subFolders: { internal: "cached-sub-folder" },
    });
    state.folders.set("cached-proj-folder", {
      id: "cached-proj-folder", name: "Demo", parents: ["root-folder"],
      mimeType: "application/vnd.google-apps.folder",
    });
    state.folders.set("cached-sub-folder", {
      id: "cached-sub-folder", name: "Internal", parents: ["cached-proj-folder"],
      mimeType: "application/vnd.google-apps.folder",
    });
    const r1 = await uploadDocumentToDrive({
      projectId: PROJECT_ID, projectName: "Demo", documentId: "d1",
      documentName: "one.pdf", category: "internal", mimeType: "application/pdf",
      data: Buffer.from("a"), isClientVisible: false,
    });
    const r2 = await uploadDocumentToDrive({
      projectId: PROJECT_ID, projectName: "Demo", documentId: "d2",
      documentName: "two.pdf", category: "internal", mimeType: "application/pdf",
      data: Buffer.from("b"), isClientVisible: false,
    });
    assert.equal(r1.driveFolderId, "cached-sub-folder");
    assert.equal(r2.driveFolderId, "cached-sub-folder");
    // Project map is unchanged (still pointing at the cached IDs).
    const map = getDriveConfig().projectFolders[PROJECT_ID];
    assert.equal(map?.projectFolderId, "cached-proj-folder");
    assert.equal(map?.subFolders["internal"], "cached-sub-folder");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Status endpoint via real HTTP route.
// ---------------------------------------------------------------------------
test("GET /integrations/drive/status: client role → 403, admin → 200", async () => {
  _resetForTests();
  await withServer(async (baseUrl) => {
    const clientToken = await login(baseUrl, "client@konti.com");
    const r1 = await fetch(`${baseUrl}/api/integrations/drive/status`, {
      headers: authHeaders(clientToken),
    });
    assert.equal(r1.status, 403);

    const adminToken = await login(baseUrl, "demo@konti.com");
    const r2 = await fetch(`${baseUrl}/api/integrations/drive/status`, {
      headers: authHeaders(adminToken),
    });
    assert.equal(r2.status, 200);
    const body = (await r2.json()) as Record<string, unknown>;
    assert.equal(typeof body["connected"], "boolean");
    assert.equal(typeof body["configured"], "boolean");
    assert.ok(body["config"]);
  });
});

// ---------------------------------------------------------------------------
// Atomicity (no half-commit) under forced Drive failures
// ---------------------------------------------------------------------------

/**
 * Build a fetch stub like `installDriveFetchStub` but where every Drive call
 * returns HTTP 500. Connector-token fetches still succeed so we exercise the
 * route's error-handling path (not its "not connected" path).
 */
function installFailingDriveFetchStub(): { restore: () => void } {
  const original = globalThis.fetch;
  process.env["REPLIT_CONNECTORS_HOSTNAME"] = "connectors.test.repl.co";
  process.env["REPL_IDENTITY"] = "test-identity";
  const failing: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/v2/connection")) {
      return new Response(
        JSON.stringify({ items: [{ settings: { access_token: "fake-token" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("googleapis.com")) {
      return new Response(JSON.stringify({ error: { message: "boom" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
  _setFetchForTests(failing);
  return {
    restore: () => {
      _resetFetchForTests(original);
      delete process.env["REPLIT_CONNECTORS_HOSTNAME"];
      delete process.env["REPL_IDENTITY"];
      _resetForTests();
    },
  };
}

test("POST /projects/:id/documents: 502 on Drive failure, no document inserted", async () => {
  const { restore } = installFailingDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const before = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID]?.length ?? 0;
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "should-not-land.pdf",
          category: "internal",
          fileBase64: Buffer.from("X").toString("base64"),
          mimeType: "application/pdf",
        }),
      });
      assert.equal(res.status, 502);
      const after = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID]?.length ?? 0;
      assert.equal(after, before, "no document was half-committed");
    });
  } finally {
    restore();
  }
});

test("PATCH /documents/:id/visibility: non-blocking on Drive failure, dashboard flips + warning surfaced", async () => {
  const { restore } = installFailingDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    // Plant a doc that already lives in Drive so the route hits the Drive branch.
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-half-vis",
      name: "vis.pdf",
      category: "internal",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: false,
      driveFileId: "file-vis-half",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const adminToken = await login(baseUrl, "demo@konti.com");
        const res = await fetch(
          `${baseUrl}/api/projects/${PROJECT_ID}/documents/doc-half-vis`,
          {
            method: "PATCH",
            headers: authHeaders(adminToken, true),
            body: JSON.stringify({ isClientVisible: true }),
          },
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body["isClientVisible"], true, "dashboard visibility flipped");
        assert.ok(body["driveWarning"], "warning surfaced for the UI");
        const after = list.find((d) => d["id"] === "doc-half-vis") as Record<string, unknown>;
        assert.equal(after["isClientVisible"], true, "visibility flipped in store");
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-half-vis",
      );
    }
  } finally {
    restore();
  }
});

test("DELETE /documents/:id: non-blocking on Drive failure, document removed + warning surfaced", async () => {
  const { restore } = installFailingDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-half-del",
      name: "del.pdf",
      category: "internal",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: false,
      driveFileId: "file-del-half",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const adminToken = await login(baseUrl, "demo@konti.com");
        const res = await fetch(
          `${baseUrl}/api/projects/${PROJECT_ID}/documents/doc-half-del`,
          { method: "DELETE", headers: authHeaders(adminToken) },
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body["deleted"], true, "delete acknowledged");
        assert.ok(body["driveWarning"], "warning surfaced for the UI");
        const stillThere = ((DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] ?? []).some(
          (d) => (d as Record<string, unknown>)["id"] === "doc-half-del",
        );
        assert.equal(stillThere, false, "dashboard record removed");
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-half-del",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: admin gets bytes through the proxy", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    // Seed one file in the fake + matching dashboard record.
    state.files.set("dl-file-1", {
      id: "dl-file-1",
      name: "blueprint.pdf",
      mimeType: "application/pdf",
      parents: [],
      permissions: new Map(),
      trashed: false,
      deleted: false,
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-dl-1",
      name: "blueprint.pdf",
      category: "internal",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: false,
      driveFileId: "dl-file-1",
      mimeType: "application/pdf",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const adminToken = await login(baseUrl, "demo@konti.com");
        const res = await fetch(
          `${baseUrl}/api/integrations/drive/files/dl-file-1/download`,
          { headers: authHeaders(adminToken) },
        );
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("content-type"), "application/pdf");
        const text = await res.text();
        assert.equal(text, "bytes-of-dl-file-1");
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-dl-1",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: client denied when document is not client-visible", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.files.set("dl-internal", {
      id: "dl-internal",
      name: "internal-only.pdf",
      mimeType: "application/pdf",
      parents: [],
      permissions: new Map(),
      trashed: false,
      deleted: false,
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-internal-1",
      name: "internal-only.pdf",
      category: "internal",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: false,
      driveFileId: "dl-internal",
      mimeType: "application/pdf",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const clientToken = await login(baseUrl, "client@konti.com");
        const res = await fetch(
          `${baseUrl}/api/integrations/drive/files/dl-internal/download`,
          { headers: authHeaders(clientToken) },
        );
        assert.equal(res.status, 403);
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-internal-1",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: client allowed when doc is visible AND project owned", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.files.set("dl-shared", {
      id: "dl-shared",
      name: "shared-with-client.pdf",
      mimeType: "application/pdf",
      parents: [],
      permissions: new Map(),
      trashed: false,
      deleted: false,
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-shared-1",
      name: "shared-with-client.pdf",
      category: "client_review",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: true,
      driveFileId: "dl-shared",
      mimeType: "application/pdf",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        // user-client-1 owns proj-1 in the seed, so this is the allowed path.
        const clientToken = await login(baseUrl, "client@konti.com");
        const res = await fetch(
          `${baseUrl}/api/integrations/drive/files/dl-shared/download`,
          { headers: authHeaders(clientToken) },
        );
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.equal(text, "bytes-of-dl-shared");
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-shared-1",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: client denied when project not assigned", async () => {
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    // Find a project NOT owned by user-client-1.
    const otherProject = PROJECTS.find(
      (p) => (p as { clientUserId?: string }).clientUserId &&
             (p as { clientUserId?: string }).clientUserId !== "user-client-1",
    );
    if (!otherProject) {
      // No suitable project — skip silently rather than fail the suite.
      return;
    }
    state.files.set("dl-other", {
      id: "dl-other",
      name: "wrong-project.pdf",
      mimeType: "application/pdf",
      parents: [],
      permissions: new Map(),
      trashed: false,
      deleted: false,
    });
    const otherList = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[otherProject.id] ?? [];
    const planted = {
      id: "doc-other-1",
      name: "wrong-project.pdf",
      category: "client_review",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: true,
      driveFileId: "dl-other",
      mimeType: "application/pdf",
      description: "",
    };
    otherList.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[otherProject.id] = otherList;
    try {
      await withServer(async (baseUrl) => {
        const clientToken = await login(baseUrl, "client@konti.com");
        const res = await fetch(
          `${baseUrl}/api/integrations/drive/files/dl-other/download`,
          { headers: authHeaders(clientToken) },
        );
        assert.equal(res.status, 403);
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[otherProject.id] = otherList.filter(
        (d) => d["id"] !== "doc-other-1",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: 404 for an unknown file id", async () => {
  const { restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const res = await fetch(
        `${baseUrl}/api/integrations/drive/files/unknown-file/download`,
        { headers: authHeaders(adminToken) },
      );
      assert.equal(res.status, 404);
    });
  } finally {
    restore();
  }
});

test("GET /projects/:projectId/documents: client response strips raw Drive URLs", async () => {
  const { restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-sanitize-1",
      name: "blueprint.pdf",
      category: "client_review",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: true,
      driveFileId: "dl-sanitize",
      driveWebViewLink: "https://drive.google.com/file/d/dl-sanitize/view",
      driveWebContentLink: "https://drive.google.com/uc?id=dl-sanitize",
      driveThumbnailLink: "https://lh3.googleusercontent.com/dl-sanitize=s220",
      mimeType: "application/pdf",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const clientToken = await login(baseUrl, "client@konti.com");
        const res = await fetch(
          `${baseUrl}/api/projects/${PROJECT_ID}/documents`,
          { headers: authHeaders(clientToken) },
        );
        assert.equal(res.status, 200);
        const docs = (await res.json()) as Array<Record<string, unknown>>;
        const doc = docs.find((d) => d["id"] === "doc-sanitize-1");
        assert.ok(doc, "doc surfaced to client");
        assert.equal(doc["driveWebViewLink"], undefined, "webViewLink stripped for client");
        assert.equal(doc["driveWebContentLink"], undefined, "webContentLink stripped for client");
        assert.equal(doc["driveThumbnailLink"], undefined, "thumbnailLink stripped for client");
        assert.equal(
          doc["driveDownloadProxyUrl"],
          "/api/integrations/drive/files/dl-sanitize/download",
          "proxy URL still surfaced",
        );
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-sanitize-1",
      );
    }
  } finally {
    restore();
  }
});

test("GET /integrations/drive/files/:fileId/download: registered doc but missing Drive file → 404 drive_file_missing", async () => {
  // Registered in the dashboard but NEVER added to the fake's files map, so
  // Drive returns 404 → DriveApiError(404) → mapped to dashboard 404 with
  // the "drive_file_missing" error code (distinct from the unknown-doc 404).
  const { restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "private",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    const list = (DOCUMENTS as Record<string, Array<Record<string, unknown>>>)[PROJECT_ID] ?? [];
    const planted = {
      id: "doc-missing-1",
      name: "ghost.pdf",
      category: "internal",
      type: "PDF",
      fileSize: "1 KB",
      uploadedBy: "demo@konti.com",
      uploadedAt: new Date().toISOString(),
      isClientVisible: false,
      driveFileId: "dl-ghost",
      mimeType: "application/pdf",
      description: "",
    };
    list.push(planted);
    (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list;
    try {
      await withServer(async (baseUrl) => {
        const adminToken = await login(baseUrl, "demo@konti.com");
        const res = await fetch(
          `${baseUrl}/api/integrations/drive/files/dl-ghost/download`,
          { headers: authHeaders(adminToken) },
        );
        assert.equal(res.status, 404);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body["error"], "drive_file_missing");
      });
    } finally {
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => d["id"] !== "doc-missing-1",
      );
    }
  } finally {
    restore();
  }
});

test("POST /projects/:id/documents: photo uploads land in Site Photos folder regardless of dashboard category", async () => {
  // Photos must always live in the canonical `site_photos` Drive folder per
  // the Task #128 storage contract, even when the upload's dashboard
  // category is something else (e.g. `construction`).
  const { state, restore } = installDriveFetchStub();
  try {
    updateDriveConfig({
      enabled: true,
      rootFolderId: "root-folder",
      rootFolderName: "KONTi Dashboard",
      visibilityPolicy: "anyone_with_link",
      deletePolicy: "trash",
      connectedAt: new Date().toISOString(),
      connectedBy: "Tester",
    });
    state.folders.set("root-folder", {
      id: "root-folder",
      name: "KONTi Dashboard",
      parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "site.jpg",
          // intentionally NOT site_photos — proves the override
          category: "construction",
          type: "photo",
          photoCategory: "construction_progress",
          fileBase64: Buffer.from("fakejpegbytes").toString("base64"),
          mimeType: "image/jpeg",
        }),
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as Record<string, unknown>;
      assert.ok(created["driveFileId"], "photo got a driveFileId");
      // Walk the fake's folder tree to confirm the parent folder of the
      // uploaded file is named "Site Photos" (the canonical bucket).
      const fileId = created["driveFileId"] as string;
      const file = state.files.get(fileId);
      assert.ok(file, "fake recorded the file");
      const parentId = file.parents[0];
      assert.ok(parentId, "uploaded file has a parent folder");
      const parent = state.folders.get(parentId);
      assert.ok(parent, "parent folder exists in fake");
      assert.equal(parent.name, "Site Photos", "photo lands in Site Photos folder");
      // Cleanup the inserted document so subsequent tests don't see it.
      const list = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] ?? [];
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) => (d as Record<string, unknown>)["id"] !== created["id"],
      );
    });
  } finally {
    restore();
  }
});

test("POST /integrations/drive/configure: first-connect provisions per-project subfolders + auto-runs backfill", async () => {
  // First successful connect should (a) create the canonical sub-folder set
  // for every project under the workspace root and (b) trigger an
  // idempotent backfill of any in-memory document still missing a
  // driveFileId. Both gated by `firstConnectCompletedAt` so re-connects
  // skip the (potentially long) bootstrap.
  const { state, restore } = installDriveFetchStub();
  try {
    state.folders.set("root-folder", {
      id: "root-folder",
      name: "KONTi Dashboard",
      parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/integrations/drive/configure`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          rootFolderId: "root-folder",
          rootFolderName: "KONTi Dashboard",
          visibilityPolicy: "anyone_with_link",
          deletePolicy: "trash",
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.ok(body["firstConnectBootstrap"], "bootstrap summary returned on first connect");
      const summary = body["firstConnectBootstrap"] as Record<string, number>;
      // We seeded one project (proj-1) — should provision its sub-folders
      // without failure (other seeded projects are also OK).
      assert.ok(summary["provisioned"]! >= 1, "at least one project provisioned");
      assert.equal(summary["provisionFailed"], 0, "no provisioning failures");
      // Confirm the canonical folders exist under the project folder.
      const folderNames = Array.from(state.folders.values()).map((f) => f.name);
      for (const expected of ["Site Photos", "Permits", "Contracts", "Reports", "Receipts", "Punchlist", "Other"]) {
        assert.ok(
          folderNames.includes(expected),
          `expected folder "${expected}" provisioned (have: ${folderNames.join(", ")})`,
        );
      }
      // Second connect must NOT include the bootstrap summary — the
      // run-once marker prevents redoing the heavy walk.
      const res2 = await fetch(`${baseUrl}/api/integrations/drive/configure`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          rootFolderId: "root-folder",
          rootFolderName: "KONTi Dashboard",
          visibilityPolicy: "anyone_with_link",
          deletePolicy: "trash",
        }),
      });
      assert.equal(res2.status, 200);
      const body2 = (await res2.json()) as Record<string, unknown>;
      assert.equal(
        body2["firstConnectBootstrap"],
        undefined,
        "subsequent connects skip bootstrap",
      );
    });
  } finally {
    restore();
  }
});

test("POST /integrations/drive/configure: disconnect → reconnect to a different root invalidates the cached project folder map", async () => {
  // Regression: disconnect clears `rootFolderId`, so on reconnect the
  // simple "previous root != new root" check would have been impossible
  // without the persisted `lastConfiguredRootFolderId` shadow field. This
  // test connects → uploads (caches a folder under root A) → disconnects
  // → reconnects with root B → uploads again, and asserts the new file
  // is parented under root B (not the cached folder ID under root A).
  const { state, restore } = installDriveFetchStub();
  try {
    state.folders.set("root-A", {
      id: "root-A",
      name: "Root A",
      parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    state.folders.set("root-B", {
      id: "root-B",
      name: "Root B",
      parents: ["root"],
      mimeType: "application/vnd.google-apps.folder",
    });
    await withServer(async (baseUrl) => {
      const adminToken = await login(baseUrl, "demo@konti.com");
      // (1) Connect to root A.
      const r1 = await fetch(`${baseUrl}/api/integrations/drive/configure`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          rootFolderId: "root-A",
          rootFolderName: "Root A",
          visibilityPolicy: "private",
          deletePolicy: "trash",
        }),
      });
      assert.equal(r1.status, 200);
      // (2) Upload a doc — this caches a per-project folder under root A.
      const u1 = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "in-A.pdf",
          category: "internal",
          fileBase64: Buffer.from("a-bytes").toString("base64"),
          mimeType: "application/pdf",
        }),
      });
      assert.equal(u1.status, 201);
      const docA = (await u1.json()) as Record<string, unknown>;
      const fileA = state.files.get(docA["driveFileId"] as string);
      assert.ok(fileA, "first file recorded");
      // Walk parents up to confirm the file lives under root-A.
      const ancestorsA = walkAncestors(state, fileA.parents[0] as string);
      assert.ok(ancestorsA.includes("root-A"), "first file lives under root-A");
      // (3) Disconnect.
      const d = await fetch(`${baseUrl}/api/integrations/drive/disconnect`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
      });
      assert.equal(d.status, 200);
      // (4) Reconnect to root B.
      const r2 = await fetch(`${baseUrl}/api/integrations/drive/configure`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          rootFolderId: "root-B",
          rootFolderName: "Root B",
          visibilityPolicy: "private",
          deletePolicy: "trash",
        }),
      });
      assert.equal(r2.status, 200);
      // (5) Upload again — the cached folder map MUST have been cleared,
      // so the new file's per-project folder lives under root-B.
      const u2 = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/documents`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          name: "in-B.pdf",
          category: "internal",
          fileBase64: Buffer.from("b-bytes").toString("base64"),
          mimeType: "application/pdf",
        }),
      });
      assert.equal(u2.status, 201);
      const docB = (await u2.json()) as Record<string, unknown>;
      const fileB = state.files.get(docB["driveFileId"] as string);
      assert.ok(fileB, "second file recorded");
      const ancestorsB = walkAncestors(state, fileB.parents[0] as string);
      assert.ok(
        ancestorsB.includes("root-B"),
        `second file must live under root-B (ancestors: ${ancestorsB.join(" -> ")})`,
      );
      assert.ok(
        !ancestorsB.includes("root-A"),
        "second file must NOT live under root-A (cache invalidation failure)",
      );
      // Cleanup the planted docs.
      const list = (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] ?? [];
      (DOCUMENTS as Record<string, unknown[]>)[PROJECT_ID] = list.filter(
        (d) =>
          (d as Record<string, unknown>)["id"] !== docA["id"] &&
          (d as Record<string, unknown>)["id"] !== docB["id"],
      );
    });
  } finally {
    restore();
  }
});

// Helper: walk a folder's parent chain up to a Drive root, returning every
// folder ID encountered. Used by the reconnect test to verify ancestry.
function walkAncestors(
  state: DriveFakeState,
  startFolderId: string,
): string[] {
  const out: string[] = [];
  let cursor: string | undefined = startFolderId;
  let safety = 20;
  while (cursor && safety-- > 0) {
    out.push(cursor);
    const f = state.folders.get(cursor);
    if (!f) break;
    cursor = f.parents[0];
    if (cursor === "root") {
      out.push("root");
      break;
    }
  }
  return out;
}

// Reference unused import to keep TS happy in some configs (PROJECTS used
// elsewhere is already imported above).
void PROJECTS;
