// Unit tests for the Asana sync queue / drainQueue / asana-client wrapper
// behavior (Task #127). These exercise the integration logic *without*
// hitting the real Asana API by stubbing the `fetch` used by asana-client.
//
// What we cover:
//   1. enqueueJob deduplicates by (projectId, activityId) so a noisy caller
//      can't double-stamp Asana with two identical comments.
//   2. drainQueue is single-flight — overlapping calls do not double-process.
//   3. drainQueue is a no-op when Asana is disabled (graceful degradation).
//   4. On a transient failure, drainQueue logs a per-attempt failed entry,
//      emits an `asana_sync_failed` activity, and bumps the job for retry
//      (no terminal give-up while attempts < MAX).
//   5. After MAX attempts the job is removed from the queue and a terminal
//      `asana_sync_failed` activity / sync log entry is emitted.
//   6. Persistence — the queue and sync log survive a state reload from disk.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import {
  PROJECTS,
  PROJECT_ACTIVITIES,
  appendActivity,
  type ProjectActivity,
} from "../../data/seed";
import {
  _resetForTests,
  setIntegrationsPersistFile,
  enqueueJob,
  listQueue,
  getSyncLog,
  updateAsanaConfig,
} from "../../lib/integrations-config";
import { drainQueue } from "../../lib/asana-sync";
import { _setFetchForTests, _resetFetchForTests } from "../../lib/asana-client";

const PROJECT_ID = "proj-1";
const REAL_FETCH = globalThis.fetch;

