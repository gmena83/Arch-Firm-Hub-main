import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { PROJECTS, PROJECT_PUNCHLIST, punchlistKey } from "../../data/seed";

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

function snapshotProject(id: string) {
  const p = PROJECTS.find((x) => x.id === id)!;
  return { ref: p, snapshot: { ...(p as Record<string, unknown>) } };
}
function restoreProject(s: ReturnType<typeof snapshotProject>) {
  Object.assign(s.ref, s.snapshot);
}

function snapshotPunchlist(projectId: string, phase: string) {
  const key = punchlistKey(projectId, phase);
  const list = PROJECT_PUNCHLIST[key] ?? [];
  return { key, snapshot: list.map((i) => ({ ...i })) };
}
function restorePunchlist(s: ReturnType<typeof snapshotPunchlist>) {
  PROJECT_PUNCHLIST[s.key] = s.snapshot.map((i) => ({ ...i }));
}

// ---------------------------------------------------------------------------
// Gate behavior
// ---------------------------------------------------------------------------

test("advance-phase: blocked by open punchlist items in current phase", async () => {
  await withServer(async (baseUrl) => {
    const proj = snapshotProject("proj-2");
    const pl = snapshotPunchlist("proj-2", "construction");
    try {
      const token = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-2/advance-phase`, {
        method: "POST",
        headers: authHeaders(token),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as {
        error?: string;
        openCount?: number;
        messageEs?: string;
        openItems?: Array<{ id: string }>;
      };
      assert.equal(body.error, "punchlist_open");
      assert.ok((body.openCount ?? 0) > 0, "openCount > 0");
      assert.ok(body.messageEs && body.messageEs.length > 0, "bilingual message present");
      assert.ok(Array.isArray(body.openItems) && body.openItems.length > 0);
    } finally {
      restorePunchlist(pl);
      restoreProject(proj);
    }
  });
});

test("advance-phase: succeeds after all items done or waived", async () => {
  await withServer(async (baseUrl) => {
    const proj = snapshotProject("proj-2");
    const pl = snapshotPunchlist("proj-2", "construction");
    try {
      const token = await login(baseUrl, "demo@konti.com");
      const list = PROJECT_PUNCHLIST[punchlistKey("proj-2", "construction")] ?? [];
      // Mark first open as done, all subsequent open ones as waived
      let donePicked = false;
      for (const item of list) {
        if (item.status === "done" || item.status === "waived") continue;
        if (!donePicked) {
          const r = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${item.id}/status`, {
            method: "POST",
            headers: authHeaders(token, true),
            body: JSON.stringify({ status: "done" }),
          });
          assert.equal(r.status, 200, `done failed for ${item.id}`);
          donePicked = true;
        } else {
          const r = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${item.id}/status`, {
            method: "POST",
            headers: authHeaders(token, true),
            body: JSON.stringify({ status: "waived", waiverReason: "Deferred to closeout punch" }),
          });
          assert.equal(r.status, 200, `waive failed for ${item.id}`);
        }
      }
      const adv = await fetch(`${baseUrl}/api/projects/proj-2/advance-phase`, {
        method: "POST",
        headers: authHeaders(token),
      });
      assert.equal(adv.status, 200, "advance should now succeed");
      const body = (await adv.json()) as { advancedTo?: string };
      assert.equal(body.advancedTo, "completed");
    } finally {
      restorePunchlist(pl);
      restoreProject(proj);
    }
  });
});

// ---------------------------------------------------------------------------
// Endpoint validation
// ---------------------------------------------------------------------------

test("punchlist status: waiving without justification → 400", async () => {
  await withServer(async (baseUrl) => {
    const pl = snapshotPunchlist("proj-2", "construction");
    try {
      const token = await login(baseUrl, "demo@konti.com");
      const list = PROJECT_PUNCHLIST[punchlistKey("proj-2", "construction")] ?? [];
      const target = list.find((i) => i.status !== "done" && i.status !== "waived")!;
      const res = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${target.id}/status`, {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ status: "waived" }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "waiver_reason_required");
    } finally {
      restorePunchlist(pl);
    }
  });
});

test("punchlist GET: client read access for owned project, forbidden for non-owner", async () => {
  await withServer(async (baseUrl) => {
    const ownerToken = await login(baseUrl, "client@konti.com");
    const nonOwnerToken = await login(baseUrl, "client2@konti.com");
    const ok = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, { headers: authHeaders(ownerToken) });
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as { items?: unknown[]; openCount?: number };
    assert.ok(Array.isArray(okBody.items));
    assert.ok(typeof okBody.openCount === "number");
    const nope = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, { headers: authHeaders(nonOwnerToken) });
    assert.equal(nope.status, 403);
  });
});

test("punchlist write: client (owner) cannot mutate", async () => {
  await withServer(async (baseUrl) => {
    const pl = snapshotPunchlist("proj-2", "construction");
    try {
      const clientToken = await login(baseUrl, "client@konti.com");
      const list = PROJECT_PUNCHLIST[punchlistKey("proj-2", "construction")] ?? [];
      const target = list.find((i) => i.status === "open")!;
      const res = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${target.id}/status`, {
        method: "POST",
        headers: authHeaders(clientToken, true),
        body: JSON.stringify({ status: "done" }),
      });
      assert.equal(res.status, 403);
    } finally {
      restorePunchlist(pl);
    }
  });
});
