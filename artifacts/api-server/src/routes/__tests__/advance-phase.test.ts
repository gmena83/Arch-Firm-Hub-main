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

async function advance(baseUrl: string, token: string, projectId: string) {
  return fetch(`${baseUrl}/api/projects/${projectId}/advance-phase`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

test("seed data: every project has a clientUserId", () => {
  for (const p of PROJECTS) {
    assert.ok(
      (p as { clientUserId?: string }).clientUserId,
      `project ${p.id} must have clientUserId set`,
    );
  }
});

test("non-owner client receives 403 from advance-phase (forbidden case)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client2@konti.com");
    for (const projectId of ["proj-1", "proj-2", "proj-3"]) {
      const res = await advance(baseUrl, token, projectId);
      assert.equal(res.status, 403, `client2 should be forbidden on ${projectId}`);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "forbidden");
    }
  });
});

test("owning client can advance their own consultation project (allowed case)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    const proj1 = PROJECTS.find((p) => p.id === "proj-1")!;
    const snapshot = { ...(proj1 as Record<string, unknown>) };
    try {
      const res = await advance(baseUrl, token, "proj-1");
      assert.equal(res.status, 200, "owning client should be allowed to advance proj-1");
      const body = (await res.json()) as { project: { phase: string } };
      assert.equal(body.project.phase, "pre_design");
    } finally {
      Object.assign(proj1, snapshot);
    }
  });
});

test("owning client cannot skip ahead past consultation (client_gate_invalid)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "client@konti.com");
    // proj-2 is in "construction" — owned by user-client-1 but past consultation.
    const res = await advance(baseUrl, token, "proj-2");
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "client_gate_invalid");
  });
});

test("unauthenticated request to advance-phase returns 401", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/advance-phase`, { method: "POST" });
    assert.equal(res.status, 401);
  });
});
