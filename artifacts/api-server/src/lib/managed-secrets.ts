// Managed secrets store (Task #130).
//
// Provides a superadmin-managed override store for runtime-tunable API keys
// that the dashboard depends on. Two responsibilities:
//
//   1. `getManagedSecret(name)` — central getter used by the rest of the
//      backend to read API keys. Returns the decrypted override if one exists
//      in the override store, otherwise falls back to `process.env[name]`.
//      This lets a superadmin rotate keys (e.g. PDF_CO_API_KEY) at runtime
//      without redeploying. Existing call sites keep working unchanged after
//      they switch from `process.env[X]` → `getManagedSecret(X)`.
//
//   2. Encrypted-at-rest persistence of overrides under .data/. We never
//      log or return raw secret values via the API surface — only masked
//      previews ("sk-…1234") and a `source` flag.
//
// Encryption: AES-256-GCM. The master key is derived from `JWT_SECRET`
// (already required by the app) using HKDF-SHA256 with a fixed salt + info
// pair so the operator does not need to manage another secret. Each secret
// stores its own random 12-byte IV.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Registry — the canonical list of secrets the Integrations tab manages.
// ---------------------------------------------------------------------------

export type ManagedSecretCategory = "ai" | "pdf" | "presentation" | "oauth";

export interface ManagedSecretMeta {
  /** Env var name. Also used as the canonical key in the override store. */
  name: string;
  label: string;
  labelEs: string;
  description: string;
  descriptionEs: string;
  category: ManagedSecretCategory;
  /** True if a Test button should appear on the row. */
  testable: boolean;
  /** Hint shown in the Update modal so the operator pastes the right value. */
  formatHint?: string;
}

export const MANAGED_SECRETS: readonly ManagedSecretMeta[] = [
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    labelEs: "Llave API de Anthropic",
    description: "Used by the AI Assistant (client + internal spec bot).",
    descriptionEs: "Utilizada por el Asistente IA (cliente + bot interno).",
    category: "ai",
    testable: true,
    formatHint: "sk-ant-…",
  },
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
    labelEs: "Llave API de OpenAI",
    description: "Fallback model for the AI Assistant when Anthropic is down.",
    descriptionEs: "Modelo alterno del Asistente IA cuando Anthropic falla.",
    category: "ai",
    testable: true,
    formatHint: "sk-…",
  },
  {
    name: "PDF_CO_API_KEY",
    label: "PDF.co API key",
    labelEs: "Llave API de PDF.co",
    description: "Powers project / spec PDF export and receipt OCR.",
    descriptionEs: "Genera PDFs de proyecto y OCR de recibos.",
    category: "pdf",
    testable: true,
  },
  {
    name: "GAMMA_APP_KEY",
    label: "Gamma.app API key",
    labelEs: "Llave API de Gamma.app",
    description:
      "Reserved for the upcoming Gamma slide export pipeline. Paste-only — testing is not yet wired.",
    descriptionEs:
      "Reservada para el futuro pipeline de exportación de Gamma. Solo guarda — la prueba aún no está conectada.",
    category: "presentation",
    testable: false,
  },
  {
    name: "GOOGLE_CLIENT_ID",
    label: "Google OAuth client ID",
    labelEs: "ID de cliente OAuth de Google",
    description:
      "OAuth client ID for the Drive integration. Pair with GOOGLE_CLIENT_SECRET. Paste-only — testing is not yet wired.",
    descriptionEs:
      "ID del cliente OAuth para la integración con Drive. Acompáñala con GOOGLE_CLIENT_SECRET. Solo guarda — la prueba aún no está conectada.",
    category: "oauth",
    testable: false,
    formatHint: "…apps.googleusercontent.com",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    label: "Google OAuth client secret",
    labelEs: "Secreto de cliente OAuth de Google",
    description:
      "OAuth client secret for the Drive integration. Pair with GOOGLE_CLIENT_ID. Paste-only — testing is not yet wired.",
    descriptionEs:
      "Secreto del cliente OAuth para la integración con Drive. Acompáñalo con GOOGLE_CLIENT_ID. Solo guarda — la prueba aún no está conectada.",
    category: "oauth",
    testable: false,
    formatHint: "GOCSPX-…",
  },
] as const;

