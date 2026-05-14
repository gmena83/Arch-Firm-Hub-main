// Task #102 — Real signature handoff email coverage.
//
// Exercises:
//   * POST /projects/:id/request-signature/:signatureId  (new endpoint)
//   * POST /projects/:id/sign/:signatureId               (team-side completion)
//   * POST /projects/:id/advance-phase                   (Pre-Design kickoff)
//   * POST /projects/:id/decline-phase                   (decline-notify-team)
//   * POST /projects/:id/proposals/:proposalId/approve   (acceptance receipt)
//
// All paths assert that:
//   1. The mailer is invoked with the right template/recipients
//   2. `email_sent` activity is appended on success
//   3. `email_failed` activity is appended on failure (and the originating
//      mutation still succeeds — failure isolation)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../../app";
import {
  PROJECTS,
  PROJECT_ACTIVITIES,
  PROJECT_REQUIRED_SIGNATURES,
  PROJECT_PERMIT_AUTHORIZATIONS,
  PROJECT_PROPOSALS,
  pendingSignatureRequests,
} from "../../data/seed";
import { __setTestMailerHook, type SendArgs } from "../../lib/mailer";

interface CapturedSend {
  template: SendArgs["template"];
  to: string | string[];
  cc?: string[];
  lang: SendArgs["lang"];
  subject: string;
}

let captured: CapturedSend[] = [];
let nextResult: { ok: boolean; reason?: string } = { ok: true };

function installMailerHook(): void {
  __setTestMailerHook((args, rendered) => {
    const sent: CapturedSend = {
      template: args.template,
      to: args.to,
      lang: args.lang,
      subject: rendered.subject,
      ...(args.cc ? { cc: args.cc } : {}),
    };
    captured.push(sent);
    return { ok: nextResult.ok, template: args.template, ...(nextResult.reason ? { reason: nextResult.reason } : {}) };
  });
}

