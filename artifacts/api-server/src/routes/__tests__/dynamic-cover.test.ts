import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { PROJECTS, DOCUMENTS } from "../../data/seed";
import {
  snapToLandmark,
  pickLiveCoverImage,
  pickClientCoverImage,
  enrichProjectForRole,
  MILESTONE_MOCKUP_MAP,
  type PhotoDoc,
} from "../../lib/dynamic-cover";

// Task #134 — dynamic project card images. Verifies:
//   * milestone snapping (midpoints 12.5/37.5/62.5/87.5)
//   * latest construction-progress photo wins (and only that category)
//   * Drive-hosted photos prefer driveThumbnailLink
//   * role gating: client never sees liveCoverImage; KONTi never sees clientCoverImage
//   * end-to-end through GET /api/projects and GET /api/projects/:id

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

async function login(baseUrl: string, email: string, password = "konti2026"): Promise<LoginResponse> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login for ${email} should succeed`);
  return (await res.json()) as LoginResponse;
}

test("snapToLandmark uses midpoints 12.5 / 37.5 / 62.5 / 87.5", () => {
  // Below first midpoint → 0
  assert.equal(snapToLandmark(0), 0);
  assert.equal(snapToLandmark(12.49), 0);
  // At midpoint rounds UP
  assert.equal(snapToLandmark(12.5), 25);
  assert.equal(snapToLandmark(37.49), 25);
  assert.equal(snapToLandmark(37.5), 50);
  assert.equal(snapToLandmark(62.49), 50);
  assert.equal(snapToLandmark(62.5), 75);
  assert.equal(snapToLandmark(87.49), 75);
  assert.equal(snapToLandmark(87.5), 100);
  assert.equal(snapToLandmark(100), 100);
  // Out-of-range clamps; NaN guards to 0
  assert.equal(snapToLandmark(150), 100);
  assert.equal(snapToLandmark(-10), 0);
  assert.equal(snapToLandmark(NaN), 0);
});

test("pickClientCoverImage returns the curated mockup for the snapped landmark", () => {
  // proj-1 (18 %) → 25
  const a = pickClientCoverImage({ id: "x", progressPercent: 18 });
  assert.equal(a.landmark, 25);
  assert.equal(a.url, MILESTONE_MOCKUP_MAP[25]);
  // proj-2 (67 %) → 75
  const b = pickClientCoverImage({ id: "x", progressPercent: 67 });
  assert.equal(b.landmark, 75);
  assert.equal(b.url, MILESTONE_MOCKUP_MAP[75]);
  // proj-3 (100 %) → 100
  const c = pickClientCoverImage({ id: "x", progressPercent: 100 });
  assert.equal(c.landmark, 100);
  assert.equal(c.url, MILESTONE_MOCKUP_MAP[100]);
});

test("pickLiveCoverImage chooses the latest construction_progress photo and ignores other categories", () => {
  const project = { id: "p", progressPercent: 50, coverImage: "/seed-images/fallback.png" };
  const docs: PhotoDoc[] = [
    { type: "photo", photoCategory: "site_conditions", uploadedAt: "2026-04-30T00:00:00Z", imageUrl: "/seed-images/site.png" },
    { type: "photo", photoCategory: "construction_progress", uploadedAt: "2026-04-08T00:00:00Z", imageUrl: "/seed-images/old.png" },
    { type: "photo", photoCategory: "construction_progress", uploadedAt: "2026-04-12T00:00:00Z", imageUrl: "/seed-images/latest.png" },
    { type: "photo", photoCategory: "final", uploadedAt: "2026-04-15T00:00:00Z", imageUrl: "/seed-images/final.png" },
    { type: "pdf", uploadedAt: "2026-04-20T00:00:00Z" },
  ];
  assert.equal(pickLiveCoverImage(project, docs), "/seed-images/latest.png");
});

test("pickLiveCoverImage falls back to coverImage when there are no qualifying photos", () => {
  const project = { id: "p", progressPercent: 50, coverImage: "/seed-images/fallback.png" };
  // Only site_conditions photos — nothing in `construction_progress`.
  const docs: PhotoDoc[] = [
    { type: "photo", photoCategory: "site_conditions", uploadedAt: "2026-04-30T00:00:00Z", imageUrl: "/seed-images/site.png" },
  ];
  assert.equal(pickLiveCoverImage(project, docs), "/seed-images/fallback.png");
  assert.equal(pickLiveCoverImage(project, []), "/seed-images/fallback.png");
});

test("pickLiveCoverImage prefers Drive thumbnail then proxy URL over inline imageUrl", () => {
  const project = { id: "p", progressPercent: 50 };
  // Thumbnail wins over everything else.
  assert.equal(
    pickLiveCoverImage(project, [{
      type: "photo", photoCategory: "construction_progress", uploadedAt: "2026-04-15T00:00:00Z",
      imageUrl: "data:image/png;base64,xxx",
      driveThumbnailLink: "https://drive.example/thumb.png",
      driveDownloadProxyUrl: "/api/integrations/drive/files/abc/download",
    }]),
    "https://drive.example/thumb.png",
  );
  // Without thumbnail, the proxy URL wins.
  assert.equal(
    pickLiveCoverImage(project, [{
      type: "photo", photoCategory: "construction_progress", uploadedAt: "2026-04-15T00:00:00Z",
      imageUrl: "/seed-images/local.png",
      driveDownloadProxyUrl: "/api/integrations/drive/files/abc/download",
    }]),
    "/api/integrations/drive/files/abc/download",
  );
});

test("enrichProjectForRole emits clientCoverImage only for client role and never the live field", () => {
  const project = { id: "x", progressPercent: 67, coverImage: "/seed-images/fallback.png" };
  const docs: PhotoDoc[] = [{
    type: "photo", photoCategory: "construction_progress",
    uploadedAt: "2026-04-12T00:00:00Z", imageUrl: "/seed-images/latest.png",
  }];

  const forClient = enrichProjectForRole(project, "client", docs);
  assert.equal(forClient.clientCoverImage, MILESTONE_MOCKUP_MAP[75]);
  assert.equal(forClient.clientCoverLandmark, 75);
  assert.equal((forClient as { liveCoverImage?: string }).liveCoverImage, undefined,
    "client payload must NEVER include liveCoverImage");
  assert.equal((forClient as { liveCoverUploadedAt?: string }).liveCoverUploadedAt, undefined,
    "client payload must NEVER include liveCoverUploadedAt");

  for (const role of ["superadmin", "admin", "team", "architect"]) {
    const forStaff = enrichProjectForRole(project, role, docs);
    assert.equal(forStaff.liveCoverImage, "/seed-images/latest.png");
    // The uploadedAt of the chosen photo flows through so the dashboard
    // can surface "from {date}" in the staff alt text.
    assert.equal(forStaff.liveCoverUploadedAt, "2026-04-12T00:00:00Z");
    assert.equal((forStaff as { clientCoverImage?: string }).clientCoverImage, undefined,
      `${role} payload must NEVER include clientCoverImage`);
    assert.equal((forStaff as { clientCoverLandmark?: number }).clientCoverLandmark, undefined);
  }
});

test("enrichProjectForRole omits liveCoverUploadedAt when falling back to coverImage", () => {
  // No qualifying photos → `liveCoverImage` falls back to coverImage; the
  // date field stays absent so the dashboard knows it's a static fallback.
  const project = { id: "x", progressPercent: 30, coverImage: "/seed-images/fallback.png" };
  const enriched = enrichProjectForRole(project, "admin", []);
  assert.equal(enriched.liveCoverImage, "/seed-images/fallback.png");
  assert.equal(enriched.liveCoverUploadedAt, undefined);
});

// ---- End-to-end through the live router ------------------------------------

test("GET /api/projects enriches each project with the role-correct cover (superadmin)", async () => {
  await withServer(async (baseUrl) => {
    const { token } = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{
      id: string;
      liveCoverImage?: string;
      liveCoverUploadedAt?: string;
      clientCoverImage?: string;
      clientCoverLandmark?: number;
    }>;
    // proj-2 has a construction_progress doc (doc-2-8) uploaded 2026-04-12;
    // doc-2-11 is older → the latest one wins.
    const proj2 = list.find((p) => p.id === "proj-2");
    assert.ok(proj2, "proj-2 should be visible to superadmin");
    assert.equal(proj2!.liveCoverImage, "/seed-images/konti-portfolio-collage.png");
    // The uploadedAt of the chosen photo (doc-2-8 → 2026-04-12) flows
    // through so the staff alt text can read "latest site photo (from …)".
    assert.equal(typeof proj2!.liveCoverUploadedAt, "string");
    assert.match(proj2!.liveCoverUploadedAt!, /^2026-04-12/);
    assert.equal(proj2!.clientCoverImage, undefined);
    assert.equal(proj2!.clientCoverLandmark, undefined);
    // proj-1 has no construction_progress photo → falls back to coverImage.
    const proj1 = list.find((p) => p.id === "proj-1");
    assert.ok(proj1);
    const seedProj1 = PROJECTS.find((p) => p.id === "proj-1")!;
    assert.equal(proj1!.liveCoverImage, seedProj1.coverImage);
  });
});

test("GET /api/projects gives the client a milestone mockup and never a live photo", async () => {
  await withServer(async (baseUrl) => {
    // user-client-1 owns proj-1 (18 %), proj-2 (67 %), proj-3 (100 %).
    const { token } = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{
      id: string;
      liveCoverImage?: string;
      clientCoverImage?: string;
      clientCoverLandmark?: number;
    }>;
    const expected: Record<string, { landmark: number; url: string }> = {
      "proj-1": { landmark: 25, url: MILESTONE_MOCKUP_MAP[25] },
      "proj-2": { landmark: 75, url: MILESTONE_MOCKUP_MAP[75] },
      "proj-3": { landmark: 100, url: MILESTONE_MOCKUP_MAP[100] },
    };
    for (const p of list) {
      const want = expected[p.id];
      assert.ok(want, `unexpected client-visible project ${p.id}`);
      assert.equal(p.clientCoverLandmark, want.landmark, `landmark for ${p.id}`);
      assert.equal(p.clientCoverImage, want.url, `mockup for ${p.id}`);
      assert.equal(p.liveCoverImage, undefined,
        `client must never see liveCoverImage on ${p.id}`);
    }
  });
});

test("GET /api/projects/:id detail respects role gating", async () => {
  await withServer(async (baseUrl) => {
    const staff = await login(baseUrl, "demo@konti.com");
    const client = await login(baseUrl, "client@konti.com");

    const staffRes = await fetch(`${baseUrl}/api/projects/proj-2`, {
      headers: { Authorization: `Bearer ${staff.token}` },
    });
    const staffBody = (await staffRes.json()) as Record<string, unknown>;
    assert.equal(staffBody["liveCoverImage"], "/seed-images/konti-portfolio-collage.png");
    assert.equal(staffBody["clientCoverImage"], undefined);

    const clientRes = await fetch(`${baseUrl}/api/projects/proj-2`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    const clientBody = (await clientRes.json()) as Record<string, unknown>;
    assert.equal(clientBody["clientCoverImage"], MILESTONE_MOCKUP_MAP[75]);
    assert.equal(clientBody["clientCoverLandmark"], 75);
    assert.equal(clientBody["liveCoverImage"], undefined);
  });
});

test("pickLiveCoverImage prefers a featuredAsCover photo even when it is not the latest (Task #136)", () => {
  const project = { id: "p", progressPercent: 50, coverImage: "/seed-images/fallback.png" };
  const docs: PhotoDoc[] = [
    // Newest qualifying photo by date — should LOSE to the older flagged one.
    {
      type: "photo", photoCategory: "construction_progress",
      uploadedAt: "2026-04-30T00:00:00Z", imageUrl: "/seed-images/newest.png",
    },
    // Older but staff-flagged "hero" — wins because of featuredAsCover.
    {
      type: "photo", photoCategory: "construction_progress",
      uploadedAt: "2026-03-01T00:00:00Z", imageUrl: "/seed-images/hero.png",
      featuredAsCover: true,
    },
  ];
  assert.equal(pickLiveCoverImage(project, docs), "/seed-images/hero.png");
});

test("featuredAsCover only counts when the photo is also construction_progress", () => {
  // A flagged photo in a different bucket must NOT bypass the category
  // filter; the picker still falls back to coverImage.
  const project = { id: "p", progressPercent: 50, coverImage: "/seed-images/fallback.png" };
  const docs: PhotoDoc[] = [
    {
      type: "photo", photoCategory: "site_conditions",
      uploadedAt: "2026-04-30T00:00:00Z", imageUrl: "/seed-images/site.png",
      featuredAsCover: true,
    },
  ];
  assert.equal(pickLiveCoverImage(project, docs), "/seed-images/fallback.png");
});

// ---- PATCH /projects/:projectId/documents/:documentId — featured cover ----

async function findStaffPhotoIds(baseUrl: string, token: string, projectId: string): Promise<string[]> {
  const docsRes = await fetch(`${baseUrl}/api/projects/${projectId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(docsRes.status, 200);
  const docs = (await docsRes.json()) as Array<{ id: string; type?: string; photoCategory?: string }>;
  return docs
    .filter((d) => d.type === "photo" && d.photoCategory === "construction_progress")
    .map((d) => d.id);
}

