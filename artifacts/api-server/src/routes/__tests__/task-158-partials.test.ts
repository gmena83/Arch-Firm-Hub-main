// Task #158 — Coverage for the four partial-ship closures:
//   A-05: POST /projects/:projectId/documents/:documentId/versions
//   A-09: PATCH /projects/:projectId/documents/:documentId  (caption + dual gate)
//   B-02: PUT  /projects/:projectId/contractor-estimate/lines  (laborType=lump)
//   C-01: PunchlistItem.category surfaces from GET /projects/:projectId/punchlist
//
// Each block exercises the public HTTP surface so any regression at the
// route, persistence, or seed layer fails the suite — not just the
// in-memory shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { DOCUMENTS, PROJECT_PUNCHLIST, punchlistKey } from "../../data/seed";
import { PROJECT_CONTRACTOR_ESTIMATE } from "../../routes/estimating";

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

async function login(baseUrl: string, email: string): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "konti2026" }),
  });
  assert.equal(res.status, 200, `login for ${email} should succeed`);
  const body = (await res.json()) as LoginResponse;
  return { token: body.token, userId: body.user.id };
}

function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ---------------------------------------------------------------------------
// A-05  POST /projects/:projectId/documents/:documentId/versions
// ---------------------------------------------------------------------------

test("A-05: team can append a new document version; primary metadata rolls forward", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    // Use a doc with an existing versions[] history so we can prove
    // auto-increment from the existing max.
    const doc = (DOCUMENTS["proj-1"] ?? []).find((d) => Array.isArray(d.versions) && d.versions.length > 0);
    assert.ok(doc, "fixture must include a versioned doc on proj-1");
    const beforeCount = (doc.versions ?? []).length;
    const expectedNext = (doc.versions ?? []).reduce((m, v) => Math.max(m, v.version ?? 0), 0) + 1;

    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${doc.id}/versions`,
      {
        method: "POST",
        headers: authHeaders(team.token, true),
        body: JSON.stringify({ fileSize: "9.9 MB", notes: "Bumped per redline", notesEs: "Actualización por redline" }),
      },
    );
    assert.equal(res.status, 201, "team should be allowed to append a version");
    const body = (await res.json()) as { versions: Array<{ version: number; fileSize: string; notes?: string }>; fileSize: string; uploadedAt: string };
    assert.equal(body.versions.length, beforeCount + 1, "versions[] should grow by exactly one");
    const latest = body.versions[body.versions.length - 1];
    assert.equal(latest.version, expectedNext, "version should auto-increment from the prior max");
    assert.equal(latest.fileSize, "9.9 MB");
    assert.equal(latest.notes, "Bumped per redline");
    // Primary metadata rolls forward to the new version (so list views
    // surface the latest size + uploader without a separate fetch).
    assert.equal(body.fileSize, "9.9 MB", "primary fileSize should roll forward");
  });
});

test("A-05: appending a version preserves the original uploader (A-09 dual-gate invariant)", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    const client = await login(baseUrl, "client@konti.com");
    const list = DOCUMENTS["proj-1"] ?? [];
    assert.ok(list.length >= 1);
    // Pretend the client originally uploaded list[0].
    (list[0] as { uploadedBy?: string }).uploadedBy = client.userId;
    const docId = list[0].id;
    // Team uploads a new version.
    const verRes = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${docId}/versions`,
      {
        method: "POST",
        headers: authHeaders(team.token, true),
        body: JSON.stringify({ fileSize: "2.0 MB" }),
      },
    );
    assert.equal(verRes.status, 201);
    // Original uploader (the client) must STILL be able to edit the caption.
    const captionRes = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${docId}`,
      {
        method: "PATCH",
        headers: authHeaders(client.token, true),
        body: JSON.stringify({ caption: "Owner caption after team version" }),
      },
    );
    assert.equal(
      captionRes.status,
      200,
      "appending a version must not strip the original uploader's edit rights",
    );
  });
});

test("A-05: client cannot append a version (team-only)", async () => {
  await withServer(async (baseUrl) => {
    const client = await login(baseUrl, "client@konti.com");
    const doc = (DOCUMENTS["proj-1"] ?? [])[0];
    assert.ok(doc, "proj-1 must have at least one doc");
    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${doc.id}/versions`,
      {
        method: "POST",
        headers: authHeaders(client.token, true),
        body: JSON.stringify({ fileSize: "1.0 MB" }),
      },
    );
    assert.equal(res.status, 403, "client role should not be allowed to append versions");
  });
});