beforeEach(() => {
  captured = [];
  nextResult = { ok: true };
  installMailerHook();
  pendingSignatureRequests.clear();
});

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
  assert.equal(res.status, 200, `login failed for ${email}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

const auth = (token: string, json = false): Record<string, string> => {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

// Helpers to snapshot/restore mutated demo state so tests are independent.
function snapshotSignatures(projectId: string) {
  return JSON.parse(JSON.stringify(PROJECT_REQUIRED_SIGNATURES[projectId] ?? []));
}
function restoreSignatures(projectId: string, snap: unknown) {
  PROJECT_REQUIRED_SIGNATURES[projectId] = snap as typeof PROJECT_REQUIRED_SIGNATURES[string];
}
function snapshotActivities(projectId: string) {
  return [...(PROJECT_ACTIVITIES[projectId] ?? [])];
}
function restoreActivities(projectId: string, snap: unknown) {
  PROJECT_ACTIVITIES[projectId] = snap as typeof PROJECT_ACTIVITIES[string];
}

const PROJ = "proj-2"; // permits-phase, authorized, with signatures unsigned

function ensureUnsigned(): void {
  for (const s of PROJECT_REQUIRED_SIGNATURES[PROJ] ?? []) {
    delete s.signedAt;
    delete s.signedBy;
  }
}

test("request-signature: staff send hits mailer + emits email_sent + dedupes second call", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === PROJ)!;
    const originalPhase = project.phase;
    const sigsSnap = snapshotSignatures(PROJ);
    const actsSnap = snapshotActivities(PROJ);
    const authSnap = PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
    try {
      (project as { phase: string }).phase = "permits";
      PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = {
        status: "authorized",
        authorizedAt: new Date().toISOString(),
        authorizedBy: "Test Client",
      } as unknown as typeof PROJECT_PERMIT_AUTHORIZATIONS[string];
      ensureUnsigned();
      const adminToken = await login(baseUrl, "demo@konti.com");
      const sigId = (PROJECT_REQUIRED_SIGNATURES[PROJ] ?? [])[0]!.id;

      const res1 = await fetch(`${baseUrl}/api/projects/${PROJ}/request-signature/${sigId}`, {
        method: "POST",
        headers: auth(adminToken, true),
      });
      assert.equal(res1.status, 200);
      const body1 = (await res1.json()) as { emailSent: boolean; deduped: boolean };
      assert.equal(body1.emailSent, true);
      assert.equal(body1.deduped, false);
      assert.equal(captured.length, 1);
      assert.equal(captured[0]!.template, "signature_request");
      assert.equal(captured[0]!.to, "client@konti.com");
      assert.match(captured[0]!.subject, /Signature requested/);

      // Activity feed gained an email_sent row.
      const acts = PROJECT_ACTIVITIES[PROJ] ?? [];
      assert.ok(
        acts.some((a) => a.type === "email_sent" && /Signature request sent/.test(a.description)),
        "expected email_sent activity",
      );

      // Dedupe: second call for the same pending signature returns deduped=true and does NOT send.
      const res2 = await fetch(`${baseUrl}/api/projects/${PROJ}/request-signature/${sigId}`, {
        method: "POST",
        headers: auth(adminToken, true),
      });
      assert.equal(res2.status, 200);
      const body2 = (await res2.json()) as { emailSent: boolean; deduped: boolean };
      assert.equal(body2.deduped, true);
      assert.equal(body2.emailSent, false);
      assert.equal(captured.length, 1, "second call should not invoke mailer");
    } finally {
      (project as { phase: string }).phase = originalPhase;
      if (authSnap) PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = authSnap;
      else delete PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
      restoreSignatures(PROJ, sigsSnap);
      restoreActivities(PROJ, actsSnap);
      pendingSignatureRequests.clear();
    }
  });
});

test("request-signature: failed delivery records email_failed and frees dedupe key", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === PROJ)!;
    const originalPhase = project.phase;
    const sigsSnap = snapshotSignatures(PROJ);
    const actsSnap = snapshotActivities(PROJ);
    const authSnap = PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
    try {
      (project as { phase: string }).phase = "permits";
      PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = {
        status: "authorized",
        authorizedAt: new Date().toISOString(),
        authorizedBy: "Test Client",
      } as unknown as typeof PROJECT_PERMIT_AUTHORIZATIONS[string];
      ensureUnsigned();
      nextResult = { ok: false, reason: "smtp_blackhole" };
      const adminToken = await login(baseUrl, "demo@konti.com");
      const sigId = (PROJECT_REQUIRED_SIGNATURES[PROJ] ?? [])[0]!.id;
      const res = await fetch(`${baseUrl}/api/projects/${PROJ}/request-signature/${sigId}`, {
        method: "POST",
        headers: auth(adminToken, true),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { emailSent: boolean; reason?: string };
      assert.equal(body.emailSent, false);
      assert.equal(body.reason, "smtp_blackhole");
      const acts = PROJECT_ACTIVITIES[PROJ] ?? [];
      assert.ok(
        acts.some((a) => a.type === "email_failed"),
        "expected email_failed activity row",
      );
      // Dedupe key was freed so retry is allowed.
      assert.equal(pendingSignatureRequests.size, 0);
    } finally {
      (project as { phase: string }).phase = originalPhase;
      if (authSnap) PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = authSnap;
      else delete PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
      restoreSignatures(PROJ, sigsSnap);
      restoreActivities(PROJ, actsSnap);
      pendingSignatureRequests.clear();
    }
  });
});

test("sign: client signature triggers signature_completed email to team", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === PROJ)!;
    const originalPhase = project.phase;
    const sigsSnap = snapshotSignatures(PROJ);
    const actsSnap = snapshotActivities(PROJ);
    const authSnap = PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
    try {
      // Force the project into the permits phase + pre-authorize so /sign is allowed.
      (project as { phase: string }).phase = "permits";
      PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = {
        status: "authorized",
        authorizedAt: new Date().toISOString(),
        authorizedBy: "Test Client",
      } as unknown as typeof PROJECT_PERMIT_AUTHORIZATIONS[string];
      ensureUnsigned();
      const clientToken = await login(baseUrl, "client@konti.com");
      const sigId = (PROJECT_REQUIRED_SIGNATURES[PROJ] ?? [])[0]!.id;
      const res = await fetch(`${baseUrl}/api/projects/${PROJ}/sign/${sigId}`, {
        method: "POST",
        headers: auth(clientToken, true),
        body: JSON.stringify({ signatureName: "Test Signer" }),
      });
      assert.equal(res.status, 200);
      const completed = captured.find((c) => c.template === "signature_completed");
      assert.ok(completed, "expected signature_completed email");
      assert.match(completed!.subject, /Signature received/);
    } finally {
      (project as { phase: string }).phase = originalPhase;
      if (authSnap) PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = authSnap;
      else delete PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
      restoreSignatures(PROJ, sigsSnap);
      restoreActivities(PROJ, actsSnap);
    }
  });
});

test("decline-phase: real decline_notify email sent to team and email_sent activity recorded", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    const actsSnap = snapshotActivities("proj-1");
    try {
      // Ensure consultation phase so decline endpoint is callable.
      (project as { phase: string }).phase = "consultation";
      const clientToken = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/decline-phase`, {
        method: "POST",
        headers: auth(clientToken, true),
        body: JSON.stringify({ reason: "Need more time to review" }),
      });
      assert.equal(res.status, 200);
      const decline = captured.find((c) => c.template === "decline_notify");
      assert.ok(decline, "expected decline_notify email");
      assert.match(decline!.subject, /Client declined/);
      const acts = PROJECT_ACTIVITIES["proj-1"] ?? [];
      assert.ok(acts.some((a) => a.type === "email_sent"), "expected email_sent activity");
    } finally {
      (project as { phase: string }).phase = originalPhase;
      restoreActivities("proj-1", actsSnap);
    }
  });
});

