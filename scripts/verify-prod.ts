#!/usr/bin/env tsx
/**
 * verify-prod — production deploy verification
 *
 * Usage:
 *   npm run verify:prod          # health + smoke tests
 *   npm run verify:prod -- --open  # also open the app in browser
 *
 * Requires RAILWAY_PROD_URL in .env.deploy (or environment).
 * Optionally set E2E_TEST_EMAIL + E2E_TEST_PASSWORD for authenticated checks.
 *
 * Steps:
 *   1. Health check — GET /api/health must return 200 + { status: "ok" }
 *   2. What's deployed — shows the latest git commit currently in prod
 *   3. Unit + integration tests — run locally against mocks (CI parity check)
 *   4. Smoke E2E — Playwright against the live prod URL
 *   5. Open prod in browser (with --open flag or interactive prompt)
 */

import "dotenv/config";
import { spawnSync, execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
};

const log   = (msg: string) => process.stdout.write(msg + "\n");
const step  = (n: number, total: number, msg: string) =>
  log(`\n${c.bold}${c.cyan}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`);
const ok    = (msg: string) => log(`  ${c.green}✓${c.reset}  ${msg}`);
const warn  = (msg: string) => log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const fail  = (msg: string) => log(`  ${c.red}✗${c.reset} ${c.bold}${msg}${c.reset}`);
const info  = (msg: string) => log(`  ${c.dim}${msg}${c.reset}`);
const hr    = () => log(`${c.dim}${"─".repeat(60)}${c.reset}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string, extraEnv?: Record<string, string>): void {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`Command failed: ${cmd}`);
}

function tryExec(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

function loadEnv(): void {
  const deployEnvPath = resolve(process.cwd(), ".env.deploy");
  if (!existsSync(deployEnvPath)) return; // fall through to process.env
  const content = readFileSync(deployEnvPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").replace(/^["']|["']$/g, "").trim();
    }
  }
}

function getProdUrl(): string {
  const url = process.env.RAILWAY_PROD_URL;
  if (!url) {
    throw new Error(
      "RAILWAY_PROD_URL is not set.\n" +
      "  Add it to .env.deploy:\n" +
      "    RAILWAY_PROD_URL=https://command-center-reboot-production.up.railway.app"
    );
  }
  return url.replace(/\/$/, "");
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawnSync(`${cmd} "${url}"`, { shell: true });
}

async function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

async function healthCheck(prodUrl: string): Promise<void> {
  const url = `${prodUrl}/api/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Health endpoint returned HTTP ${res.status}`);
  const body = await res.json() as { status?: string };
  if (body.status !== "ok") throw new Error(`Unexpected health body: ${JSON.stringify(body)}`);
  ok(`${url} → 200 OK (status: ok)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const autoOpen = args.includes("--open");
  const skipTests = args.includes("--skip-tests");

  const hasE2ECreds = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
  const total = skipTests ? 2 : (hasE2ECreds ? 5 : 4);

  log(`\n${c.bold}${c.white}┌─ Production Deploy Verification ─────────────────────┐${c.reset}`);
  log(`${c.bold}${c.white}│${c.reset} ${c.dim}${new Date().toLocaleString()}${c.reset}`);
  log(`${c.bold}${c.white}└───────────────────────────────────────────────────────┘${c.reset}`);

  loadEnv();
  const prodUrl = getProdUrl();
  info(`Target: ${c.cyan}${prodUrl}${c.reset}`);

  // ── Step 1: Health ──────────────────────────────────────────────────────────
  step(1, total, "Production health check");
  await healthCheck(prodUrl);

  // ── Step 2: What's deployed ─────────────────────────────────────────────────
  step(2, total, "What's deployed");
  const localHead  = tryExec("git log -1 --format=\"%h %s (%cr)\" origin/dev");
  const localMain  = tryExec("git log -1 --format=\"%h %s (%cr)\" origin/main");
  const sinceCount = tryExec("git log --oneline origin/main..origin/dev | wc -l | tr -d ' '");

  info(`origin/dev  → ${localHead || "(not fetched)"}`);
  info(`origin/main → ${localMain || "(not fetched)"}`);
  if (sinceCount && sinceCount !== "0") {
    warn(`${sinceCount} commit(s) on dev not yet on main — prod may be behind`);
    const recent = tryExec("git log --oneline origin/main..origin/dev | head -5");
    if (recent) recent.split("\n").forEach((l) => info(`  ${l}`));
  } else {
    ok("main is current with dev");
  }
  hr();

  if (skipTests) {
    step(total, total, "Skipped tests (--skip-tests)");
    warn("Pass --skip-tests removed test steps. Run without it for full verification.");
  } else {
    // ── Step 3: Local tests ───────────────────────────────────────────────────
    step(3, total, "Unit + integration tests (local)");
    run("npm run test");
    ok("All tests passed");

    // ── Step 4: Smoke E2E against prod ────────────────────────────────────────
    step(4, total, "Smoke E2E against prod");
    run("npx playwright test e2e/smoke.spec.ts --reporter=list", { BASE_URL: prodUrl });
    ok("Smoke tests passed against prod");

    // ── Step 5: Authenticated E2E (optional) ──────────────────────────────────
    if (hasE2ECreds) {
      step(5, total, "Authenticated E2E against prod");
      run("npx playwright test e2e/authenticated.spec.ts --reporter=list", {
        BASE_URL: prodUrl,
        E2E_TEST_EMAIL:    process.env.E2E_TEST_EMAIL!,
        E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD!,
      });
      ok("Authenticated E2E passed");
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  hr();
  log(`\n${c.bold}${c.green}✅ Production verification complete${c.reset}`);
  info(prodUrl);

  // ── Open in browser ─────────────────────────────────────────────────────────
  const shouldOpen = autoOpen || (process.stdin.isTTY && await confirm("\nOpen prod in browser?"));
  if (shouldOpen) {
    openInBrowser(prodUrl);
    openInBrowser(`${prodUrl}/api/health`);
    ok("Opened prod in browser");
  }

  log("");
}

main().catch((err: unknown) => {
  const e = err as { message?: string };
  fail(`VERIFICATION FAILED: ${e.message ?? String(err)}`);
  log("");
  process.exit(1);
});