// ---------------------------------------------------------------------------
// A-09  PATCH /documents/:id  caption + dual gate
// ---------------------------------------------------------------------------

test("A-09: team can edit any document caption", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    const doc = (DOCUMENTS["proj-1"] ?? [])[0];
    assert.ok(doc);
    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${doc.id}`,
      {
        method: "PATCH",
        headers: authHeaders(team.token, true),
        body: JSON.stringify({ caption: "Team-edited caption" }),
      },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { caption?: string };
    assert.equal(body.caption, "Team-edited caption");
  });
});

test("A-09: client can edit caption ONLY on docs they uploaded; rejected on others", async () => {
  await withServer(async (baseUrl) => {
    const client = await login(baseUrl, "client@konti.com");
    const list = DOCUMENTS["proj-1"] ?? [];
    assert.ok(list.length >= 2, "proj-1 needs at least two docs for this test");
    // Deterministically: list[0] is "owned by client", list[1] is "owned by Carla".
    (list[0] as { uploadedBy?: string }).uploadedBy = client.userId;
    (list[1] as { uploadedBy?: string }).uploadedBy = "Carla Gautier";

    const okRes = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${list[0].id}`,
      {
        method: "PATCH",
        headers: authHeaders(client.token, true),
        body: JSON.stringify({ caption: "Client edited" }),
      },
    );
    assert.equal(okRes.status, 200, "client should edit their own doc's caption");

    const denyRes = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${list[1].id}`,
      {
        method: "PATCH",
        headers: authHeaders(client.token, true),
        body: JSON.stringify({ caption: "Should be rejected" }),
      },
    );
    assert.equal(denyRes.status, 403, "client must not edit a doc they did not upload");
  });
});

test("A-09: client cannot flip team-only fields even on their own doc", async () => {
  await withServer(async (baseUrl) => {
    const client = await login(baseUrl, "client@konti.com");
    const list = DOCUMENTS["proj-1"] ?? [];
    (list[0] as { uploadedBy?: string }).uploadedBy = client.userId;
    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/documents/${list[0].id}`,
      {
        method: "PATCH",
        headers: authHeaders(client.token, true),
        body: JSON.stringify({ isClientVisible: false, caption: "trojan" }),
      },
    );
    assert.equal(res.status, 403, "team-only fields must reject client requests");
  });
});

// ---------------------------------------------------------------------------
// B-02  laborType=lump normalises qty/unit and survives a round-trip
// ---------------------------------------------------------------------------

