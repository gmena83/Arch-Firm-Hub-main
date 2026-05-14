#!/usr/bin/env node
/**
 * Untranslated-string lint for the calculator surface.
 *
 * Strategy: every user-facing string in this codebase MUST go through the
 *   t("English", "Español")
 * helper from `@/hooks/use-lang`. So we
 *   1. strip every `t(...)` call from the file (multi-line aware),
 *   2. then scan what's left for string literals that look like
 *      user-facing copy (>= 12 chars AND contain a space AND start with a
 *      capital letter — typical sentence/title pattern), and
 *   3. report any matches that aren't inside an obvious allow-list
 *      context (className, errors thrown to developers, HTTP headers,
 *      regex literals, etc.).
 *
 * Exit code 0 = clean, 1 = at least one untranslated user-facing string.
 *
 * Wire into CI via:
 *   pnpm --filter @workspace/konti-dashboard run lint:translations
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGETS = [
  "src/pages/calculator.tsx",
  "src/components/estimating/contractor-calculator.tsx",
  "src/components/estimating/imports-panel.tsx",
  "src/components/estimating/mapping-dialog.tsx",
  "src/components/estimating/variance-report.tsx",
];

// Substrings that, if present on the offending line, suppress the warning.
// Used for legitimate non-user-facing English (developer-only error
// messages, header names, framework conventions, etc.).
const IGNORE_LINE_SUBSTRINGS = [
  "className=",
  "data-testid=",
  "data-report-theme",
  "import ",
  "from \"@",
  "from \"./",
  "throw new Error",
  "console.log",
  "console.error",
  "console.warn",
  "JSON.parse",
  "Bearer ",
  "Content-Type",
  "operationId",
  "queryKey:",
  // Strings used only as wire identifiers (status enums, bucket keys).
  "\"on_track\"",
  "\"warning\"",
  "\"over\"",
  "\"materials\"",
  "\"labor\"",
  "\"subcontractor\"",
  "\"unassigned\"",
  "\"contractor_estimate\"",
  "\"calculator_entries\"",
];

// Words that, when present, mark the literal as English (so we don't
// false-positive on already-translated Spanish defaults that happen to
// start with a capital).
const ENGLISH_MARKERS = /\b(the|and|for|with|from|when|that|this|are|you|your|will|can|use|set|please|click|select|enter|upload|download|generate|preview|loading|saving|uploaded|imported|estimated|invoiced|actual|variance|category|item|quantity|price|total|standard|report|template|columns|header|footer|generated|preliminary|project|document|notes|effective|rate|hourly|cost|estimates|tagged|receipts|recomputed|recent|amount|hours|import|default|overrides|server|runs|paper|receipt|extracts|vendor|date|trade|baseline|spreadsheet|kept|recomputed|each|line|adjust|quantities|bulk|load|existing|materials|catalog|labor|rates|imported|items|separate|merge|standard|buckets|calculator)\b/i;

// Strip every `t(...)` call (greedy across newlines). This is approximate
// — it doesn't handle nested parens — but it's good enough for the
// `t("…", "…")` shape used in this codebase.
function stripTCalls(src) {
  // Match `t(` followed by anything up to the matching close-paren on the
  // same balanced level. We use a small state machine because JS regex
  // can't count parens.
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "t" && src[i + 1] === "(" && (i === 0 || /[^a-zA-Z0-9_$]/.test(src[i - 1]))) {
      // Skip the t( and find the matching )
      let depth = 1;
      let j = i + 2;
      let inStr = null; // '"' | "'" | "`" | null
      while (j < src.length && depth > 0) {
        const ch = src[j];
        if (inStr) {
          if (ch === "\\") { j += 2; continue; }
          if (ch === inStr) inStr = null;
        } else {
          if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
          else if (ch === "(") depth++;
          else if (ch === ")") depth--;
        }
        j++;
      }
      // Replace the entire t(...) with a placeholder of equal newline
      // count so line numbers stay stable.
      const slice = src.slice(i, j);
      const newlines = (slice.match(/\n/g) ?? []).length;
      out += "_T_" + "\n".repeat(newlines);
      i = j;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

const LITERAL_RE = /(["'])((?:(?!\1)[^\\\n]|\\.){12,}?)\1/g;

function looksUserFacing(literal) {
  if (!/\s/.test(literal)) return false;
  if (!/^[A-Z]/.test(literal)) return false;
  // Skip strings that are obviously class lists / wire formats.
  if (/^[a-z][a-z0-9:/_-]+(?:\s[a-z][a-z0-9:/_-]+)+$/.test(literal)) return false;
  // Must contain at least one English word marker; otherwise assume it's
  // already-translated Spanish copy or a wire string.
  return ENGLISH_MARKERS.test(literal);
}

// Strip `/* ... */` block comments and `{/* ... */}` JSX comments,
// preserving line numbers so reported positions stay accurate.
function stripBlockComments(src) {
  return src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => {
    const newlines = (m.match(/\n/g) ?? []).length;
    return "/*COMMENT*/" + "\n".repeat(newlines);
  });
}

function scanFile(absPath, relPath) {
  const raw = readFileSync(absPath, "utf8");
  const stripped = stripTCalls(stripBlockComments(raw));
  const lines = stripped.split("\n");
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (IGNORE_LINE_SUBSTRINGS.some((s) => line.includes(s))) continue;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;

    let match;
    LITERAL_RE.lastIndex = 0;
    while ((match = LITERAL_RE.exec(line)) !== null) {
      const literal = match[2];
      if (!looksUserFacing(literal)) continue;
      findings.push({ line: i + 1, col: match.index + 1, literal });
    }
  }

  if (findings.length === 0) return 0;
  console.log(`\n  ${relPath}`);
  for (const f of findings) {
    console.log(`    L${f.line}:${f.col}  "${f.literal.slice(0, 100)}${f.literal.length > 100 ? "…" : ""}"`);
  }
  return findings.length;
}

let total = 0;
console.log("Scanning calculator surface for untranslated user-facing strings…");
for (const rel of TARGETS) {
  const abs = resolve(process.cwd(), rel);
  total += scanFile(abs, rel);
}

if (total === 0) {
  console.log("  ✓ all user-facing strings on the calculator surface are wrapped in t()");
  process.exit(0);
} else {
  console.error(`\n  ✗ ${total} untranslated user-facing string(s) found.`);
  console.error(`    Wrap each in t("English", "Español") so the language toggle can translate it.`);
  process.exit(1);
}
