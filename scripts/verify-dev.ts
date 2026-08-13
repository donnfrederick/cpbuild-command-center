#!/usr/bin/env tsx
/**
 * Verify Development Environment
 *
 * Usage: npm run verify:dev
 *
 * Runs the full verification suite against the deployed dev environment:
 *   1. Unit + integration tests (local)
 *   2. Smoke E2E tests against RAILWAY_DEV_URL
 *   3. Optional: full E2E suite (set RUN_FULL_E2E=1)
 *
 * Prerequisites:
 *   - .env.deploy with RAILWAY_DEV_URL set
 *   - Dev environment deployed and healthy
 */

import "dotenv/config";
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
};

const log = (msg: string) => process.stdout.write(msg + "\n");
const step = (n: number, total: number, msg: string) =>
  log(`\n${c.bold}${c.cyan}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`);
const ok = (msg: string) => log(`  ${c.green}✓${c.reset}  ${msg}`);
const fail = (msg: string) => log(`  ${c.red}✗${c.reset} ${c.bold}${msg}${c.reset}`);

function run(cmd: string, extraEnv?: Record<string, string>): void {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd}`);
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
    throw new Error(
      ".env.deploy not found. Copy .env.deploy.example and set RAILWAY_DEV_URL."
    );
  }
}

function getDevUrl(): string {
  const url = process.env.RAILWAY_DEV_URL;
  if (!url) {
    throw new Error("RAILWAY_DEV_URL not set in .env.deploy");
  }
  return url.replace(/\/$/, "");
}

async function main() {
  const runFullE2E = process.env.RUN_FULL_E2E === "1";
  const hasE2ECreds = process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD;
  const total = runFullE2E ? (hasE2ECreds ? 5 : 4) : (hasE2ECreds ? 4 : 3);

  log(`\n${c.bold}Verify Development Environment${c.reset}`);
  log(`${c.dim}${new Date().toLocaleString()}${c.reset}`);

  loadDeployEnv();
  const devUrl = getDevUrl();
  log(`  ${c.dim}Target: ${devUrl}${c.reset}`);

  step(1, total, "Unit + integration tests");
  run("npm run test");
  ok("All tests passed");

  step(2, total, "Smoke E2E tests against dev");
  run("npx playwright test e2e/smoke.spec.ts --reporter=list", { BASE_URL: devUrl });
  ok("Smoke tests passed");

  if (hasE2ECreds) {
    step(3, total, "Authenticated E2E tests against dev");
    run("npx playwright test e2e/authenticated.spec.ts --reporter=list", {
      BASE_URL: devUrl,
      E2E_TEST_EMAIL: process.env.E2E_TEST_EMAIL!,
      E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD!,
    });
    ok("Authenticated E2E passed");
  } else {
    log(`  ${c.dim}Skipping authenticated E2E (set E2E_TEST_EMAIL, E2E_TEST_PASSWORD in .env.deploy)${c.reset}`);
  }

  if (runFullE2E) {
    step(hasE2ECreds ? 4 : 3, total, "Full E2E suite against dev");
    run("npx playwright test --reporter=list", { BASE_URL: devUrl });
    ok("Full E2E passed");
  }

  step(total, total, "Verification complete");
  ok(`Dev environment verified: ${devUrl}`);
  log("");
}

main().catch((err: unknown) => {
  const e = err as { message?: string };
  log(`\n${c.red}${c.bold}VERIFICATION FAILED:${c.reset} ${e.message ?? String(err)}\n`);
  process.exit(1);
});
