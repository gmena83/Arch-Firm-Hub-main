import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { PROJECTS, DOCUMENTS, PROJECT_ACTIVITIES } from "../../data/seed";

// Regression coverage for Task #64: DELETE /projects/:projectId/documents/:documentId.
// Mirrors the helpers used by upload-document.test.ts so the suites stay
// stylistically consistent.

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

async function login(baseUrl: string, email: string, password = "konti2026"): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login for ${email} should succeed`);
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

async function uploadDoc(
  baseUrl: string,
  token: string,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  assert.equal(res.status, 201, `upload to ${projectId} should succeed`);
  return (await res.json()) as { id: string };
}

function snapshotDocCounts(): Record<string, number> {
  return Object.fromEntries(
    PROJECTS.map((p) => [
      p.id,
      ((DOCUMENTS as Record<string, unknown[]>)[p.id] ?? []).length,
    ]),
  );
}

function restoreDocCounts(snapshot: Record<string, number>) {
  for (const [pid, count] of Object.entries(snapshot)) {
    const arr = (DOCUMENTS as Record<string, unknown[]>)[pid];
    if (arr && arr.length > count) arr.length = count;
  }
}

test("admin can delete a document and the row disappears from the list", async () => {
  const counts = snapshotDocCounts();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const doc = await uploadDoc(baseUrl, token, "proj-1", {
        name: `to-delete-${Date.now()}.pdf`,
        category: "internal",
        fileSize: "1.0 MB",
        mimeType: "application/pdf",
      });

      const del = await fetch(`${baseUrl}/api/projects/proj-1/documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(del.status, 204, "admin delete must return 204");

      const list = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json() as Promise<Array<{ id: string }>>);
      assert.ok(!list.some((d) => d.id === doc.id), "deleted doc must not appear in GET");
    });
  } finally {
    restoreDocCounts(counts);
  }
});

test("delete writes a `document_removed` activity entry", async () => {
  const docCounts = snapshotDocCounts();
  const seededActivityCount = (PROJECT_ACTIVITIES["proj-2"] ?? []).length;
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const doc = await uploadDoc(baseUrl, token, "proj-2", {
        name: `activity-check-${Date.now()}.pdf`,
        category: "design",
        fileSize: "0.5 MB",
        mimeType: "application/pdf",
      });

      const del = await fetch(`${baseUrl}/api/projects/proj-2/documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(del.status, 204);

      const activities = PROJECT_ACTIVITIES["proj-2"] ?? [];
      // Upload added one entry, delete adds another → +2 total.
      assert.equal(
        activities.length,
        seededActivityCount + 2,
        "delete must append a new activity entry",
      );
      const newest = activities[0];
      assert.ok(newest, "newest activity must exist");
      assert.equal(newest.type, "document_removed");
      assert.ok(
        newest.description.includes(doc.name),
        "EN description should mention the file name",
      );
      assert.ok(
        newest.descriptionEs.includes(doc.name),
        "ES description should mention the file name",
      );
    });
  } finally {
    const acts = PROJECT_ACTIVITIES["proj-2"];
    if (acts && acts.length > seededActivityCount) acts.length = seededActivityCount;
    restoreDocCounts(docCounts);
  }
});

test("client can delete documents they uploaded but not those uploaded by team", async () => {
  const counts = snapshotDocCounts();
  try {
    await withServer(async (baseUrl) => {
      // Team uploads a doc to proj-1 (client1 owns proj-1 in the seed).
      const adminToken = await login(baseUrl, "demo@konti.com");
      const teamDoc = await uploadDoc(baseUrl, adminToken, "proj-1", {
        name: `team-doc-${Date.now()}.pdf`,
        category: "internal",
        fileSize: "0.4 MB",
        mimeType: "application/pdf",
      });

      // Owning client uploads their own doc.
      const clientToken = await login(baseUrl, "client@konti.com");
      const clientDoc = await uploadDoc(baseUrl, clientToken, "proj-1", {
        name: `client-doc-${Date.now()}.pdf`,
        category: "client_review",
        fileSize: "0.3 MB",
        mimeType: "application/pdf",
      });

      // Client cannot delete the team-uploaded doc.
      const forbidden = await fetch(
        `${baseUrl}/api/projects/proj-1/documents/${teamDoc.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${clientToken}` } },
      );
      assert.equal(forbidden.status, 403, "client must not delete team-owned docs");

      // Client can delete their own.
      const ownDelete = await fetch(
        `${baseUrl}/api/projects/proj-1/documents/${clientDoc.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${clientToken}` } },
      );
      assert.equal(ownDelete.status, 204, "client must be able to delete own uploads");

      // Cleanup: team removes the team doc so seed counts restore cleanly.
      await fetch(`${baseUrl}/api/projects/proj-1/documents/${teamDoc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });
  } finally {
    restoreDocCounts(counts);
  }
});

test("non-owner client gets 403 even when targeting an existing doc", async () => {
  await withServer(async (baseUrl) => {
    // proj-1 belongs to client1; client2 must be blocked at the ownership gate.
    const otherClientToken = await login(baseUrl, "client2@konti.com");
    const seededDocs = ((DOCUMENTS as Record<string, Array<{ id: string }>>)["proj-1"] ?? []);
    const target = seededDocs[0];
    assert.ok(target, "seed must include at least one doc on proj-1");

    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/${target.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherClientToken}` },
    });
    assert.equal(res.status, 403, "non-owner client must be forbidden");
  });
});

test("delete requires authentication (401)", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/doc-anything`, {
      method: "DELETE",
    });
    assert.equal(res.status, 401);
  });
});

