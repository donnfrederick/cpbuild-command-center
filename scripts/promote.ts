#!/usr/bin/env tsx
/**
 * Promote Pipeline
 *
 * Usage: npm run promote
 *
 * Flow:
 *   1. Unit tests
 *   2. Production build
 *   3. Deploy → Railway development environment
 *   4. Health-poll until live
 *   5. Open browser to dev URL
 *   6. Playwright smoke tests against dev
 *   7. Manual verification gate  ← YOU confirm here
 *   8. Deploy → Railway production environment
 *   9. Health-poll until live
 *  10. Open browser to prod URL
 *  11. Playwright smoke tests against prod
 *
 * Prerequisites (one-time):
 *   npm install -g @railway/cli
 *   railway login
 *   railway link                   (inside this project directory)
 *   npm run test:e2e:install        (installs Playwright browser)
 *   cp .env.deploy.example .env.deploy && fill in the URLs
 */

import "dotenv/config";
import { execSync, spawnSync } from "child_process";
import { createInterface } from "readline";
import { platform } from "os";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const log = (msg: string) => process.stdout.write(msg + "\n");
const step = (n: number, total: number, msg: string) =>
  log(`\n${c.bold}${c.cyan}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`);
const ok = (msg: string) => log(`  ${c.green}✓${c.reset}  ${msg}`);
const fail = (msg: string) => log(`  ${c.red}✗${c.reset}  ${c.bold}${msg}${c.reset}`);
const info = (msg: string) => log(`  ${c.dim}→${c.reset}  ${msg}`);

function box(msg: string, color: string) {
  const line = "═".repeat(msg.length + 4);
  log(`${color}╔${line}╗${c.reset}`);
  log(`${color}║  ${c.bold}${msg}${c.reset}${color}  ║${c.reset}`);
  log(`${color}╚${line}╝${c.reset}`);
}

// ─── Shell helpers ─────────────────────────────────────────────────────────────

/**
 * Run a command, inherit stdout/stderr (user sees output), throw on failure.
 */
function run(cmd: string): void {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`Command exited with code ${result.status ?? "unknown"}: ${cmd}`);
  }
}

/**
 * Run a command silently, return stdout, throw on failure.
 */
function capture(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    }).trim();
  } catch (err) {
    const e = err as { message?: string };
    throw new Error(`Command failed: ${cmd}\n${e.message ?? ""}`);
  }
}

function openBrowser(url: string): void {
  const os = platform();
  const cmd =
    os === "darwin" ? `open "${url}"` :
    os === "win32"  ? `start "" "${url}"` :
                     `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    log(`  ${c.yellow}Could not open browser automatically. Visit:${c.reset} ${c.cyan}${url}${c.reset}`);
  }
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Deployment helpers ────────────────────────────────────────────────────────

async function waitForHealthy(
  url: string,
  maxAttempts = 36,
  delayMs = 5000
): Promise<void> {
  info(`Polling ${c.cyan}${url}/api/health${c.reset} (up to ${Math.round((maxAttempts * delayMs) / 60000)} min)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const statusCode = capture(
        `curl -sf -o /dev/null -w "%{http_code}" "${url}/api/health"`
      );
      if (statusCode === "200") {
        ok(`Service healthy after ${attempt} poll${attempt === 1 ? "" : "s"}`);
        return;
      }
    } catch {
      // Not up yet
    }

    if (attempt < maxAttempts) {
      process.stdout.write(
        `  ${c.dim}  attempt ${attempt}/${maxAttempts} — waiting ${delayMs / 1000}s...${c.reset}\r`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(
    `Service at ${url} did not become healthy after ${maxAttempts} attempts.\n` +
    `  Check Railway logs: railway logs --environment <env>`
  );
}

function deployToEnvironment(env: string): void {
  info(`Running: railway up --environment ${env} --detach`);
  run(`railway up --environment ${env} --detach`);
}

function getRailwayServiceUrl(env: string): string {
  // First check .env.deploy for overrides (reliable, user-configured)
  const envKey = env === "development" ? "RAILWAY_DEV_URL" : "RAILWAY_PROD_URL";
  const override = process.env[envKey];
  if (override) {
    return override.replace(/\/$/, ""); // strip trailing slash
  }

  // Fall back to querying the CLI
  try {
    const output = capture(`railway domain --environment ${env}`);
    // railway domain outputs one domain per line; pick the first https one
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://") || trimmed.endsWith(".railway.app") || trimmed.endsWith(".up.railway.app")) {
        return trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
      }
    }
    throw new Error(`Could not parse domain from output:\n${output}`);
  } catch (err) {
    const e = err as { message?: string };
    throw new Error(
      `Could not determine URL for Railway ${env} environment.\n` +
      `  Set ${envKey} in your .env.deploy file.\n` +
      `  ${e.message ?? ""}`
    );
  }
}

function runSmokeTests(url: string): void {
  info(`Running smoke tests against ${c.cyan}${url}${c.reset}`);
  run(`BASE_URL="${url}" npx playwright test e2e/smoke.spec.ts --reporter=list`);
}

// ─── Pre-flight checks ─────────────────────────────────────────────────────────

