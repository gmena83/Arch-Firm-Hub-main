import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import {
  PROJECTS,
  PROJECT_PERMIT_AUTHORIZATIONS,
  PROJECT_REQUIRED_SIGNATURES,
  PROJECT_PROPOSALS,
  USERS,
  DOCUMENTS,
} from "../../data/seed";

// Audit coverage for every POST/PATCH/DELETE in routes/projects.ts that
// accepts the "client" role. Each endpoint must reject non-owning clients
// with 403 and let owning clients through (subject to other validation).
//
// Endpoints under test:
//   POST /projects/:id/advance-phase          (covered separately)
//   POST /projects/:id/decline-phase
//   POST /projects/:id/proposals/:pid/approve
//   POST /projects/:id/authorize-permits
//   POST /projects/:id/sign/:signatureId

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
  assert.equal(res.status, 200, `login for ${email} should succeed`);
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// Snapshot/restore a project's mutable phase fields so individual tests can
// flip phases without poisoning the shared in-memory seed.
function snapshotProject(id: string) {
  const p = PROJECTS.find((x) => x.id === id)!;
  return { ref: p, snapshot: { ...(p as Record<string, unknown>) } };
}
function restoreProject(s: ReturnType<typeof snapshotProject>) {
  Object.assign(s.ref, s.snapshot);
}

function setPhase(projectId: string, phase: string) {
  const p = PROJECTS.find((x) => x.id === projectId) as { phase: string };
  p.phase = phase;
}

// ----------------------------------------------------------------------------
// decline-phase
// ----------------------------------------------------------------------------

test("decline-phase: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/decline-phase`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ reason: "no" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "forbidden");
  });
});

test("decline-phase: owning client → 200", async () => {
  await withServer(async (baseUrl) => {
    const snap = snapshotProject("proj-1");
    try {
      setPhase("proj-1", "consultation");
      const token = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/decline-phase`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ reason: "scheduling conflict" }),
      });
      assert.equal(res.status, 200);
    } finally {
      restoreProject(snap);
    }
  });
});

// ----------------------------------------------------------------------------
// proposals/:pid/approve
// ----------------------------------------------------------------------------

test("proposals/approve: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/proposals/anything/approve`,
      { method: "POST", headers: authHeaders(token) },
    );
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "forbidden");
  });
});

test("proposals/approve: owning client passes ownership gate", async () => {
  await withServer(async (baseUrl) => {
    const snap = snapshotProject("proj-1");
    const proposalsBackup = JSON.parse(JSON.stringify(PROJECT_PROPOSALS["proj-1"] ?? []));
    try {
      // Reset proposals to pending so the owner can actually approve one.
      for (const p of PROJECT_PROPOSALS["proj-1"] ?? []) {
        p.status = "pending";
        p.decidedAt = undefined;
        p.decidedBy = undefined;
      }
      setPhase("proj-1", "pre_design");
      const target = (PROJECT_PROPOSALS["proj-1"] ?? [])[0];
      assert.ok(target, "proj-1 should have at least one proposal in seed data");
      const token = await login(baseUrl, "client@konti.com");
      const res = await fetch(
        `${baseUrl}/api/projects/proj-1/proposals/${target.id}/approve`,
        { method: "POST", headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
    } finally {
      PROJECT_PROPOSALS["proj-1"] = proposalsBackup;
      restoreProject(snap);
    }
  });
});

// ----------------------------------------------------------------------------
// authorize-permits
// ----------------------------------------------------------------------------

test("authorize-permits: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/authorize-permits`, {
      method: "POST",
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "forbidden");
  });
});

test("authorize-permits: owning client passes ownership gate (200)", async () => {
  await withServer(async (baseUrl) => {
    const snap = snapshotProject("proj-1");
    const authBackup = PROJECT_PERMIT_AUTHORIZATIONS["proj-1"]
      ? { ...PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] }
      : undefined;
    try {
      setPhase("proj-1", "permits");
      PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] = { status: "none", summaryAccepted: false };
      const token = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/authorize-permits`, {
        method: "POST",
        headers: authHeaders(token),
      });
      assert.equal(res.status, 200);
    } finally {
      if (authBackup) PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] = authBackup;
      else delete PROJECT_PERMIT_AUTHORIZATIONS["proj-1"];
      restoreProject(snap);
    }
  });
});

// ----------------------------------------------------------------------------
// sign/:signatureId
// ----------------------------------------------------------------------------

test("sign: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/sign/anything`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ signatureName: "Other Person" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "forbidden");
  });
});

