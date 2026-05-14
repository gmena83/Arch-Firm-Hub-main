// Punchlist persistence tests — verify edits survive a simulated server
// restart by:
//   1. mutating state through the HTTP API,
//   2. snapshotting the on-disk file,
//   3. wiping in-memory state, and
//   4. rehydrating from disk via the same loader the server uses on boot.
//
// We point PUNCHLIST_PERSIST_PATH at a tmp file before importing app.ts so
// the seed module hydrates from a clean slate.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use a per-test-file persistence path so the rest of the suite (which sets
// PUNCHLIST_PERSIST_PATH= to disable persistence) isn't affected and so we
// don't read or write the dev/prod data file.
const TMP_DIR = mkdtempSync(join(tmpdir(), "konti-punchlist-"));
const PERSIST_PATH = join(TMP_DIR, "punchlist.json");
process.env["PUNCHLIST_PERSIST_PATH"] = PERSIST_PATH;

// IMPORTANT: import app + seed *after* setting the env var so the first-time
// hydration uses our tmp path.
const { default: app } = await import("../../app");
const { PROJECT_PUNCHLIST, punchlistKey } = await import("../../data/seed");
const { loadPersistedPunchlist } = await import("../../data/punchlist-store");
type PunchlistItem = (typeof PROJECT_PUNCHLIST)[string][number];

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

/**
 * Snapshot in-memory state, then wipe and rehydrate from disk — the same
 * code path seed.ts runs on a fresh boot.  Returns a restore() function so
 * the test cleans up after itself.
 */
function simulateRestart(): () => void {
  const before: Record<string, PunchlistItem[]> = {};
  for (const [k, v] of Object.entries(PROJECT_PUNCHLIST)) before[k] = v;
  for (const k of Object.keys(PROJECT_PUNCHLIST)) delete PROJECT_PUNCHLIST[k];
  const persisted = loadPersistedPunchlist();
  if (persisted) {
    for (const [k, v] of Object.entries(persisted)) PROJECT_PUNCHLIST[k] = v;
  }
  return () => {
    for (const k of Object.keys(PROJECT_PUNCHLIST)) delete PROJECT_PUNCHLIST[k];
    for (const [k, v] of Object.entries(before)) {
      PROJECT_PUNCHLIST[k] = v;
    }
  };
}

test("seeds for proj-2 and proj-3 still load on first boot (no persistence file)", () => {
  // Initial in-memory state (after import) must have the seed data because
  // no file existed when seed.ts hydrated.
  assert.ok(
    (PROJECT_PUNCHLIST[punchlistKey("proj-2", "construction")] ?? []).length >= 6,
    "proj-2 construction seed present on boot",
  );
  assert.ok(
    (PROJECT_PUNCHLIST[punchlistKey("proj-3", "completed")] ?? []).length >= 3,
    "proj-3 completed seed present on boot",
  );
});

test("punchlist add/edit/status/delete writes to disk", async () => {
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");

    // Add
    const add = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({
        label: "Persist add test",
        labelEs: "Prueba de persistencia (add)",
        owner: "Test Runner",
        phase: "construction",
      }),
    });
    assert.equal(add.status, 201);
    const addBody = (await add.json()) as { item: { id: string } };
    const addedId = addBody.item.id;

    assert.ok(existsSync(PERSIST_PATH), "file should exist after add");
    let onDisk = JSON.parse(readFileSync(PERSIST_PATH, "utf8")) as {
      data: Record<string, Array<{ id: string; label: string; status: string }>>;
    };
    assert.ok(
      onDisk.data["proj-2:construction"]?.some((i) => i.id === addedId),
      "add persisted to disk",
    );

    // Edit
    const edit = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${addedId}`, {
      method: "PATCH",
      headers: authHeaders(token, true),
      body: JSON.stringify({ owner: "Updated Owner" }),
    });
    assert.equal(edit.status, 200);
    onDisk = JSON.parse(readFileSync(PERSIST_PATH, "utf8"));
    const editedItem = onDisk.data["proj-2:construction"]!.find((i) => i.id === addedId);
    assert.equal((editedItem as { owner?: string }).owner, "Updated Owner");

    // Status change
    const status = await fetch(
      `${baseUrl}/api/projects/proj-2/punchlist/${addedId}/status`,
      {
        method: "POST",
        headers: authHeaders(token, true),
        body: JSON.stringify({ status: "done" }),
      },
    );
    assert.equal(status.status, 200);
    onDisk = JSON.parse(readFileSync(PERSIST_PATH, "utf8"));
    assert.equal(
      onDisk.data["proj-2:construction"]!.find((i) => i.id === addedId)!.status,
      "done",
    );

    // Delete
    const del = await fetch(`${baseUrl}/api/projects/proj-2/punchlist/${addedId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    assert.equal(del.status, 200);
    onDisk = JSON.parse(readFileSync(PERSIST_PATH, "utf8"));
    assert.equal(
      onDisk.data["proj-2:construction"]?.find((i) => i.id === addedId),
      undefined,
      "delete persisted to disk",
    );
  });
});

test("punchlist edits survive a simulated server restart", async () => {
  let createdId = "";
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");
    const create = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({
        label: "Survive restart",
        labelEs: "Sobrevive reinicio",
        owner: "Test",
        phase: "construction",
      }),
    });
    assert.equal(create.status, 201);
    createdId = ((await create.json()) as { item: { id: string } }).item.id;
  });

  // Simulate process restart: wipe in-memory and rehydrate from disk.
  const restore = simulateRestart();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const list = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, {
        headers: authHeaders(token),
      });
      assert.equal(list.status, 200);
      const body = (await list.json()) as {
        items: Array<{ id: string; label: string }>;
      };
      const found = body.items.find((i) => i.id === createdId);
      assert.ok(found, "added item visible after restart");
      assert.equal(found!.label, "Survive restart");
    });
  } finally {
    restore();
  }
});

test("advance-phase gate uses the persisted punchlist after restart", async () => {
  // Seed proj-3 ("completed") starts with all items done/waived, so the gate
  // would trivially pass.  Use proj-2 + a fresh phase key so the gate sees
  // exactly the punchlist we persist below.
  await withServer(async (baseUrl) => {
    const token = await login(baseUrl, "demo@konti.com");

    // Add an open item to proj-2 construction (open seed items already block
    // advance, but we want to verify the *persisted* one blocks too).
    const add = await fetch(`${baseUrl}/api/projects/proj-2/punchlist`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({
        label: "Restart gate item",
        labelEs: "Ítem del gate post-reinicio",
        owner: "Test",
        phase: "construction",
      }),
    });
    assert.equal(add.status, 201);
  });

  const restore = simulateRestart();
  try {
    await withServer(async (baseUrl) => {
      const token = await login(baseUrl, "demo@konti.com");
      const adv = await fetch(`${baseUrl}/api/projects/proj-2/advance-phase`, {
        method: "POST",
        headers: authHeaders(token),
      });
      assert.equal(adv.status, 400);
      const body = (await adv.json()) as {
        error?: string;
        openItems?: Array<{ label: string }>;
      };
      assert.equal(body.error, "punchlist_open");
      assert.ok(
        body.openItems?.some((i) => i.label === "Restart gate item"),
        "restart-persisted item participates in the advance gate",
      );
    });
  } finally {
    restore();
  }
});

test.after(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});