test("PATCH featuredAsCover flips other flagged photos off and updates liveCoverImage", async () => {
  await withServer(async (baseUrl) => {
    const { token } = await login(baseUrl, "demo@konti.com");
    const projectId = "proj-2";
    const photoIds = await findStaffPhotoIds(baseUrl, token, projectId);
    assert.ok(photoIds.length >= 2, "proj-2 needs at least two construction_progress photos for this test");
    const [firstId, secondId] = photoIds as [string, string];

    // Flag the first photo. Server should respond with the doc carrying the flag.
    const flagFirst = await fetch(`${baseUrl}/api/projects/${projectId}/documents/${firstId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featuredAsCover: true }),
    });
    assert.equal(flagFirst.status, 200);
    const flaggedFirst = (await flagFirst.json()) as { id: string; featuredAsCover?: boolean };
    assert.equal(flaggedFirst.featuredAsCover, true);

    // The project's liveCoverImage should now point at the flagged photo,
    // overriding the latest-by-date pick.
    const projAfterFirst = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bodyFirst = (await projAfterFirst.json()) as { liveCoverImage?: string };
    const docsList = (DOCUMENTS as Record<string, Array<{ id: string; imageUrl?: string }>>)[projectId] ?? [];
    const firstDoc = docsList.find((d) => d.id === firstId);
    assert.ok(firstDoc, "first photo should still exist in DOCUMENTS");
    assert.equal(bodyFirst.liveCoverImage, firstDoc!.imageUrl,
      "liveCoverImage should match the flagged photo's imageUrl");

    // Flag a second photo. The server must flip the first one off so only
    // one cover is ever active.
    const flagSecond = await fetch(`${baseUrl}/api/projects/${projectId}/documents/${secondId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featuredAsCover: true }),
    });
    assert.equal(flagSecond.status, 200);

    const docsAfter = (DOCUMENTS as Record<string, Array<{ id: string; featuredAsCover?: boolean }>>)[projectId] ?? [];
    const flaggedNow = docsAfter.filter((d) => d.featuredAsCover === true).map((d) => d.id);
    assert.deepEqual(flaggedNow, [secondId],
      "exactly one photo (the latest flagged) should carry featuredAsCover");

    // Cleanup so this test doesn't leak state into subsequent tests / runs:
    // unset the flag on whatever is currently flagged.
    await fetch(`${baseUrl}/api/projects/${projectId}/documents/${secondId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featuredAsCover: false }),
    });
    const finalDocs = (DOCUMENTS as Record<string, Array<{ featuredAsCover?: boolean }>>)[projectId] ?? [];
    assert.equal(finalDocs.filter((d) => d.featuredAsCover === true).length, 0,
      "test teardown should leave proj-2 with no flagged cover");
  });
});

test("PATCH featuredAsCover rejects non-construction-progress photos", async () => {
  await withServer(async (baseUrl) => {
    const { token } = await login(baseUrl, "demo@konti.com");
    // Find a non-photo or non-construction_progress document on proj-2.
    const docsRes = await fetch(`${baseUrl}/api/projects/proj-2/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const docs = (await docsRes.json()) as Array<{ id: string; type?: string; photoCategory?: string }>;
    const target = docs.find((d) => d.type !== "photo" || d.photoCategory !== "construction_progress");
    assert.ok(target, "proj-2 should have at least one non-cover-eligible document");
    const res = await fetch(`${baseUrl}/api/projects/proj-2/documents/${target!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ featuredAsCover: true }),
    });
    assert.equal(res.status, 400);
  });
});

test("PATCH with neither isClientVisible nor featuredAsCover returns 400", async () => {
  await withServer(async (baseUrl) => {
    const { token } = await login(baseUrl, "demo@konti.com");
    const photoIds = await findStaffPhotoIds(baseUrl, token, "proj-2");
    const res = await fetch(`${baseUrl}/api/projects/proj-2/documents/${photoIds[0]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test("DOCUMENTS array is not mutated by the picker (no gallery reordering)", () => {
  // Important regression guard: we sort a slice, not the live array, so the
  // gallery's UI order in the documents tab stays untouched.
  const original = ((DOCUMENTS as Record<string, unknown[]>)["proj-2"] ?? []).slice();
  pickLiveCoverImage(
    { id: "proj-2", progressPercent: 67 },
    (DOCUMENTS as Record<string, PhotoDoc[]>)["proj-2"] ?? [],
  );
  const after = (DOCUMENTS as Record<string, unknown[]>)["proj-2"] ?? [];
  assert.deepEqual(after.map((d) => (d as { id: string }).id), original.map((d) => (d as { id: string }).id));
});
