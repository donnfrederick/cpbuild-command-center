/**
 * Token usage estimator for AI agent context loading.
 *
 * Approximation: 1 token ≈ 4 characters (OpenAI/Anthropic rough average).
 * Run with: npx tsx scripts/token-audit.ts
 */

import fs from "fs";
import path from "path";

const CHARS_PER_TOKEN = 4;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function bytesOf(filePath: string): number {
  try {
    return fs.statSync(path.join(ROOT, filePath)).size;
  } catch {
    return 0;
  }
}

function tokensOf(filePath: string): number {
  return Math.round(bytesOf(filePath) / CHARS_PER_TOKEN);
}

function row(label: string, filePath: string) {
  const t = tokensOf(filePath);
  return { label, file: filePath, tokens: t };
}

// ── Old context layer (what agents loaded before this session) ─────────────
const OLD_REQUIRED = [
  row("DEV_NOTES.md", "DEV_NOTES.md"),
  row("PROJECT_TRACKER.md", "PROJECT_TRACKER.md"),
  row("LAYOUT_RULES.md", "LAYOUT_RULES.md"),
];

const OLD_SOURCE_TYPICAL = [
  row("prisma/schema.prisma", "prisma/schema.prisma"),
  row("lib/auth.ts", "lib/auth.ts"),
  row("lib/permissions.ts", "lib/permissions.ts"),
  row("lib/db.ts", "lib/db.ts"),
  row("proxy.ts", "proxy.ts"),
  row("app/api/projects/route.ts (example)", "app/api/projects/route.ts"),
  row("app/api/invites/route.ts (example)", "app/api/invites/route.ts"),
];

// ── New context layer (docs/agent-context/) ────────────────────────────────
const NEW_ALL = [
  row("project-overview.md", "docs/agent-context/project-overview.md"),
  row("architecture.md", "docs/agent-context/architecture.md"),
  row("database-schema.md", "docs/agent-context/database-schema.md"),
  row("backend-patterns.md", "docs/agent-context/backend-patterns.md"),
  row("frontend-patterns.md", "docs/agent-context/frontend-patterns.md"),
  row("api-endpoints.md", "docs/agent-context/api-endpoints.md"),
  row("key-services.md", "docs/agent-context/key-services.md"),
];

// Typical task loads 2-3 files — backend task example
const NEW_BACKEND_TASK = [
  row("architecture.md", "docs/agent-context/architecture.md"),
  row("backend-patterns.md", "docs/agent-context/backend-patterns.md"),
  row("api-endpoints.md", "docs/agent-context/api-endpoints.md"),
];

const NEW_DB_TASK = [
  row("database-schema.md", "docs/agent-context/database-schema.md"),
  row("backend-patterns.md", "docs/agent-context/backend-patterns.md"),
];

const NEW_FULLSTACK_TASK = [
  row("architecture.md", "docs/agent-context/architecture.md"),
  row("database-schema.md", "docs/agent-context/database-schema.md"),
  row("backend-patterns.md", "docs/agent-context/backend-patterns.md"),
  row("frontend-patterns.md", "docs/agent-context/frontend-patterns.md"),
  row("api-endpoints.md", "docs/agent-context/api-endpoints.md"),
];

// ── Helpers ────────────────────────────────────────────────────────────────
function sum(rows: { tokens: number }[]) {
  return rows.reduce((a, r) => a + r.tokens, 0);
}

function print(title: string, rows: { label: string; tokens: number }[]) {
  console.log(`\n${title}`);
  console.log("─".repeat(60));
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(42)} ${String(r.tokens).padStart(6)} tokens`);
  }
  console.log("─".repeat(60));
  console.log(`  ${"TOTAL".padEnd(42)} ${String(sum(rows)).padStart(6)} tokens`);
}

function pct(oldVal: number, newVal: number) {
  return Math.round(((oldVal - newVal) / oldVal) * 100);
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║       CP Build Field Tracker — Agent Token Audit           ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nEstimation basis: 1 token ≈ ${CHARS_PER_TOKEN} characters (Anthropic average)\n`);

const oldRequired = sum(OLD_REQUIRED);
const oldSource = sum(OLD_SOURCE_TYPICAL);
const oldTotal = oldRequired + oldSource;

print("OLD APPROACH — Required docs (loaded every session)", OLD_REQUIRED);
print("OLD APPROACH — Typical source files scanned per task", OLD_SOURCE_TYPICAL);

console.log(`\n  ► Old session startup cost (docs only):    ${oldRequired} tokens`);
console.log(`  ► Old typical task cost (docs + source):   ${oldTotal} tokens`);

print("\nNEW APPROACH — All 7 context files (worst case)", NEW_ALL);
print("NEW APPROACH — Backend task (3 files)", NEW_BACKEND_TASK);
print("NEW APPROACH — DB/migration task (2 files)", NEW_DB_TASK);
print("NEW APPROACH — Full-stack task (5 files)", NEW_FULLSTACK_TASK);

const newBackend = sum(NEW_BACKEND_TASK);
const newDB = sum(NEW_DB_TASK);
const newFullstack = sum(NEW_FULLSTACK_TASK);
const newAll = sum(NEW_ALL);

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║                    SAVINGS SUMMARY                         ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log(`║  Old required docs alone:      ${String(oldRequired).padStart(6)} tokens               ║`);
console.log(`║  Old typical task total:       ${String(oldTotal).padStart(6)} tokens               ║`);
console.log(`║                                                              ║`);
console.log(`║  New: backend task (3 files):  ${String(newBackend).padStart(6)} tokens  (-${String(pct(oldTotal, newBackend)).padStart(2)}%)          ║`);
console.log(`║  New: DB task (2 files):       ${String(newDB).padStart(6)} tokens  (-${String(pct(oldTotal, newDB)).padStart(2)}%)          ║`);
console.log(`║  New: full-stack task (5 files):${String(newFullstack).padStart(5)} tokens  (-${String(pct(oldTotal, newFullstack)).padStart(2)}%)          ║`);
console.log(`║  New: worst case (all 7):      ${String(newAll).padStart(6)} tokens  (-${String(pct(oldTotal, newAll)).padStart(2)}%)          ║`);
console.log("╚══════════════════════════════════════════════════════════════╝");

console.log(`
HOW TO CHECK REAL USAGE:
  1. Anthropic Console  → console.anthropic.com → Usage tab (token counts by day/model)
  2. Cursor settings    → gear icon → Usage (shows requests + tokens if on API key plan)
  3. Compare this week (post context layer) vs last week in the Anthropic console

TO TRACK PER-SESSION CONTEXT LOADING:
  → Agents log which files they loaded at the top of each session response.
  → The .cursor/rules/agent-context.mdc rule now enforces selective loading.
  → Run this script after adding new context files to see updated estimates.
`);