test("B-02: PUT lines with laborType=lump forces qty=1 unit=lump", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    // Seed a contractor estimate first
    const seedRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
      method: "POST",
      headers: authHeaders(team.token, true),
      body: JSON.stringify({ scope: ["pool"], source: "test" }),
    });
    assert.equal(seedRes.status, 200, "seed estimate must succeed");
    const est = PROJECT_CONTRACTOR_ESTIMATE["proj-1"];
    assert.ok(est, "estimate persisted");
    // Build a labor-only line with lump pricing.
    const updateBody = {
      lines: [
        {
          id: "line-test-1",
          category: "labor",
          description: "Subcontractor crew — 1 week",
          descriptionEs: "Cuadrilla subcontratista — 1 semana",
          quantity: 999, // server should normalise to 1
          unit: "hours",  // server should normalise to "lump"
          unitPrice: 4500,
          laborType: "lump",
        },
        {
          id: "line-test-2",
          category: "labor",
          description: "Tile setter",
          descriptionEs: "Colocador de losa",
          quantity: 40,
          unit: "hours",
          unitPrice: 35,
          laborType: "hourly",
        },
      ],
    };
    const res = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate/lines`, {
      method: "PUT",
      headers: authHeaders(team.token, true),
      body: JSON.stringify(updateBody),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { lines: Array<{ id: string; category: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; laborType?: string }> };
    const lump = body.lines.find((l) => l.id === "line-test-1");
    const hourly = body.lines.find((l) => l.id === "line-test-2");
    assert.ok(lump && hourly);
    assert.equal(lump.quantity, 1, "lump labor must normalise quantity to 1");
    assert.equal(lump.unit, "lump", "lump labor must normalise unit to 'lump'");
    assert.equal(lump.lineTotal, 4500, "lump lineTotal === unitPrice (single lump sum)");
    assert.equal(lump.laborType, "lump");
    assert.equal(hourly.quantity, 40, "hourly labor preserves quantity");
    assert.equal(hourly.unit, "hours", "hourly labor preserves unit");
    assert.equal(hourly.lineTotal, 1400, "hourly lineTotal === qty * unitPrice");
    assert.equal(hourly.laborType, "hourly");
  });
});

test("B-02: variance-report estimated bucket reflects lump+hourly normalised line totals", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    // Re-seed the estimate with two labor lines: one lump, one hourly.
    await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
      method: "POST",
      headers: authHeaders(team.token, true),
      body: JSON.stringify({ scope: ["pool"], source: "test" }),
    });
    const seedLines = {
      lines: [
        { id: "var-lump", category: "labor", description: "Crew week", descriptionEs: "Cuadrilla semana", quantity: 999, unit: "hours", unitPrice: 4500, laborType: "lump" },
        { id: "var-hourly", category: "labor", description: "Painter", descriptionEs: "Pintor", quantity: 40, unit: "hours", unitPrice: 35, laborType: "hourly" },
      ],
    };
    const lineRes = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate/lines`, {
      method: "PUT",
      headers: authHeaders(team.token, true),
      body: JSON.stringify(seedLines),
    });
    assert.equal(lineRes.status, 200);
    const lineBody = (await lineRes.json()) as { lines: Array<{ id: string; lineTotal: number }> };
    const lump = lineBody.lines.find((l) => l.id === "var-lump")!;
    const hourly = lineBody.lines.find((l) => l.id === "var-hourly")!;
    // Pull the variance report and check the labor bucket.
    const varRes = await fetch(`${baseUrl}/api/projects/proj-1/variance-report`, {
      headers: authHeaders(team.token),
    });
    assert.equal(varRes.status, 200);
    const varBody = (await varRes.json()) as {
      buckets: Array<{ key: string; estimated: number; variance: number; variancePercent: number | null }>;
    };
    const labor = varBody.buckets.find((b) => b.key === "labor");
    assert.ok(labor, "variance report must include a labor bucket");
    // Estimated labor must be at least lump (4500) + hourly (1400) = 5900.
    // (The bucket may include other seeded labor lines; we only assert our
    // contributions land in it, which is enough to prove lump+hourly both
    // surface honest amount-deltas to the variance math.)
    assert.ok(
      labor.estimated >= lump.lineTotal + hourly.lineTotal,
      `labor bucket estimated (${labor.estimated}) must include both lump (${lump.lineTotal}) and hourly (${hourly.lineTotal}) line totals`,
    );
    assert.equal(lump.lineTotal, 4500, "lump labor lineTotal === unitPrice (single lump sum)");
    assert.equal(hourly.lineTotal, 1400, "hourly labor lineTotal === qty * unitPrice");
  });
});

// ---------------------------------------------------------------------------
// C-01  Punchlist items expose category metadata
// ---------------------------------------------------------------------------

test("C-01: GET punchlist returns category + bilingual category labels for tagged seed items", async () => {
  await withServer(async (baseUrl) => {
    const team = await login(baseUrl, "demo@konti.com");
    const res = await fetch(
      `${baseUrl}/api/projects/proj-2/punchlist?phase=construction`,
      { headers: authHeaders(team.token) },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: Array<{ id: string; category?: string; categoryEs?: string; photoUrl?: string }> };
    const tagged = body.items.filter((i) => typeof i.category === "string");
    assert.ok(tagged.length >= 4, `expected several categorised seed items, got ${tagged.length}`);
    // At least one item should also carry a thumbnail URL.
    const withPhoto = body.items.find((i) => typeof i.photoUrl === "string");
    assert.ok(withPhoto, "at least one seed item should expose a photoUrl thumbnail");
    // Sanity-check that we cover the four bilingual buckets we seeded.
    const cats = new Set(tagged.map((i) => i.category));
    for (const expected of ["Interior Finishes", "Pool & Outdoor", "Electrical", "Plumbing"]) {
      assert.ok(cats.has(expected), `missing category ${expected} in seed`);
    }
    // categoryEs travels alongside category.
    const interior = tagged.find((i) => i.category === "Interior Finishes");
    assert.equal(interior?.categoryEs, "Acabados Interiores");
  });
});

test("C-01: seed PROJECT_PUNCHLIST proj-2 carries bilingual categories", () => {
  const items = PROJECT_PUNCHLIST[punchlistKey("proj-2", "construction")] ?? [];
  assert.ok(items.length > 0);
  const tagged = items.filter((i) => typeof i.category === "string");
  assert.ok(tagged.length >= 4, "seed must keep at least four categorised items");
});
