// Verify safeErrorMessage() (Task #130) never lets a raw secret leak through
// upstream error text. We assert on three classes of input:
//   1. Provider error that literally echoes the submitted key.
//   2. Provider error that mentions a different sk-prefixed token.
//   3. Long opaque alphanumeric tokens with no recognised prefix.
// Plus a static check that admin-secrets.ts never logs a raw `err` object
// in any of its handler/test/restart paths (which would bypass
// safeErrorMessage and write provider error bodies — possibly containing
// the submitted key — straight into the structured log stream).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { safeErrorMessage } = await import("../admin-secrets");

test("redacts the literal submitted secret", () => {
  const key = "sk-ant-this-is-a-real-key-deadbeef-12345";
  const upstream = `Authentication error: invalid api key ${key} please check`;
  const out = safeErrorMessage(upstream, key);
  assert.ok(!out.includes(key), `output still contained the live key: ${out}`);
  assert.ok(out.includes("[REDACTED]"));
});

test("redacts other sk- / pk- / Bearer tokens we did not submit", () => {
  const out = safeErrorMessage(
    "401 from upstream — token sk-other-secret-abcdef1234567 was rejected",
  );
  assert.ok(!out.includes("sk-other-secret-abcdef1234567"));
  assert.ok(out.includes("[REDACTED]"));
});

test("redacts long opaque alphanumeric runs", () => {
  const out = safeErrorMessage(
    "PDF.co response: account=ABCDEFGHIJ1234567890ZZZZ rejected",
  );
  assert.ok(!out.includes("ABCDEFGHIJ1234567890ZZZZ"));
});

test("preserves long pure-alpha words (e.g. error codes / english phrases)", () => {
  const out = safeErrorMessage(
    "AuthenticationFailedException: please check configuration",
  );
  assert.ok(out.includes("AuthenticationFailedException"));
});

test("caps result length at 160 characters", () => {
  const huge = "x".repeat(5000);
  const out = safeErrorMessage(huge);
  assert.ok(out.length <= 161); // 160 + the ellipsis
});

test("falls back to a default message when input is empty / nullish", () => {
  assert.equal(safeErrorMessage(undefined), "Operation failed");
  assert.equal(safeErrorMessage(null), "Operation failed");
  assert.equal(safeErrorMessage(""), "Operation failed");
});

test("handles Error instances", () => {
  const out = safeErrorMessage(new Error("boom: sk-leak-1234567890abcdef"));
  assert.ok(!out.includes("sk-leak-1234567890abcdef"));
  assert.ok(out.startsWith("boom:"));
});

test("static: admin-secrets.ts never logs a raw `err` payload", () => {
  // Why: pino's structured logger serialises whatever you put in the bag,
  // including the full err.message / err.response.body coming back from
  // upstream providers. Some providers (e.g. PDF.co's `Authentication
  // failed for ...`) echo the submitted API key in their error bodies. So
  // every catch in this file MUST sanitize via safeErrorMessage() before
  // touching the logger. This test catches future regressions.
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "..", "admin-secrets.ts"),
    "utf8",
  );
  // Strip line comments so the regex below doesn't trip on documentation.
  const code = src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  // Match `logger.<level>({ ..., err ...` patterns — meaning a raw err
  // (or something destructured from it) is in the bag passed to pino.
  const bad = /logger\.(warn|error|info|debug|trace|fatal)\s*\(\s*\{[^}]*\berr\b/;
  const m = code.match(bad);
  assert.equal(
    m,
    null,
    `Found a raw err logged in admin-secrets.ts — sanitize via safeErrorMessage first.\nMatched fragment: ${
      m ? m[0] : ""
    }`,
  );
});