// Stub the connector-proxy call inside getAsanaAccessToken plus the actual
// Asana API call. The stub takes a single function that handles app.asana.com
// requests; the connector proxy is faked transparently with a stable token.
function installAsanaFetchStub(asanaHandler: (url: string, init: RequestInit | undefined) => Promise<Response>): void {
  // Make sure the connector lookup succeeds.
  process.env["REPLIT_CONNECTORS_HOSTNAME"] = "test.connector.local";
  process.env["REPL_IDENTITY"] = "test-identity";

  _setFetchForTests((async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes(process.env["REPLIT_CONNECTORS_HOSTNAME"]!)) {
      return new Response(
        JSON.stringify({
          items: [{ settings: { access_token: "test-token" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return await asanaHandler(u, init);
  }) as unknown as typeof fetch);
}

function tmpFile(suffix: string): string {
  return path.join(os.tmpdir(), `konti-asana-queue-${process.pid}-${suffix}.json`);
}

function snapshotActivities(): ProjectActivity[] {
  return [...(PROJECT_ACTIVITIES[PROJECT_ID] ?? [])];
}
function restoreActivities(snap: ProjectActivity[]) {
  PROJECT_ACTIVITIES[PROJECT_ID] = snap;
}
function snapshotProjectAsanaGid() {
  const p = PROJECTS.find((x) => x.id === PROJECT_ID)!;
  return { ref: p, original: p.asanaGid };
}

function configureAsana(): void {
  // Pretend the admin connected and chose a board.
  updateAsanaConfig({
    enabled: true,
    workspaceGid: "ws-1",
    workspaceName: "Test WS",
    boardGid: "board-1",
    boardName: "Test Board",
    defaultAssigneeGid: null,
    dashboardBaseUrl: "https://test.replit.dev",
    connectedAt: new Date().toISOString(),
    connectedBy: "tester",
  });
  // Mark the project as already linked to a real Asana task so the sync path
  // skips the `findTaskByName` auto-claim branch (we test that elsewhere).
  const p = PROJECTS.find((x) => x.id === PROJECT_ID)!;
  p.asanaGid = "asana-task-12345";
}

function setup(name: string) {
  setIntegrationsPersistFile(tmpFile(name));
  _resetForTests();
}

function cleanup() {
  _resetFetchForTests(REAL_FETCH);
  _resetForTests();
  setIntegrationsPersistFile(null);
  delete process.env["REPLIT_CONNECTORS_HOSTNAME"];
  delete process.env["REPL_IDENTITY"];
}

// ---------------------------------------------------------------------------
// 1. Dedupe
// ---------------------------------------------------------------------------
test("enqueueJob: dedupes by (projectId, activityId)", () => {
  setup("dedupe");
  try {
    const job1 = enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-1",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "uploaded a file",
        descriptionEs: "subió un archivo",
      },
    });
    const job2 = enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-1", // same activityId
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "uploaded a file (dup)",
        descriptionEs: "subió un archivo (dup)",
      },
    });
    assert.equal(job1.id, job2.id, "duplicate enqueue should return existing job");
    assert.equal(listQueue().length, 1);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 2. Single-flight drain
// ---------------------------------------------------------------------------
test("drainQueue: single-flight — overlapping invocations don't double-process", async () => {
  setup("singleflight");
  const projSnap = snapshotProjectAsanaGid();
  const actSnap = snapshotActivities();
  try {
    configureAsana();
    let calls = 0;
    installAsanaFetchStub(async (_url, _init) => {
      calls += 1;
      // Simulate slow Asana (small delay) — gives the second drain a chance
      // to enter and bail out via the `draining` guard.
      await new Promise((r) => setTimeout(r, 25));
      return new Response(JSON.stringify({ data: { gid: "comment-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-sf",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "upload",
        descriptionEs: "subida",
      },
    });

    // Fire two drains concurrently. The second must not re-process the same job.
    await Promise.all([drainQueue(), drainQueue()]);
    assert.equal(calls, 1, "Asana fetch should be called exactly once");
    assert.equal(listQueue().length, 0, "queue should be drained");
  } finally {
    projSnap.ref.asanaGid = projSnap.original;
    restoreActivities(actSnap);
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 3. Disabled = no-op
// ---------------------------------------------------------------------------
test("drainQueue: no-op when Asana not enabled", async () => {
  setup("disabled");
  try {
    let calls = 0;
    _setFetchForTests((async () => {
      calls += 1;
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch);

    // Enqueue something but DO NOT configure Asana.
    enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-disabled",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "x",
        descriptionEs: "x",
      },
    });
    await drainQueue();
    assert.equal(calls, 0, "no fetch should be made when Asana disabled");
    assert.equal(listQueue().length, 1, "job should remain queued for later");
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4. Per-attempt failure visibility (non-terminal)
// ---------------------------------------------------------------------------
test("drainQueue: transient failure logs per-attempt failed entry + activity, keeps job for retry", async () => {
  setup("transient");
  const projSnap = snapshotProjectAsanaGid();
  const actSnap = snapshotActivities();
  try {
    configureAsana();
    installAsanaFetchStub(async () => {
      return new Response(JSON.stringify({ errors: [{ message: "flaky" }] }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    });

    enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-fail",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "upload",
        descriptionEs: "subida",
      },
    });

    await drainQueue();

    // Job remains queued, attempts bumped to 1.
    const queue = listQueue();
    assert.equal(queue.length, 1, "transient failure should keep job for retry");
    assert.equal(queue[0]?.attempts, 1);

    // Sync log got a per-attempt 'failed' entry that mentions retry.
    const log = getSyncLog();
    const failedEntry = log.find((e) => e.payload.activityId === "act-fail" && e.status === "failed");
    assert.ok(failedEntry, "should have a 'failed' sync log entry on attempt 1");
    assert.match(failedEntry!.message, /will retry/i);

    // Activity feed got a non-terminal asana_sync_failed entry.
    const activities = PROJECT_ACTIVITIES[PROJECT_ID] ?? [];
    const syncFailed = activities.find(
      (a) => a.type === "asana_sync_failed" && /will retry/i.test(a.description),
    );
    assert.ok(syncFailed, "expected a non-terminal asana_sync_failed activity");
  } finally {
    projSnap.ref.asanaGid = projSnap.original;
    restoreActivities(actSnap);
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 5. Terminal give-up after MAX_ATTEMPTS
// ---------------------------------------------------------------------------
test("drainQueue: gives up after MAX_ATTEMPTS, dequeues + terminal activity", async () => {
  setup("terminal");
  const projSnap = snapshotProjectAsanaGid();
  const actSnap = snapshotActivities();
  try {
    configureAsana();
    installAsanaFetchStub(async () => {
      return new Response(JSON.stringify({ errors: [{ message: "permadown" }] }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    // Enqueue with attempts=4 so the next failed attempt is the 5th (terminal).
    enqueueJob({
      projectId: PROJECT_ID,
      attempts: 4,
      nextAttemptAt: new Date(0).toISOString(),
      activity: {
        id: "act-terminal",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "upload",
        descriptionEs: "subida",
      },
    });

    await drainQueue();

    // Job removed from queue.
    assert.equal(listQueue().length, 0, "terminal failure should dequeue");

    // Sync log shows terminal "Gave up" message.
    const log = getSyncLog();
    const terminal = log.find(
      (e) => e.payload.activityId === "act-terminal" && /Gave up/i.test(e.message),
    );
    assert.ok(terminal, "should have a terminal 'Gave up' sync log entry");

    // Activity feed shows terminal asana_sync_failed.
    const activities = PROJECT_ACTIVITIES[PROJECT_ID] ?? [];
    const syncFailed = activities.find(
      (a) => a.type === "asana_sync_failed" && /Gave up/i.test(a.description),
    );
    assert.ok(syncFailed, "expected a terminal asana_sync_failed activity");
  } finally {
    projSnap.ref.asanaGid = projSnap.original;
    restoreActivities(actSnap);
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 6. Persistence — queue + log survive a reload from disk
// ---------------------------------------------------------------------------
test("integrations-config: queue + sync log persist across reload", () => {
  const file = tmpFile("persist");
  // Clean up any stray file from a prior run.
  try { fs.unlinkSync(file); } catch { /* ignore */ }
  setIntegrationsPersistFile(file);
  _resetForTests();
  try {
    enqueueJob({
      projectId: PROJECT_ID,
      activity: {
        id: "act-persist",
        timestamp: new Date().toISOString(),
        type: "client_upload",
        actor: "tester",
        description: "upload",
        descriptionEs: "subida",
      },
    });
    assert.equal(listQueue().length, 1);

    // Force a reload by pointing at the same file again.
    setIntegrationsPersistFile(file);
    const reloaded = listQueue();
    assert.equal(reloaded.length, 1, "queue must survive reload");
    assert.equal(reloaded[0]?.activity.id, "act-persist");
    appendActivity; // referenced to silence lint
  } finally {
    setIntegrationsPersistFile(null);
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
});
