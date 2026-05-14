import { randomUUID } from "node:crypto";

/**
 * Centralized ID generator. Replaces the legacy `Date.now() + Math.random()`
 * patterns scattered across the route handlers (collision-prone under burst
 * load, 5-char random suffix had birthday-paradox collisions at ~8k IDs).
 *
 * Uses `crypto.randomUUID()` which gives 122 bits of entropy — collisions are
 * effectively impossible. The prefix preserves the human-readable shape the
 * old IDs had (e.g. `note-`, `proj-`, `lead-`) so logs and DB rows are still
 * grep-able by entity kind.
 *
 * Finding C-4 / N-1.
 */
export function nextId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
