// Superadmin-only Integrations API surface (Task #130).
//
// All routes are gated with `requireRole(["superadmin"])` — admins (without
// the superadmin grant) cannot read, mutate, or test secrets and cannot
// trigger integration restarts. The audit log records every superadmin
// action so we can answer "who rotated the OpenAI key?" after the fact.
//
// We never log or return raw secret values. Test endpoints return
// `{ ok, message }` only.

import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { requireRole, type AuthedRequest } from "../middlewares/require-role";
import {
  MANAGED_SECRETS,
  isManagedSecretName,
  listManagedSecretsStatus,
  setManagedSecret,
  clearManagedSecretOverride,
  getManagedSecret,
} from "../lib/managed-secrets";
import { appendAudit, listAudit } from "../lib/audit-store";
import {
  getAsanaAccessToken,
  listWorkspaces,
  AsanaNotConnectedError,
  AsanaApiError,
} from "../lib/asana-client";
import {
  getDriveAccessToken,
  listFolders as listDriveFolders,
  DriveNotConnectedError,
  DriveApiError,
} from "../lib/drive-client";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SUPER = ["superadmin"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actorOf(req: AuthedRequest): { id: string; email: string } {
  const u = req.user;
  return {
    id: u?.id ?? "unknown",
    email: u?.email ?? "unknown",
  };
}

/**
 * Sanitize a third-party error message before it lands in an API response or
 * the persisted audit log. Some upstream providers echo the offending API key
 * back ("Invalid api key: sk-…"), so unfiltered propagation could leak the
 * very value we are trying to protect (Task #130).
 *
 * Rules:
 *   1. If `secretValue` is provided, every literal occurrence is masked.
 *   2. Common API-key prefixes (`sk-`, `pk-`, `Bearer`) plus their following
 *      token are masked with `[REDACTED]`.
 *   3. Long opaque alphanumeric runs (>=20 chars) are masked.
 *   4. The result is capped at 160 characters.
 */
export function safeErrorMessage(raw: unknown, secretValue?: string): string {
  let text = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!text) text = "Operation failed";
  if (secretValue && secretValue.length >= 4) {
    // Replace every literal occurrence of the live key.
    text = text.split(secretValue).join("[REDACTED]");
  }
  // Generic key-like patterns. These are intentionally aggressive so that an
  // upstream message like "Authentication failed for sk-ant-abc123…" never
  // round-trips raw.
  text = text.replace(
    /\b(?:sk|pk|rk|api[_-]?key|bearer)[-_ ]?[A-Za-z0-9_\-]{8,}/gi,
    "[REDACTED]",
  );
  text = text.replace(/[A-Za-z0-9_\-]{20,}/g, (match) =>
    /^[A-Za-z]+$/.test(match) ? match : "[REDACTED]",
  );
  if (text.length > 160) text = text.slice(0, 160) + "…";
  return text;
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

router.get("/admin/secrets", requireRole([...SUPER]), (_req, res) => {
  res.json({ secrets: listManagedSecretsStatus() });
});

router.post("/admin/secrets/:name", requireRole([...SUPER]), (req, res) => {
  const name = String(req.params["name"] ?? "");
  if (!isManagedSecretName(name)) {
    res.status(404).json({ error: "unknown_secret" });
    return;
  }
  const body = (req.body ?? {}) as { value?: string; clear?: boolean };
  const actor = actorOf(req as AuthedRequest);

  // Clear override -> revert to env fallback.
  if (body.clear === true) {
    const status = clearManagedSecretOverride(name);
    appendAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "secret.update",
      target: name,
      message: `Cleared override for ${name}`,
      messageEs: `Se eliminó la sustitución para ${name}`,
    });
    res.json({ status });
    return;
  }

  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value) {
    res.status(400).json({ error: "empty_value" });
    return;
  }
  try {
    const status = setManagedSecret(name, value, actor.id);
    appendAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "secret.update",
      target: name,
      message: `Updated override for ${name}`,
      messageEs: `Se actualizó la sustitución para ${name}`,
    });
    res.json({ status });
  } catch (err) {
    // SECURITY: this catch is reached after we have the user-submitted
    // value in scope; do not include the raw err in the log payload.
    const safe = safeErrorMessage(err);
    logger.warn({ name, safe }, "admin-secrets: setManagedSecret threw");
    res.status(500).json({ error: "internal", message: "failed_to_persist_secret" });
  }
});

