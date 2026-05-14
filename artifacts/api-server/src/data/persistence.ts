import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

const DATA_DIR =
  process.env["KONTI_DATA_DIR"] ??
  path.resolve(process.cwd(), "data");

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadJSON<T>(name: string, fallback: T): T {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    ensureDir();
    if (!existsSync(file)) return fallback;
    const raw = readFileSync(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    // Log loudly so silent durability loss is detectable. Fall back to the
    // provided default so the server still boots even if the on-disk file
    // is corrupt or unreadable.
    logger.error({ err, file }, "persistence.loadJSON failed");
    return fallback;
  }
}

const writeQueues: Record<string, Promise<void>> = {};

export function saveJSON<T>(name: string, data: T): Promise<void> {
  const job = (writeQueues[name] ?? Promise.resolve()).then(() => {
    const file = path.join(DATA_DIR, `${name}.json`);
    try {
      ensureDir();
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
      renameSync(tmp, file);
    } catch (err) {
      // The in-memory copy stays authoritative for the current process even
      // if the disk write fails, but log the error so the failure is visible
      // in the server logs rather than silently dropped.
      logger.error({ err, file }, "persistence.saveJSON failed");
    }
  });
  writeQueues[name] = job;
  return job;
}
