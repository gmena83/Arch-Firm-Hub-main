import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import { PROJECTS } from "../../data/seed";

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

function snapshotProjectIds(): Set<string> {
  return new Set(PROJECTS.map((p) => p.id));
}

function restoreProjects(originalIds: Set<string>) {
  // Remove any projects added during the test so global seed state isn't polluted
  // for sibling tests in the same node:test process.
  for (let i = PROJECTS.length - 1; i >= 0; i--) {
    const p = PROJECTS[i];
    if (p && !originalIds.has(p.id)) PROJECTS.splice(i, 1);
  }
}

test("admin can create a project and it shows up in the list", async () => {
  const original = snapshotProjectIds();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Test Project Alpha",
          clientName: "Test Client",
          location: "Ponce, Puerto Rico",
          budgetAllocated: 150000,
          description: "End-to-end create test",
          clientUserId: "user-client-2",
        }),
      });
      assert.equal(res.status, 201, "create should return 201");
      const created = (await res.json()) as { id: string; name: string; phase: string; clientUserId?: string };
      assert.match(created.id, /^proj-/);
      assert.equal(created.name, "Test Project Alpha");
      assert.equal(created.phase, "discovery");
      assert.equal(created.clientUserId, "user-client-2");

      const listRes = await fetch(`${baseUrl}/api/projects`);
      assert.equal(listRes.status, 200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      assert.ok(list.some((p) => p.id === created.id), "created project must appear in list");

      const detailRes = await fetch(`${baseUrl}/api/projects/${created.id}`);
      assert.equal(detailRes.status, 200, "detail endpoint should return new project");
    });
  } finally {
    restoreProjects(original);
  }
});

test("client cannot create a project (403)", async () => {
  const original = snapshotProjectIds();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: "Sneaky", clientName: "x", location: "y", budgetAllocated: 1,
        }),
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "forbidden");
    });
  } finally {
    restoreProjects(original);
  }
});

test("unauthenticated POST /projects returns 401", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", clientName: "y", location: "z", budgetAllocated: 1 }),
    });
    assert.equal(res.status, 401);
  });
});

test("validation errors return 400 with field map", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "", clientName: "", location: "", budgetAllocated: -5 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string; fields?: Record<string, string> };
    assert.equal(body.error, "invalid_payload");
    assert.ok(body.fields?.["name"]);
    assert.ok(body.fields?.["clientName"]);
    assert.ok(body.fields?.["location"]);
    assert.ok(body.fields?.["budgetAllocated"]);
  });
});