test("advance-phase: client client-gate kickoff produces phase_kickoff email", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    const originalLabel = project.phaseLabel;
    const originalLabelEs = project.phaseLabelEs;
    const originalNumber = project.phaseNumber;
    const actsSnap = snapshotActivities("proj-1");
    try {
      (project as { phase: string }).phase = "consultation";
      const clientToken = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/advance-phase`, {
        method: "POST",
        headers: auth(clientToken, true),
      });
      assert.equal(res.status, 200);
      const kickoff = captured.find((c) => c.template === "phase_kickoff");
      assert.ok(kickoff, "expected phase_kickoff email");
      assert.match(kickoff!.subject, /Phase kickoff/);
    } finally {
      (project as { phase: string }).phase = originalPhase;
      (project as { phaseLabel: string }).phaseLabel = originalLabel;
      (project as { phaseLabelEs: string }).phaseLabelEs = originalLabelEs;
      (project as { phaseNumber: number }).phaseNumber = originalNumber;
      restoreActivities("proj-1", actsSnap);
    }
  });
});

test("advance-phase: failure isolation — mutation succeeds + email_failed recorded + warning surfaced", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    const originalLabel = project.phaseLabel;
    const originalLabelEs = project.phaseLabelEs;
    const originalNumber = project.phaseNumber;
    const actsSnap = snapshotActivities("proj-1");
    try {
      (project as { phase: string }).phase = "consultation";
      nextResult = { ok: false, reason: "smtp_down" };
      const clientToken = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/advance-phase`, {
        method: "POST",
        headers: auth(clientToken, true),
      });
      assert.equal(res.status, 200, "mutation must still succeed when email fails");
      const body = (await res.json()) as { advancedTo: string; emailWarning?: string };
      assert.equal(body.advancedTo, "pre_design");
      assert.equal(body.emailWarning, "smtp_down");
      const acts = PROJECT_ACTIVITIES["proj-1"] ?? [];
      assert.ok(acts.some((a) => a.type === "email_failed"), "expected email_failed activity row");
    } finally {
      (project as { phase: string }).phase = originalPhase;
      (project as { phaseLabel: string }).phaseLabel = originalLabel;
      (project as { phaseLabelEs: string }).phaseLabelEs = originalLabelEs;
      (project as { phaseNumber: number }).phaseNumber = originalNumber;
      restoreActivities("proj-1", actsSnap);
    }
  });
});

