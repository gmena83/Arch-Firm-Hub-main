// Route-level tests for the Task #130 superadmin Integrations endpoints.
//
// Covers:
//   1. Role gating: client/admin/anon are blocked; superadmin succeeds.
//   2. Secret rotation runtime effect: GET /admin/secrets reflects override
//      after POST, switches source from "env" -> "override" -> "env" on clear.
//   3. The submitted value is never echoed back in any response.
//   4. Test endpoint for non-testable keys returns ok=false with the
//      "Test not yet wired" message (200, not 4xx — so the row renders it).
//   5. Restart endpoint returns a structured ok flag for both drive + asana
//      and never throws even when no connector is authorized.
//   6. Audit log captures actions and never leaks a raw key.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Force a per-process override file + audit file so tests don't pollute the
// real .data/ directory and don't leak into other test files.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "konti-admin-secrets-"));
process.env["SECRETS_OVERRIDE_FILE"] = path.join(
  TMP_DIR,
  "secrets-overrides.json",
);
process.env["AUDIT_LOG_FILE"] = path.join(TMP_DIR, "audit-log.json");
process.env["JWT_SECRET"] =
  process.env["JWT_SECRET"] ?? "test-secret-for-tests-only-32-chars-min";

const app = (await import("../../app")).default;

type LoginResponse = { token: string; user: { id: string; role: string } };

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login failed for ${email}`);
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

const SUPERADMIN = {
  email: "tatiana@menatech.cloud",
  password: "Konti_123",
};
const ADMIN = { email: "demo@konti.com", password: "konti2026" };
const CLIENT = { email: "client@konti.com", password: "konti2026" };

function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ---------------------------------------------------------------------------
// 1. Role gating
// ---------------------------------------------------------------------------

test("admin-secrets: anonymous request → 401", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/secrets`);
    assert.equal(res.status, 401);
  });
});

test("admin-secrets: client role → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, CLIENT.email, CLIENT.password);
    const res = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("admin-secrets: admin role (non-super) → 403", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, ADMIN.email, ADMIN.password);
    const res = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});

test("admin-secrets: superadmin → 200 with full registry", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      secrets: Array<{ meta: { name: string }; source: string }>;
    };
    const names = body.secrets.map((i) => i.meta.name);
    // The six managed names: 4 AI/PDF/Gamma + Google id + Google secret.
    assert.ok(names.includes("ANTHROPIC_API_KEY"));
    assert.ok(names.includes("OPENAI_API_KEY"));
    assert.ok(names.includes("PDF_CO_API_KEY"));
    assert.ok(names.includes("GAMMA_APP_KEY"));
    assert.ok(names.includes("GOOGLE_CLIENT_ID"));
    assert.ok(names.includes("GOOGLE_CLIENT_SECRET"));
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. Rotation runtime effect & no-echo
// ---------------------------------------------------------------------------

test("admin-secrets: update + clear flips source override↔env, never echoes value", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);

    // GAMMA_APP_KEY is a safe target — testable=false so we don't hit any
    // upstream provider, and it has no realistic env default in CI.
    const NAME = "GAMMA_APP_KEY";
    const SECRET_VALUE = "rotation-test-value-not-a-real-key-abc123";

    // 2a. Update.
    const upd = await fetch(`${baseUrl}/api/admin/secrets/${NAME}`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ value: SECRET_VALUE }),
    });
    assert.equal(upd.status, 200);
    const updBody = await upd.json();
    const updText = JSON.stringify(updBody);
    assert.ok(
      !updText.includes(SECRET_VALUE),
      `update response leaked the value: ${updText}`,
    );

    // 2b. List shows source=override.
    const list1 = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    const list1Body = (await list1.json()) as {
      secrets: Array<{ meta: { name: string }; source: string }>;
    };
    const row = list1Body.secrets.find((i) => i.meta.name === NAME);
    assert.ok(row, "row not found");
    assert.equal(row.source, "override");
    assert.ok(
      !JSON.stringify(list1Body).includes(SECRET_VALUE),
      "list response leaked the value",
    );

    // 2c. Clear.
    const clr = await fetch(`${baseUrl}/api/admin/secrets/${NAME}`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ clear: true }),
    });
    assert.equal(clr.status, 200);

    // 2d. List shows source != override (env or missing depending on real env).
    const list2 = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    const list2Body = (await list2.json()) as {
      secrets: Array<{ meta: { name: string }; source: string }>;
    };
    const row2 = list2Body.secrets.find((i) => i.meta.name === NAME);
    assert.ok(row2);
    assert.notEqual(row2.source, "override");
  });
});