test("sign: owning client passes ownership gate (200 on real signature)", async () => {
  await withServer(async (baseUrl) => {
    const snap = snapshotProject("proj-1");
    const authBackup = PROJECT_PERMIT_AUTHORIZATIONS["proj-1"]
      ? { ...PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] }
      : undefined;
    const sigsBackup = JSON.parse(JSON.stringify(PROJECT_REQUIRED_SIGNATURES["proj-1"] ?? []));
    try {
      setPhase("proj-1", "permits");
      PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] = {
        status: "authorized",
        summaryAccepted: true,
        authorizedBy: "Test",
        authorizedAt: new Date().toISOString(),
      };
      // Reset signatures so we have one available to sign
      for (const s of PROJECT_REQUIRED_SIGNATURES["proj-1"] ?? []) {
        s.signedAt = undefined;
        s.signedBy = undefined;
      }
      const sig = (PROJECT_REQUIRED_SIGNATURES["proj-1"] ?? [])[0];
      assert.ok(sig, "proj-1 should have at least one required signature");
      const token = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/sign/${sig.id}`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ signatureName: "Owner Client" }),
      });
      assert.equal(res.status, 200);
    } finally {
      if (authBackup) PROJECT_PERMIT_AUTHORIZATIONS["proj-1"] = authBackup;
      else delete PROJECT_PERMIT_AUTHORIZATIONS["proj-1"];
      PROJECT_REQUIRED_SIGNATURES["proj-1"] = sigsBackup;
      restoreProject(snap);
    }
  });
});

// ----------------------------------------------------------------------------
// PATCH /projects/:id/documents/:documentId — team-only visibility toggle
// ----------------------------------------------------------------------------

test("documents PATCH: client (any) → 403 (team-only route)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const docId = (DOCUMENTS["proj-1"] ?? [])[0]?.id;
    assert.ok(docId, "proj-1 should seed at least one document");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(token, true),
      body: JSON.stringify({ isClientVisible: false }),
    });
    assert.equal(res.status, 403);
  });
});

test("documents PATCH: team → 200 and toggles visibility", async () => {
  await withServer(async (baseUrl) => {
    const docId = (DOCUMENTS["proj-1"] ?? [])[0]?.id;
    assert.ok(docId);
    const token = await login(baseUrl, "demo@konti.com");
    const original = (DOCUMENTS["proj-1"] ?? [])[0]!.isClientVisible;
    try {
      const res = await fetch(`${baseUrl}/api/projects/proj-1/documents/${docId}`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({ isClientVisible: !original }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { isClientVisible: boolean };
      assert.equal(body.isClientVisible, !original);
    } finally {
      (DOCUMENTS["proj-1"] ?? [])[0]!.isClientVisible = original;
    }
  });
});

// ----------------------------------------------------------------------------
// POST /projects/:id/documents — client uploads forced to client_review
// ----------------------------------------------------------------------------

test("documents POST: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ name: "spy.pdf", category: "internal" }),
    });
    assert.equal(res.status, 403);
  });
});

test("documents POST: owning client → 201, category forced to client_review and visibility forced true", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const before = (DOCUMENTS["proj-1"] ?? []).length;
    try {
      const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
        method: "POST",
        headers: authHeaders(token, true),
        // Try to spoof category=internal & isClientVisible=false; server must override.
        body: JSON.stringify({ name: "client-upload.pdf", category: "internal", isClientVisible: false }),
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as { category: string; isClientVisible: boolean };
      assert.equal(body.category, "client_review");
      assert.equal(body.isClientVisible, true);
    } finally {
      // Trim off any docs added by this test so other tests stay deterministic.
      const list = DOCUMENTS["proj-1"] ?? [];
      while (list.length > before) list.pop();
    }
  });
});

// ----------------------------------------------------------------------------
// GET /projects/:id/invoices
// ----------------------------------------------------------------------------

test("invoices GET: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/invoices`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("invoices GET: owning client → 200 with invoices array", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/invoices`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { projectId: string; invoices: unknown[] };
    assert.equal(body.projectId, "proj-1");
    assert.ok(Array.isArray(body.invoices));
  });
});

// ----------------------------------------------------------------------------
// PATCH /me — caller updates their own profile only
// ----------------------------------------------------------------------------

test("PATCH /me: client updates phone/postal/physical → 200 and persists", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const u = USERS.find((x) => x.email === "client@konti.com")!;
    const snapshot = { phone: u.phone, postalAddress: u.postalAddress, physicalAddress: u.physicalAddress };
    try {
      const res = await fetch(`${baseUrl}/api/me`, {
        method: "PATCH",
        headers: authHeaders(token, true),
        body: JSON.stringify({ phone: "+1-787-555-9999", postalAddress: "PO Box 9999", physicalAddress: "9999 Test Ave" }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { phone?: string; postalAddress?: string; physicalAddress?: string };
      assert.equal(body.phone, "+1-787-555-9999");
      assert.equal(body.postalAddress, "PO Box 9999");
      assert.equal(body.physicalAddress, "9999 Test Ave");
    } finally {
      Object.assign(u, snapshot);
    }
  });
});

// ----------------------------------------------------------------------------
// GET /projects/:id/audit-log
// ----------------------------------------------------------------------------

test("audit-log: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/audit-log`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("audit-log: team → 200 with entries array (capped at 100)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/audit-log`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { entries: unknown[] };
    assert.ok(Array.isArray(body.entries));
    assert.ok(body.entries.length <= 100);
  });
});

test("audit-log: owning client → 200 (clientOnly=true filters)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/audit-log?clientOnly=true`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { entries: Array<{ type: string }> };
    assert.ok(Array.isArray(body.entries));
    const allowed = new Set([
      "client_view", "document_download", "client_upload", "profile_update",
      "document_visibility_change", "proposal_decision", "change_order_decision",
    ]);
    for (const e of body.entries) assert.ok(allowed.has(e.type), `type ${e.type} should be in client-only filter`);
  });
});