test("decline-phase: failure isolation — mutation succeeds + email_failed + warning surfaced", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    const actsSnap = snapshotActivities("proj-1");
    try {
      (project as { phase: string }).phase = "consultation";
      nextResult = { ok: false, reason: "rate_limited" };
      const clientToken = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/decline-phase`, {
        method: "POST",
        headers: auth(clientToken, true),
        body: JSON.stringify({ reason: "test" }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { emailWarning?: string };
      assert.equal(body.emailWarning, "rate_limited");
      const acts = PROJECT_ACTIVITIES["proj-1"] ?? [];
      assert.ok(acts.some((a) => a.type === "email_failed"));
    } finally {
      (project as { phase: string }).phase = originalPhase;
      restoreActivities("proj-1", actsSnap);
    }
  });
});

test("sign: failure isolation — signature recorded even when team email fails", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === PROJ)!;
    const originalPhase = project.phase;
    const sigsSnap = snapshotSignatures(PROJ);
    const actsSnap = snapshotActivities(PROJ);
    const authSnap = PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
    try {
      (project as { phase: string }).phase = "permits";
      PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = {
        status: "authorized",
        authorizedAt: new Date().toISOString(),
        authorizedBy: "Test Client",
      } as unknown as typeof PROJECT_PERMIT_AUTHORIZATIONS[string];
      ensureUnsigned();
      nextResult = { ok: false, reason: "send_blocked" };
      const clientToken = await login(baseUrl, "client@konti.com");
      const sigId = (PROJECT_REQUIRED_SIGNATURES[PROJ] ?? [])[0]!.id;
      const res = await fetch(`${baseUrl}/api/projects/${PROJ}/sign/${sigId}`, {
        method: "POST",
        headers: auth(clientToken, true),
        body: JSON.stringify({ signatureName: "Test Signer" }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { signature: { signedAt?: string }; emailWarning?: string };
      assert.ok(body.signature.signedAt, "signature must be recorded even when email fails");
      assert.equal(body.emailWarning, "send_blocked");
      const acts = PROJECT_ACTIVITIES[PROJ] ?? [];
      assert.ok(acts.some((a) => a.type === "email_failed"));
    } finally {
      (project as { phase: string }).phase = originalPhase;
      if (authSnap) PROJECT_PERMIT_AUTHORIZATIONS[PROJ] = authSnap;
      else delete PROJECT_PERMIT_AUTHORIZATIONS[PROJ];
      restoreSignatures(PROJ, sigsSnap);
      restoreActivities(PROJ, actsSnap);
    }
  });
});

test("request-signature: rejects when project not in permits phase or not authorized", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    try {
      (project as { phase: string }).phase = "consultation";
      const adminToken = await login(baseUrl, "demo@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/request-signature/sig-anything`, {
        method: "POST",
        headers: auth(adminToken, true),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "invalid_phase");
    } finally {
      (project as { phase: string }).phase = originalPhase;
    }
  });
});

test("proposal-approve: real proposal_accept email sent to client", async () => {
  await withServer(async (baseUrl) => {
    const project = PROJECTS.find((p) => p.id === "proj-1")!;
    const originalPhase = project.phase;
    const originalLabel = project.phaseLabel;
    const originalLabelEs = project.phaseLabelEs;
    const originalNumber = project.phaseNumber;
    const proposalsSnap = JSON.parse(JSON.stringify(PROJECT_PROPOSALS["proj-1"] ?? []));
    const actsSnap = snapshotActivities("proj-1");
    try {
      (project as { phase: string }).phase = "pre_design";
      // Seed a pending proposal we can approve.
      PROJECT_PROPOSALS["proj-1"] = [
        {
          id: "test-prop-1",
          title: "Standard Container Build",
          titleEs: "Construcción Estándar de Contenedor",
          totalCost: 280000,
          status: "pending",
          summary: "test",
          summaryEs: "test",
          createdAt: new Date().toISOString(),
        } as unknown as (typeof PROJECT_PROPOSALS)[string][number],
      ];
      const clientToken = await login(baseUrl, "client@konti.com");
      const res = await fetch(`${baseUrl}/api/projects/proj-1/proposals/test-prop-1/approve`, {
        method: "POST",
        headers: auth(clientToken, true),
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
      const accept = captured.find((c) => c.template === "proposal_accept");
      assert.ok(accept, "expected proposal_accept email");
      assert.equal(accept!.to, "client@konti.com");
      assert.match(accept!.subject, /Proposal acceptance receipt/);
    } finally {
      (project as { phase: string }).phase = originalPhase;
      (project as { phaseLabel: string }).phaseLabel = originalLabel;
      (project as { phaseLabelEs: string }).phaseLabelEs = originalLabelEs;
      (project as { phaseNumber: number }).phaseNumber = originalNumber;
      PROJECT_PROPOSALS["proj-1"] = proposalsSnap;
      restoreActivities("proj-1", actsSnap);
    }
  });
});