// ---------------------------------------------------------------------------
// 4. Test endpoint for non-testable key
// ---------------------------------------------------------------------------

test("admin-secrets: test on non-testable key returns ok=false (200)", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/secrets/GAMMA_APP_KEY/test`,
      {
        method: "POST",
        headers: authHeaders(token),
      },
    );
    // Must be 200 (not 4xx) so the inline result row renders the message.
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; message: string };
    assert.equal(body.ok, false);
    assert.match(body.message, /not yet wired/i);
  });
});

test("admin-secrets: test on unknown name → 404", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/secrets/NOT_A_REAL_KEY/test`,
      { method: "POST", headers: authHeaders(token) },
    );
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// 5. Restart endpoints (success + error states never throw)
// ---------------------------------------------------------------------------

test("admin-secrets: restart drive returns structured ok flag", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/integrations/restart/drive`,
      { method: "POST", headers: authHeaders(token) },
    );
    // Either ok=true (connector live) or ok=false with a sanitized message
    // (no connector in CI). Must always be 200 with a structured body.
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; message?: string };
    assert.equal(typeof body.ok, "boolean");
    if (!body.ok) {
      assert.equal(typeof body.message, "string");
    }
  });
});

test("admin-secrets: restart asana returns structured ok flag", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/integrations/restart/asana`,
      { method: "POST", headers: authHeaders(token) },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(typeof body.ok, "boolean");
  });
});

test("admin-secrets: restart unknown integration → 404", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/integrations/restart/bogus`,
      { method: "POST", headers: authHeaders(token) },
    );
    assert.equal(res.status, 404);
  });
});

test("admin-secrets: restart blocked for admin role", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, ADMIN.email, ADMIN.password);
    const res = await fetch(
      `${baseUrl}/api/admin/integrations/restart/drive`,
      { method: "POST", headers: authHeaders(token) },
    );
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// 6. Audit log
// ---------------------------------------------------------------------------

test("admin-secrets: audit log records the rotation we performed", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const SECRET_VALUE = "audit-test-value-do-not-leak-xyz789";

    await fetch(`${baseUrl}/api/admin/secrets/GAMMA_APP_KEY`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ value: SECRET_VALUE }),
    });

    const res = await fetch(`${baseUrl}/api/admin/audit-log`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      entries: Array<{ action: string; target?: string }>;
    };
    assert.ok(body.entries.length >= 1);
    const last = body.entries[0];
    // Audit entries are most-recent-first by convention.
    assert.equal(last.target, "GAMMA_APP_KEY");
    assert.ok(
      !JSON.stringify(body).includes(SECRET_VALUE),
      "audit log leaked the value",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Candidate-value test ("Test before Save")
// ---------------------------------------------------------------------------

test("admin-secrets: candidate-value test does NOT persist the value", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, SUPERADMIN.email, SUPERADMIN.password);
    const CANDIDATE = "candidate-do-not-persist-zzz999";

    // Tests share a per-process override file, so explicitly clear any
    // override left by an earlier test before asserting the candidate
    // probe doesn't create one.
    await fetch(`${baseUrl}/api/admin/secrets/GAMMA_APP_KEY`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ clear: true }),
    });

    // Probe with a candidate value (non-testable key still returns the
    // canned message — the important assertion is that no override is
    // written and the value is never echoed back).
    const res = await fetch(
      `${baseUrl}/api/admin/secrets/GAMMA_APP_KEY/test`,
      {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ value: CANDIDATE }),
      },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(
      !JSON.stringify(body).includes(CANDIDATE),
      "test response leaked the candidate value",
    );

    // Verify the source is still NOT override afterwards.
    const list = await fetch(`${baseUrl}/api/admin/secrets`, {
      headers: authHeaders(token),
    });
    const listBody = (await list.json()) as {
      secrets: Array<{ meta: { name: string }; source: string }>;
    };
    const row = listBody.secrets.find((i) => i.meta.name === "GAMMA_APP_KEY");
    assert.ok(row);
    assert.notEqual(
      row.source,
      "override",
      "candidate test must not have created an override",
    );

    // Audit log should record the action and never include the candidate.
    const audit = await fetch(`${baseUrl}/api/admin/audit-log`, {
      headers: authHeaders(token),
    });
    const auditBody = await audit.json();
    assert.ok(
      !JSON.stringify(auditBody).includes(CANDIDATE),
      "audit log leaked the candidate value",
    );
  });
});

test("admin-secrets: audit log blocked for non-superadmin", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, ADMIN.email, ADMIN.password);
    const res = await fetch(`${baseUrl}/api/admin/audit-log`, {
      headers: authHeaders(token),
    });
    assert.equal(res.status, 403);
  });
});
