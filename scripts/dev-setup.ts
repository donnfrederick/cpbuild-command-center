#!/usr/bin/env tsx
/**
 * Local development setup script.
 *
 * Run with:
 *   npm run dev:setup      — first-time setup (starts DB, migrates, bootstraps admin)
 *
 * To wipe Docker volumes and re-run setup: `docker compose down -v` then `npm run dev:setup`
 * (intentionally not an npm script — avoids accidental data loss).
 *
 * What it does:
 *   1. Starts Docker Compose services (PostgreSQL + Mailpit)
 *   2. Waits until PostgreSQL is accepting connections
 *   3. Runs Prisma migrations
 *   4. Bootstraps the admin user (skips if already exists)
 *   5. Prints a summary of all running services
 */

import "dotenv/config";
import { execSync, spawnSync } from "child_process";
import { createConnection } from "net";

// ─── ANSI helpers ──────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const log = (msg: string) => process.stdout.write(msg + "\n");
const ok = (msg: string) => log(`  ${c.green}✓${c.reset}  ${msg}`);
const info = (msg: string) => log(`  ${c.dim}→${c.reset}  ${msg}`);
const warn = (msg: string) => log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const fail = (msg: string) => log(`  ${c.red}✗${c.reset}  ${c.bold}${msg}${c.reset}`);

function run(cmd: string): void {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status ?? "?"}): ${cmd}`);
  }
}

// ─── TCP health check ──────────────────────────────────────────────────────────

function checkTcpPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(
  host: string,
  port: number,
  label: string,
  maxAttempts = 30,
  delayMs = 2000
): Promise<void> {
  info(`Waiting for ${label} on ${host}:${port}...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ready = await checkTcpPort(host, port);
    if (ready) {
      ok(`${label} is ready`);
      return;
    }
    if (attempt < maxAttempts) {
      process.stdout.write(
        `  ${c.dim}  attempt ${attempt}/${maxAttempts}...${c.reset}\r`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `${label} on ${host}:${port} did not become ready after ${maxAttempts} attempts.`
  );
}

// ─── Docker checks ─────────────────────────────────────────────────────────────

function checkDockerRunning(): void {
  try {
    execSync("docker info", { stdio: "pipe" });
  } catch {
    throw new Error(
      "Docker is not running. Please start Docker Desktop and retry."
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${c.bold}${c.cyan}▶ CP Build Field Tracker — Local Dev Setup${c.reset}\n`);

  // 1. Check Docker
  log(`${c.bold}[1/4] Docker${c.reset}`);
  checkDockerRunning();
  ok("Docker is running");

  info("Starting Docker Compose services...");
  run("docker compose up -d");
  ok("Services started (postgres + mailpit)");

  // 2. Wait for PostgreSQL
  log(`\n${c.bold}[2/4] PostgreSQL${c.reset}`);
  const pgPort = Number(process.env.POSTGRES_PORT ?? 5433);
  await waitForPort("localhost", pgPort, "PostgreSQL");

  // Extra wait for Postgres to finish initialization after port opens
  await new Promise((r) => setTimeout(r, 1500));

  // 3. Prisma migrations
  log(`\n${c.bold}[3/4] Database migrations${c.reset}`);

  // Check if any migration files exist yet
  const { readdirSync, existsSync: fsExists } = await import("fs");
  const migrationsDir = new URL("../prisma/migrations", import.meta.url).pathname;
  const hasMigrations =
    fsExists(migrationsDir) &&
    readdirSync(migrationsDir).some((f) => f !== "migration_lock.toml");

  if (hasMigrations) {
    info("Running: npm run db:deploy");
    run("npm run db:deploy");
    ok("Migrations applied");
  } else {
    info("No migrations found — creating initial migration...");
    run("npm run db:migrate -- --name init");
    ok("Initial migration created and applied");
  }

  // 4. Bootstrap admin
  log(`\n${c.bold}[4/4] Admin user${c.reset}`);
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    warn(
      "BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD not set in .env — skipping admin bootstrap."
    );
    warn(
      "Set them in .env and run:  npm run bootstrap:admin"
    );
  } else {
    run("npm run bootstrap:admin");
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  log(`\n${c.bold}${c.green}✓ Local environment is ready!${c.reset}\n`);
  log(`  ${c.bold}App (start with npm run dev):${c.reset}  ${c.cyan}http://localhost:3001${c.reset}`);
  log(`  ${c.bold}Email (Mailpit web UI):${c.reset}        ${c.cyan}http://localhost:${process.env.SMTP_UI_PORT ?? "8025"}${c.reset}`);
  log(`  ${c.bold}Database:${c.reset}                     ${c.cyan}postgresql://postgres:postgres@localhost:${pgPort}/commandcenter${c.reset}`);

  if (adminEmail) {
    log(`\n  ${c.bold}Admin login:${c.reset}`);
    log(`    Email:    ${adminEmail}`);
    log(`    Password: ${process.env.BOOTSTRAP_ADMIN_PASSWORD}`);
  }

  log(`\n  ${c.dim}Next: npm run dev${c.reset}\n`);
}

main().catch((err: unknown) => {
  const e = err as { message?: string };
  fail(e.message ?? String(err));
  process.exit(1);
});