// ----------------------------------------------------------------------------
// GET /projects/:projectId/documents — server-side filter for clients
// ----------------------------------------------------------------------------

test("documents GET: non-owner client → 403 (no IDOR)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("documents GET: owning client → 200 with only client-visible docs", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const docs = (await res.json()) as Array<{ isClientVisible: boolean }>;
    assert.ok(Array.isArray(docs));
    for (const d of docs) assert.equal(d.isClientVisible, true, "internal docs must not leak to clients");
    // Sanity: team sees at least as many docs as the client.
    const teamToken = await login(baseUrl, "demo@konti.com");
    const tres = await fetch(`${baseUrl}/api/projects/proj-1/documents`, {
      headers: authHeaders(teamToken),
    });
    const teamDocs = (await tres.json()) as unknown[];
    assert.ok(teamDocs.length >= docs.length);
  });
});

// ----------------------------------------------------------------------------
// GET /projects/:id/contractor-estimate + report-template (estimating.ts)
// ----------------------------------------------------------------------------

test("contractor-estimate GET: non-owner client → 403 (no IDOR)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/contractor-estimate`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("report-template GET: non-owner client → 403 (no IDOR)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/report-template`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

// ----------------------------------------------------------------------------
// GET /projects/:id/contractor-monitoring (T5 coverage gap)
// ----------------------------------------------------------------------------

test("contractor-monitoring GET: non-owner client → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/contractor-monitoring`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("contractor-monitoring GET: owning client → 200 with rows array", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const res = await fetch(`${baseUrl}/api/projects/proj-1/contractor-monitoring`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { projectId: string; rows: Array<{ status: string }> };
    assert.equal(body.projectId, "proj-1");
    assert.ok(Array.isArray(body.rows));
    assert.ok(body.rows.length >= 1);
  });
});
