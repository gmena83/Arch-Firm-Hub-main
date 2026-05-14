import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { PROJECTS, DOCUMENTS, PROJECT_ACTIVITIES } from "../../data/seed";

// Regression coverage for Task #60: POST /projects/:projectId/documents
// (auth, validation, runtime-created project IDs, seed integrity, activity).

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

function snapshotProjectIds(): Set<string> {
  return new Set(PROJECTS.map((p) => p.id));
}

function restoreProjects(originalIds: Set<string>) {
  for (let i = PROJECTS.length - 1; i >= 0; i--) {
    const p = PROJECTS[i];
    if (p && !originalIds.has(p.id)) {
      delete (DOCUMENTS as Record<string, unknown[]>)[p.id];
      PROJECTS.splice(i, 1);
    }
  }
}

test("admin can upload a PDF to a runtime-created demo project (regression: Task #60)", async () => {
  const original = snapshotProjectIds();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");

      // 1. Create a fresh project the way the demo flow does — yields
      //    a `proj-${Date.now()}` ID with no DOCUMENTS bucket seeded.
      const createRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Demo Upload Project",
          clientName: "Tatiana QA",
          location: "San Juan, Puerto Rico",
          budgetAllocated: 100000,
        }),
      });
      assert.equal(createRes.status, 201);
      const project = (await createRes.json()) as { id: string };
      assert.match(project.id, /^proj-\d+$/);

      // 2. Upload a PDF metadata row — this used to be the failure path.
      const uploadRes = await fetch(`${baseUrl}/api/projects/${project.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "site-survey.pdf",
          category: "client_review",
          type: "pdf",
          isClientVisible: true,
          fileSize: "1.2 MB",
          mimeType: "application/pdf",
        }),
      });
      assert.equal(uploadRes.status, 201, "upload to runtime-created project must succeed");
      const doc = (await uploadRes.json()) as { id: string; projectId: string; name: string; category: string };
      assert.equal(doc.projectId, project.id);
      assert.equal(doc.name, "site-survey.pdf");
      assert.equal(doc.category, "client_review");

      // 3. GET should now reflect the new document.
      const listRes = await fetch(`${baseUrl}/api/projects/${project.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(listRes.status, 200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      assert.ok(list.some((d) => d.id === doc.id), "new doc must appear in GET /documents");
    });
  } finally {
    restoreProjects(original);
  }
});

test("superadmin can upload JPG and PNG to seeded projects (no regression on proj-1/2/3)", async () => {
  const original = snapshotProjectIds();
  const seededDocCounts = Object.fromEntries(
    Array.from(original).map((pid) => [pid, ((DOCUMENTS as Record<string, unknown[]>)[pid] ?? []).length]),
  );
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "tatiana@menatech.cloud", "Konti123");

      // expectedType pins the Document.type enum normalization. Image uploads
      // (#105) now require a photoCategory; the seed and gallery rely on this
      // bucket so the server validates it on POST.
      for (const [projectId, mime, ext, expectedType, photoCategory] of [
        ["proj-1", "image/jpeg", "jpg", "photo", "construction_progress"],
        ["proj-2", "image/png", "png", "photo", "site_conditions"],
        ["proj-3", "application/pdf", "pdf", "pdf", undefined],
      ] as const) {
        const res = await fetch(`${baseUrl}/api/projects/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: `tatiana-upload.${ext}`,
            category: "internal",
            isClientVisible: false,
            fileSize: "2.5 MB",
            mimeType: mime,
            ...(photoCategory ? { photoCategory } : {}),
          }),
        });
        assert.equal(res.status, 201, `${projectId} should accept ${ext} upload`);
        const doc = (await res.json()) as { type: string; category: string; photoCategory?: string };
        assert.equal(doc.type, expectedType, `${ext} upload should normalize type to ${expectedType}`);
        assert.equal(doc.category, "internal");
        if (photoCategory) {
          assert.equal(doc.photoCategory, photoCategory, "photoCategory must round-trip on photo uploads");
        }
      }

      // Server-side validation (#105): a photo upload missing photoCategory
      // must be rejected so the gallery never receives an uncategorized image.
      const badPhoto = await fetch(`${baseUrl}/api/projects/proj-2/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "uncategorized-photo.jpg",
          category: "internal",
          isClientVisible: false,
          fileSize: "1.0 MB",
          mimeType: "image/jpeg",
        }),
      });
      assert.equal(badPhoto.status, 400, "photo upload without photoCategory must be rejected");

      // Existing seed data must still be intact (no documents removed).
      for (const pid of original) {
        const list = (DOCUMENTS as Record<string, unknown[]>)[pid] ?? [];
        const expected = (seededDocCounts[pid] ?? 0) + 1;
        assert.equal(list.length, expected, `${pid} should have one new doc on top of the seed`);
      }
    });
  } finally {
    // Restore to exact seed state so sibling tests aren't polluted.
    for (const [pid, count] of Object.entries(seededDocCounts)) {
      const arr = (DOCUMENTS as Record<string, unknown[]>)[pid];
      if (arr) arr.length = count;
    }
    restoreProjects(original);
  }
});

test("architect (team-role) can upload and an activity-feed entry is appended", async () => {
  // Architect maps to the "team" role alias and must be allowed to upload.
  const seededDocCount = ((DOCUMENTS as Record<string, unknown[]>)["proj-2"] ?? []).length;
  const seededActivityCount = (PROJECT_ACTIVITIES["proj-2"] ?? []).length;
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "michelle@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-2/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `architect-plan-${Date.now()}.pdf`,
          category: "design",
          fileSize: "1.2 MB",
          mimeType: "application/pdf",
        }),
      });
      assert.equal(res.status, 201, "architect role must be allowed to upload");
      const doc = (await res.json()) as { id: string; type: string; category: string; name: string };
      assert.equal(doc.type, "pdf");
      assert.equal(doc.category, "design");

      const activities = PROJECT_ACTIVITIES["proj-2"] ?? [];
      assert.equal(
        activities.length,
        seededActivityCount + 1,
        "exactly one new activity entry should be appended for this upload",
      );
      const newest = activities[0];
      assert.ok(newest, "new activity must exist");
      assert.equal(newest.type, "receipts_upload");
      assert.ok(newest.description.includes(doc.name), "EN description should mention the file name");
      assert.ok(newest.descriptionEs.includes(doc.name), "ES description should mention the file name");
    });
  } finally {
    const arr = (DOCUMENTS as Record<string, unknown[]>)["proj-2"];
    if (arr) arr.length = seededDocCount;
    const acts = PROJECT_ACTIVITIES["proj-2"];
    if (acts) acts.length = seededActivityCount;
  }
});

test("upload to a nonexistent project returns 404 with a structured error", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-does-not-exist/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "x.pdf", category: "internal" }),
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string; message?: string };
    assert.equal(body.error, "not_found");
    assert.ok(body.message);
  });
});

test("non-owner client cannot upload documents (403)", async () => {
  // Client uploads are now allowed for owning clients only (forced to
  // category=client_review and isClientVisible=true server-side). A
  // non-owning client must still be rejected at the ownership gate.
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "client-try.pdf", category: "client_review" }),
    });
    assert.equal(res.status, 403);
  });
});

test("upload requires authentication (401)", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "anon.pdf", category: "internal" }),
    });
    assert.equal(res.status, 401);
  });
});

test("upload validates required fields (400)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");

    const missingName = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ category: "internal" }),
    });
    assert.equal(missingName.status, 400);

    const missingCategory = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "x.pdf" }),
    });
    assert.equal(missingCategory.status, 400);
  });
});