// Test a key. Returns { ok, message } — never the raw value.
//
// Body shape:
//   {}                    -> probe the currently stored value (live test)
//   { value: "candidate" } -> probe a transient candidate WITHOUT persisting
//
// The candidate-value flow powers the modal "Test before Save" UX: the
// operator can paste a new key, hit Test, and confirm the probe before
// committing. The candidate value is never written to the override store
// and the audit log records the action as "secret.test_candidate" so it
// is distinguishable from a live-test of the persisted value.
router.post(
  "/admin/secrets/:name/test",
  requireRole([...SUPER]),
  async (req, res) => {
    const name = String(req.params["name"] ?? "");
    if (!isManagedSecretName(name)) {
      res.status(404).json({ error: "unknown_secret" });
      return;
    }
    const meta = MANAGED_SECRETS.find((s) => s.name === name);
    if (!meta?.testable) {
      // 200 (with ok:false) so the row's inline result renders the message
      // rather than throwing a generic mutation error in the toast layer.
      res.status(200).json({
        ok: false,
        message: "Test not yet wired for this key.",
        messageEs: "La prueba aún no está conectada para esta llave.",
      });
      return;
    }

    const body = (req.body ?? {}) as { value?: string };
    const candidate =
      typeof body.value === "string" && body.value.trim().length > 0
        ? body.value.trim()
        : null;
    const value = candidate ?? getManagedSecret(name);
    const isCandidate = candidate !== null;

    if (!value) {
      res.status(200).json({
        ok: false,
        message: "No value configured.",
        messageEs: "No hay valor configurado.",
      });
      return;
    }
    const actor = actorOf(req as AuthedRequest);
    try {
      const result = await runSecretTest(name, value);
      const liveOk = result.ok ? "secret.test" : "secret.test_failed";
      const candOk = result.ok
        ? "secret.test_candidate"
        : "secret.test_candidate_failed";
      appendAudit({
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: isCandidate ? candOk : liveOk,
        target: name,
        message: result.ok
          ? isCandidate
            ? `Tested candidate value for ${name} OK`
            : `Tested ${name} OK`
          : isCandidate
            ? `Candidate value test failed for ${name}: ${result.message}`
            : `Test failed for ${name}: ${result.message}`,
        messageEs: result.ok
          ? isCandidate
            ? `Prueba del candidato para ${name} OK`
            : `Prueba de ${name} OK`
          : isCandidate
            ? `Prueba del candidato falló para ${name}: ${
                result.messageEs ?? result.message
              }`
            : `Prueba falló para ${name}: ${
                result.messageEs ?? result.message
              }`,
      });
      res.json(result);
    } catch (err) {
      const safe = safeErrorMessage(err, value);
      logger.warn({ name, safe, isCandidate }, "admin-secrets: test threw");
      appendAudit({
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: isCandidate
          ? "secret.test_candidate_failed"
          : "secret.test_failed",
        target: name,
        message: `Test threw for ${name}: ${safe}`,
        messageEs: `La prueba de ${name} arrojó error: ${safe}`,
      });
      res.status(500).json({ ok: false, message: safe });
    }
  },
);

interface TestResult {
  ok: boolean;
  message: string;
  messageEs?: string;
}

async function runSecretTest(name: string, value: string): Promise<TestResult> {
  switch (name) {
    case "ANTHROPIC_API_KEY":
      return testAnthropic(value);
    case "OPENAI_API_KEY":
      return testOpenAI(value);
    case "PDF_CO_API_KEY":
      return testPdfCo(value);
    default:
      return {
        ok: false,
        message: "Test not implemented for this key.",
        messageEs: "La prueba no está implementada para esta llave.",
      };
  }
}

async function testAnthropic(apiKey: string): Promise<TestResult> {
  try {
    const client = new Anthropic({ apiKey });
    // models.list is a free, low-cost auth probe.
    const out = await client.models.list({ limit: 1 });
    const count = out.data.length;
    return {
      ok: true,
      message: `Anthropic OK (${count} model${count === 1 ? "" : "s"} reachable)`,
      messageEs: `Anthropic OK (${count} modelo${count === 1 ? "" : "s"} accesible${count === 1 ? "" : "s"})`,
    };
  } catch (err) {
    // SECURITY: never log the raw err — providers can echo the submitted
    // key in their error messages. Only log the sanitized text (the same
    // one that goes back over the wire).
    const safe = safeErrorMessage(err, apiKey);
    logger.warn({ provider: "anthropic", safe }, "admin-secrets: test failed");
    return { ok: false, message: `Anthropic error: ${safe}` };
  }
}

async function testOpenAI(apiKey: string): Promise<TestResult> {
  try {
    const client = new OpenAI({ apiKey });
    const out = await client.models.list();
    const count = out.data?.length ?? 0;
    return {
      ok: true,
      message: `OpenAI OK (${count} models reachable)`,
      messageEs: `OpenAI OK (${count} modelos accesibles)`,
    };
  } catch (err) {
    const safe = safeErrorMessage(err, apiKey);
    logger.warn({ provider: "openai", safe }, "admin-secrets: test failed");
    return { ok: false, message: `OpenAI error: ${safe}` };
  }
}