function checkPrerequisites(): void {
  const checks: Array<{ label: string; cmd: string; fix: string }> = [
    {
      label: "Railway CLI",
      cmd: "railway --version",
      fix: "npm install -g @railway/cli  then  railway login && railway link",
    },
    {
      label: "Playwright CLI",
      cmd: "npx playwright --version",
      fix: "npm run test:e2e:install",
    },
    {
      label: "curl",
      cmd: "curl --version",
      fix: "Install curl for your OS",
    },
  ];

  let allGood = true;
  for (const { label, cmd, fix } of checks) {
    try {
      capture(cmd);
      ok(label);
    } catch {
      fail(`${label} not found`);
      info(`Fix: ${fix}`);
      allGood = false;
    }
  }

  if (!allGood) {
    throw new Error("Pre-flight checks failed. Fix the issues above and retry.");
  }
}

function loadDeployEnv(): void {
  const deployEnvPath = resolve(process.cwd(), ".env.deploy");
  if (existsSync(deployEnvPath)) {
    const content = readFileSync(deployEnvPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key && rest.length > 0) {
        const value = rest.join("=").replace(/^["']|["']$/g, "");
        process.env[key.trim()] = value.trim();
      }
    }
    ok("Loaded .env.deploy");
  } else {
    info(".env.deploy not found (optional — set RAILWAY_DEV_URL and RAILWAY_PROD_URL here)");
  }
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

async function main() {
  const TOTAL = 10;

  box("CP Build Field Tracker — Promote Pipeline", c.cyan);
  log(`\n  ${c.dim}${new Date().toLocaleString()}${c.reset}`);

  loadDeployEnv();

  // ── [1/10] Pre-flight checks ──────────────────────────────────────────────
  step(1, TOTAL, "Pre-flight checks");
  checkPrerequisites();

  // ── [2/10] Unit tests ─────────────────────────────────────────────────────
  step(2, TOTAL, "Unit tests");
  run("npm run test");
  ok("All unit tests passed");

  // ── [3/10] Production build ───────────────────────────────────────────────
  step(3, TOTAL, "Production build");
  run("npm run build");
  ok("Build successful");

  // ── [4/10] Deploy → development ───────────────────────────────────────────
  step(4, TOTAL, "Deploying to development environment");
  deployToEnvironment("development");
  ok("Deployment to development initiated");

  // ── [5/10] Wait for dev to be healthy ─────────────────────────────────────
  step(5, TOTAL, "Waiting for development to be healthy");
  const devUrl = getRailwayServiceUrl("development");
  info(`Development URL: ${c.cyan}${devUrl}${c.reset}`);
  await waitForHealthy(devUrl);

  // ── [6/10] Smoke tests on dev ─────────────────────────────────────────────
  step(6, TOTAL, "Opening browser and running smoke tests on development");
  openBrowser(devUrl);
  try {
    runSmokeTests(devUrl);
    ok("All smoke tests passed on development");
  } catch {
    fail("Smoke tests FAILED on development");
    const cont = await prompt(
      `\n  ${c.yellow}Smoke tests failed. Continue to prod anyway? [y/N]${c.reset} `
    );
    if (cont.toLowerCase() !== "y") {
      log(`\n${c.yellow}Promotion aborted. Development is still deployed at:${c.reset} ${c.cyan}${devUrl}${c.reset}\n`);
      process.exit(1);
    }
    log(`  ${c.yellow}Continuing despite smoke test failure (you chose to proceed).${c.reset}`);
  }

  // ── [7/10] Manual verification gate ──────────────────────────────────────
  step(7, TOTAL, "Manual verification gate");
  log(`\n  ${c.bold}Dev environment is live and tested:${c.reset}`);
  log(`  ${c.cyan}${devUrl}${c.reset}\n`);
  log(`  Please review the app in your browser, then answer below.`);

  const go = await prompt(
    `\n  ${c.bold}${c.white}Deploy to PRODUCTION?${c.reset} [y/N]  `
  );

  if (go.toLowerCase() !== "y" && go.toLowerCase() !== "yes") {
    log(
      `\n${c.yellow}Production deploy cancelled. Dev remains live at:${c.reset} ${c.cyan}${devUrl}${c.reset}\n`
    );
    process.exit(0);
  }

  // ── [8/10] Deploy → production ────────────────────────────────────────────
  step(8, TOTAL, "Deploying to PRODUCTION environment");
  deployToEnvironment("production");
  ok("Deployment to production initiated");

  // ── [9/10] Wait for prod to be healthy ────────────────────────────────────
  step(9, TOTAL, "Waiting for production to be healthy");
  const prodUrl = getRailwayServiceUrl("production");
  info(`Production URL: ${c.cyan}${prodUrl}${c.reset}`);
  await waitForHealthy(prodUrl);

  // ── [10/10] Smoke tests on prod ───────────────────────────────────────────
  step(10, TOTAL, "Opening browser and running smoke tests on production");
  openBrowser(prodUrl);
  try {
    runSmokeTests(prodUrl);
    ok("All smoke tests passed on production");
  } catch {
    fail("Smoke tests FAILED on production — INVESTIGATE IMMEDIATELY");
    log(`  Production URL: ${c.cyan}${prodUrl}${c.reset}`);
    log(`  Railway logs:   ${c.dim}railway logs --environment production${c.reset}`);
    process.exit(1);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  log("");
  box("✓  Successfully promoted to production!", c.green);
  log(`\n  ${c.bold}Production:${c.reset}   ${c.cyan}${prodUrl}${c.reset}`);
  log(`  ${c.bold}Development:${c.reset}  ${c.cyan}${devUrl}${c.reset}\n`);
}

main().catch((err: unknown) => {
  const e = err as { message?: string };
  log(`\n${c.red}${c.bold}PIPELINE FAILED:${c.reset} ${e.message ?? String(err)}\n`);
  process.exit(1);
});