export function isManagedSecretName(name: string): boolean {
  return MANAGED_SECRETS.some((s) => s.name === name);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface EncryptedSecretRecord {
  iv: string; // base64
  ciphertext: string; // base64
  authTag: string; // base64
  updatedAt: string;
  updatedBy: string; // user id or "system"
}

interface OverrideStoreFile {
  version: 1;
  secrets: Record<string, EncryptedSecretRecord>;
}

const DEFAULT_FILE: OverrideStoreFile = { version: 1, secrets: {} };

function defaultPath(): string {
  if (process.env["SECRETS_OVERRIDE_FILE"]) {
    return process.env["SECRETS_OVERRIDE_FILE"] as string;
  }
  if (process.env["NODE_ENV"] === "test") {
    return path.join(
      os.tmpdir(),
      `konti-secrets-test-${process.pid}.json`,
    );
  }
  const baseDir = process.env["KONTI_DATA_DIR"]
    ? (process.env["KONTI_DATA_DIR"] as string)
    : path.resolve(process.cwd(), ".data");
  return path.join(baseDir, "secrets-overrides.json");
}

let _path: string | null = null;
function getStoreFile(): string {
  if (_path === null) _path = defaultPath();
  return _path;
}

export function _setStoreFileForTests(p: string | null): void {
  _path = p;
  _state = null;
  _masterKey = null;
}

let _state: OverrideStoreFile | null = null;

function loadFromDisk(): OverrideStoreFile {
  const file = getStoreFile();
  try {
    if (!fs.existsSync(file)) return structuredClone(DEFAULT_FILE);
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return structuredClone(DEFAULT_FILE);
    const parsed = JSON.parse(raw) as Partial<OverrideStoreFile>;
    return {
      version: 1,
      secrets:
        parsed.secrets && typeof parsed.secrets === "object"
          ? (parsed.secrets as Record<string, EncryptedSecretRecord>)
          : {},
    };
  } catch (err) {
    logger.error(
      { err, file },
      "managed-secrets: load failed; falling back to empty store",
    );
    return structuredClone(DEFAULT_FILE);
  }
}

function persist(): void {
  if (!_state) return;
  const file = getStoreFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(_state, null, 2), "utf8");
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
  } catch (err) {
    logger.error({ err, file }, "managed-secrets: save failed");
  }
}

function getState(): OverrideStoreFile {
  if (_state === null) _state = loadFromDisk();
  return _state;
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    throw new Error(
      "managed-secrets: JWT_SECRET is required to derive the encryption master key",
    );
  }
  // HKDF-SHA256(JWT_SECRET, salt, info) -> 32-byte key for AES-256-GCM.
  const ikm = Buffer.from(jwtSecret, "utf8");
  const salt = Buffer.from("konti-secret-overrides-v1", "utf8");
  const info = Buffer.from("konti-managed-secrets-aes256gcm", "utf8");
  const keyArr = crypto.hkdfSync("sha256", ikm, salt, info, 32);
  _masterKey = Buffer.from(keyArr);
  return _masterKey;
}

function encrypt(plaintext: string, updatedBy: string): EncryptedSecretRecord {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: enc.toString("base64"),
    authTag: authTag.toString("base64"),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}

function decrypt(rec: EncryptedSecretRecord): string {
  const iv = Buffer.from(rec.iv, "base64");
  const ciphertext = Buffer.from(rec.ciphertext, "base64");
  const authTag = Buffer.from(rec.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ManagedSecretSource = "override" | "env" | "missing";

export interface ManagedSecretStatus {
  meta: ManagedSecretMeta;
  source: ManagedSecretSource;
  /** Last 4 chars of the value, padded with `…`. Empty when missing. */
  preview: string;
  /** ISO timestamp when override was set, if any. */
  overrideUpdatedAt: string | null;
  overrideUpdatedBy: string | null;
}

function maskValue(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "…" + trimmed;
  return "…" + trimmed.slice(-4);
}

/**
 * Central getter — call this instead of `process.env[name]` for any of the
 * secrets in {@link MANAGED_SECRETS}. Returns the decrypted override if one
 * exists, otherwise the env var, otherwise undefined.
 */
export function getManagedSecret(name: string): string | undefined {
  const state = getState();
  const rec = state.secrets[name];
  if (rec) {
    try {
      return decrypt(rec);
    } catch (err) {
      logger.error(
        { err, name },
        "managed-secrets: decrypt failed; falling back to env",
      );
    }
  }
  const envVal = process.env[name];
  return envVal && envVal.length > 0 ? envVal : undefined;
}

export function getManagedSecretSource(name: string): ManagedSecretSource {
  const state = getState();
  if (state.secrets[name]) return "override";
  const envVal = process.env[name];
  if (envVal && envVal.length > 0) return "env";
  return "missing";
}

export function listManagedSecretsStatus(): ManagedSecretStatus[] {
  const state = getState();
  return MANAGED_SECRETS.map((meta) => {
    const override = state.secrets[meta.name];
    const value = getManagedSecret(meta.name);
    const source: ManagedSecretSource = override
      ? "override"
      : value
        ? "env"
        : "missing";
    return {
      meta,
      source,
      preview: maskValue(value),
      overrideUpdatedAt: override?.updatedAt ?? null,
      overrideUpdatedBy: override?.updatedBy ?? null,
    };
  });
}

export function setManagedSecret(
  name: string,
  value: string,
  updatedBy: string,
): ManagedSecretStatus {
  if (!isManagedSecretName(name)) {
    throw new Error(`managed-secrets: ${name} is not a managed secret`);
  }
  if (!value || value.trim().length === 0) {
    throw new Error("managed-secrets: cannot set empty value");
  }
  const state = getState();
  state.secrets[name] = encrypt(value.trim(), updatedBy);
  persist();
  return getManagedSecretStatus(name);
}

export function clearManagedSecretOverride(name: string): ManagedSecretStatus {
  const state = getState();
  delete state.secrets[name];
  persist();
  return getManagedSecretStatus(name);
}

function getManagedSecretStatus(name: string): ManagedSecretStatus {
  const meta = MANAGED_SECRETS.find((s) => s.name === name);
  if (!meta) throw new Error(`unknown secret ${name}`);
  return listManagedSecretsStatus().find((s) => s.meta.name === name)!;
}

// Test helper.
export function _resetForTests(): void {
  _state = structuredClone(DEFAULT_FILE);
  _masterKey = null;
  const file = getStoreFile();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* best-effort */
  }
}
