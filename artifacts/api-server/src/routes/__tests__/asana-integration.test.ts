import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import {
  PROJECTS,
  PROJECT_ACTIVITIES,
  appendActivity,
  type ProjectActivity,
} from "../../data/seed";
import {
  updateAsanaConfig,
  getSyncLog,
  isAsanaEnabled,
  _resetForTests,
} from "../../lib/integrations-config";

type LoginResponse = { token: string; user: { id: string; role: string } };

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
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const PROJECT_ID = "proj-1";

function snapshotActivities(): ProjectActivity[] {
  return [...(PROJECT_ACTIVITIES[PROJECT_ID] ?? [])];
}
function restoreActivities(snap: ProjectActivity[]) {
  PROJECT_ACTIVITIES[PROJECT_ID] = snap;
}
function snapshotProjectAsanaGid() {
  const p = PROJECTS.find((x) => x.id === PROJECT_ID)!;
  return { ref: p, original: p.asanaGid };
}

// ---------------------------------------------------------------------------
// /integrations/asana/status
// ---------------------------------------------------------------------------
test("integrations/asana/status: requires admin/superadmin", async () => {
  await withServer(async (baseUrl) => {
    const clientToken = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/integrations/asana/status`, {
      headers: authHeaders(clientToken),
    });
    assert.equal(res.status, 403);
  });
});

test("integrations/asana/status: admin sees connected=false when no connector", async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/integrations/asana/status`, {
      headers: authHeaders(adminToken),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(typeof body["connected"], "boolean");
    assert.equal(typeof body["connectionMessage"], "string");
    assert.equal(typeof body["connectionMessageEs"], "string");
    assert.ok(body["config"] && typeof body["config"] === "object");
    // No connector configured in the test sandbox.
    assert.equal(body["connected"], false);
  });
});

// ---------------------------------------------------------------------------
// Site visit endpoint emits a project activity
// ---------------------------------------------------------------------------
test("projects/:id/site-visits: appends a site_visit_logged activity", async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl, "demo@konti.com");
    const before = snapshotActivities();
    try {
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/site-visits`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          visitor: "Carlos PM",
          visitDate: "2026-05-01",
          channel: "site",
          note: "Walkthrough complete",
        }),
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as ProjectActivity;
      assert.equal(created.type, "site_visit_logged");
      assert.match(created.description, /Walkthrough/);

      const acts = PROJECT_ACTIVITIES[PROJECT_ID] ?? [];
      assert.ok(acts.some((a) => a.id === created.id));
    } finally {
      restoreActivities(before);
    }
  });
});

test("projects/:id/site-visits: rejects missing fields with 400", async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/site-visits`, {
      method: "POST",
      headers: authHeaders(adminToken, true),
      body: JSON.stringify({ visitor: "", visitDate: "" }),
    });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// Client interaction endpoint
// ---------------------------------------------------------------------------
test("projects/:id/client-interactions: appends a client_interaction_logged activity", async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl, "demo@konti.com");
    const before = snapshotActivities();
    try {
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/client-interactions`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({
          occurredAt: "2026-05-01T15:30:00Z",
          channel: "call",
          with: "Client Rep",
          note: "Discussed punchlist",
        }),
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as ProjectActivity;
      assert.equal(created.type, "client_interaction_logged");
      assert.match(created.description, /Call/i);

      const acts = PROJECT_ACTIVITIES[PROJECT_ID] ?? [];
      assert.ok(acts.some((a) => a.id === created.id));
    } finally {
      restoreActivities(before);
    }
  });
});

// ---------------------------------------------------------------------------
// Asana link endpoint persists the gid on the project
// ---------------------------------------------------------------------------
test("projects/:id/asana-link: stamps asanaGid on project + emits asana_task_linked", async () => {
  await withServer(async (baseUrl) => {
    const adminToken = await login(baseUrl, "demo@konti.com");
    const beforeActs = snapshotActivities();
    const projectSnap = snapshotProjectAsanaGid();
    try {
      const res = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/asana-link`, {
        method: "POST",
        headers: authHeaders(adminToken, true),
        body: JSON.stringify({ asanaGid: "9999999999999" }),
      });
      assert.equal(res.status, 200);
      const updated = (await res.json()) as { id: string; asanaGid: string };
      assert.equal(updated.asanaGid, "9999999999999");
      assert.equal(projectSnap.ref.asanaGid, "9999999999999");

      const acts = PROJECT_ACTIVITIES[PROJECT_ID] ?? [];
      assert.ok(acts.some((a) => a.type === "asana_task_linked"));
    } finally {
      restoreActivities(beforeActs);
      projectSnap.ref.asanaGid = projectSnap.original;
    }
  });
});

// ---------------------------------------------------------------------------
// Sync hook is bypassed when integration is not enabled (no Asana connector
// available in the test environment).
// ---------------------------------------------------------------------------
test("appendActivity: does NOT enqueue sync entries when Asana is disabled", async () => {
  // Sanity: in tests we have no connector + no config persisted.
  assert.equal(isAsanaEnabled(), false);
  const before = snapshotActivities();
  const beforeLog = getSyncLog().length;
  try {
    appendActivity(PROJECT_ID, {
      type: "document_upload",
      actor: "Test",
      description: "Smoke",
      descriptionEs: "Prueba",
    });
    // No new log entries because the hook short-circuits.
    assert.equal(getSyncLog().length, beforeLog);
  } finally {
    restoreActivities(before);
  }
});

// ---------------------------------------------------------------------------
// Configure → disconnect lifecycle (using test-only helper to avoid any
// external network call to Asana).
// ---------------------------------------------------------------------------
test("updateAsanaConfig: enabled flag controls isAsanaEnabled", () => {
  _resetForTests();
  assert.equal(isAsanaEnabled(), false);
  updateAsanaConfig({
    enabled: true,
    workspaceGid: "WS1",
    workspaceName: "Test WS",
    boardGid: "B1",
    boardName: "Test Board",
    defaultAssigneeGid: null,
    dashboardBaseUrl: null,
    connectedAt: new Date().toISOString(),
    connectedBy: "test",
  });
  // With workspace + board + enabled, isAsanaEnabled is true (the network
  // call to Asana itself is what fails gracefully — gated by callers).
  assert.equal(isAsanaEnabled(), true);
  _resetForTests();
  assert.equal(isAsanaEnabled(), false);
});