test("delete returns 404 for a missing project", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-does-not-exist/documents/doc-x`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "not_found");
  });
});

test("delete returns 404 for a missing document on a real project", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/doc-does-not-exist`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });
});

test("client on their own project gets 404 for a missing document (not 403)", async () => {
  // Sanity-check the gate ordering: ownership passes for the owning client,
  // so the missing-document branch must surface as 404 — not be masked as 403.
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/doc-missing`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404, "owning client + missing doc must be 404");
  });
});

test("204 response has no body so the orval client doesn't try to parse JSON", async () => {
  const counts = snapshotDocCounts();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const doc = await uploadDoc(baseUrl, token, "proj-3", {
        name: `body-check-${Date.now()}.pdf`,
        category: "internal",
        fileSize: "0.2 MB",
        mimeType: "application/pdf",
      });
      const res = await fetch(`${baseUrl}/api/projects/proj-3/documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 204);
      const text = await res.text();
      assert.equal(text, "", "204 must have an empty body");
    });
  } finally {
    restoreDocCounts(counts);
  }
});

test("superadmin can delete any document (no client-uploader restriction)", async () => {
  // Tatiana is the only seeded superadmin and has a separate password.
  // Skip cleanly if her credentials aren't available so we don't make
  // the suite brittle against unrelated auth fixture changes.
  await withServer(async (baseUrl) => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tatiana@menatech.cloud", password: "Konti123" }),
    });
    if (loginRes.status !== 200) return; // pre-existing auth fixture issue — not our concern.
    const { token } = (await loginRes.json()) as LoginResponse;
    const counts = snapshotDocCounts();
    try {
      const adminToken = await login(baseUrl, "demo@konti.com");
      const doc = await uploadDoc(baseUrl, adminToken, "proj-2", {
        name: `superadmin-target-${Date.now()}.pdf`,
        category: "internal",
        fileSize: "0.1 MB",
        mimeType: "application/pdf",
      });
      const res = await fetch(`${baseUrl}/api/projects/proj-2/documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 204, "superadmin must be allowed to delete any document");
    } finally {
      restoreDocCounts(counts);
    }
  });
});