async function testPdfCo(apiKey: string): Promise<TestResult> {
  try {
    // Free credit-balance endpoint; auth-only call.
    const resp = await fetch("https://api.pdf.co/v1/account/credit/balance", {
      headers: { "x-api-key": apiKey },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        message: `PDF.co HTTP ${resp.status}: ${safeErrorMessage(text, apiKey)}`,
      };
    }
    const data = (await resp.json().catch(() => ({}))) as {
      remainingCredits?: number;
      error?: boolean;
      message?: string;
    };
    if (data.error) {
      return {
        ok: false,
        message: `PDF.co error: ${safeErrorMessage(data.message, apiKey)}`,
      };
    }
    return {
      ok: true,
      message: `PDF.co OK (credits remaining: ${data.remainingCredits ?? "?"})`,
      messageEs: `PDF.co OK (créditos restantes: ${data.remainingCredits ?? "?"})`,
    };
  } catch (err) {
    const safe = safeErrorMessage(err, apiKey);
    logger.warn({ provider: "pdf.co", safe }, "admin-secrets: test failed");
    return { ok: false, message: `PDF.co error: ${safe}` };
  }
}

// ---------------------------------------------------------------------------
// Integration restart
// ---------------------------------------------------------------------------

router.post(
  "/admin/integrations/restart/:name",
  requireRole([...SUPER]),
  async (req, res) => {
    const name = String(req.params["name"] ?? "");
    const actor = actorOf(req as AuthedRequest);
    let result: TestResult;
    try {
      switch (name) {
        case "drive":
          result = await restartDrive();
          break;
        case "asana":
          result = await restartAsana();
          break;
        default:
          res.status(404).json({ error: "unknown_integration" });
          return;
      }
    } catch (err) {
      // SECURITY: do not log the raw err; restart paths may surface OAuth
      // tokens or refresh tokens inside upstream error bodies.
      const safe = safeErrorMessage(err);
      logger.warn({ name, safe }, "admin-secrets: restart threw");
      result = { ok: false, message: safe };
    }
    appendAudit({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: result.ok ? "integration.restart" : "integration.restart_failed",
      target: name,
      message: result.ok
        ? `Restarted ${name} integration: ${result.message}`
        : `Restart failed for ${name}: ${result.message}`,
      messageEs: result.ok
        ? `Reinicio de ${name}: ${result.messageEs ?? result.message}`
        : `Reinicio falló para ${name}: ${result.messageEs ?? result.message}`,
    });
    res.json(result);
  },
);

// "Restart" the Drive integration: forces a fresh access token from the
// Replit connector proxy and runs a list-folders probe to confirm the
// connection is live. The token is fetched per-call (no module cache) so the
// probe itself is the restart.
async function restartDrive(): Promise<TestResult> {
  try {
    await getDriveAccessToken();
    const folders = await listDriveFolders(null);
    return {
      ok: true,
      message: `Drive connector OK (${folders.length} root folder${folders.length === 1 ? "" : "s"} visible)`,
      messageEs: `Conector Drive OK (${folders.length} carpeta${folders.length === 1 ? "" : "s"} visible${folders.length === 1 ? "" : "s"})`,
    };
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return { ok: false, message: `Drive not connected: ${safeErrorMessage(err)}` };
    }
    if (err instanceof DriveApiError) {
      return {
        ok: false,
        message: `Drive HTTP ${err.status}: ${safeErrorMessage(err.message)}`,
      };
    }
    return { ok: false, message: safeErrorMessage(err) };
  }
}

async function restartAsana(): Promise<TestResult> {
  try {
    await getAsanaAccessToken();
    const ws = await listWorkspaces();
    return {
      ok: true,
      message: `Asana connector OK (${ws.length} workspace${ws.length === 1 ? "" : "s"} visible)`,
      messageEs: `Conector Asana OK (${ws.length} workspace${ws.length === 1 ? "" : "s"} visible${ws.length === 1 ? "" : "s"})`,
    };
  } catch (err) {
    if (err instanceof AsanaNotConnectedError) {
      return { ok: false, message: `Asana not connected: ${safeErrorMessage(err)}` };
    }
    if (err instanceof AsanaApiError) {
      return {
        ok: false,
        message: `Asana HTTP ${err.status}: ${safeErrorMessage(err.message)}`,
      };
    }
    return { ok: false, message: safeErrorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

router.get("/admin/audit-log", requireRole([...SUPER]), (_req, res) => {
  res.json({ entries: listAudit() });
});

export default router;
