#!/usr/bin/env tsx
/**
 * Lightweight dev setup — NO DOCKER.
 *
 * For MacBook Air / underpowered machines. Uses cloud Postgres + Resend instead
 * of local Docker (PostgreSQL + Mailpit).
 *
 * Run with:  npm run dev:setup:cloud
 *
 * Prerequisites:
 *   1. DATABASE_URL set to a cloud Postgres (Supabase, Neon, etc.)
 *   2. RESEND_API_KEY set (or SMTP_HOST unset — emails will fail until configured)
 *   3. AUTH_SECRET, NEXTAUTH_URL, BOOTSTRAP_* in .env
 *
 * What it does:
 *   1. Runs Prisma migrations against DATABASE_URL
 *   2. Bootstraps admin user (skips if exists)
 *   3. Prints summary
 */

import "dotenv/config";
import { spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

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

function run(cmd: string, extraEnv?: Record<string, string>): void {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, CHECKPOINT_DISABLE: "1", ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status ?? "?"}): ${cmd}`);
  }
}

async function main() {
  log(`\n${c.bold}${c.cyan}▶ CP Build Field Tracker — Lightweight Dev Setup (no Docker)${c.reset}\n`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("localhost")) {
    fail("DATABASE_URL must point to a cloud Postgres (Supabase, Neon, etc.).");
    fail("See docs/DEV_SETUP_LIGHTWEIGHT.md for setup.");
    process.exit(1);
  }

  // Mask password in logs
  const dbDisplay = dbUrl.replace(/:[^:@]+@/, ":****@").slice(0, 60) + "...";
  ok(`Using cloud database: ${dbDisplay}`);

  // 1. Migrations
  log(`\n${c.bold}[1/2] Database migrations${c.reset}`);
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const hasMigrations =
    existsSync(migrationsDir) &&
    readdirSync(migrationsDir).some((f) => f !== "migration_lock.toml");

  // Migrations must run via the direct connection (bypasses PgBouncer transaction pooler).
  // If DIRECT_URL is set, override DATABASE_URL for the migrate command so Prisma uses
  // the direct URL for the connection rather than the pooler URL.
  const directUrl = process.env.DIRECT_URL;
  const migrateEnv: Record<string, string> | undefined = directUrl
    ? { DATABASE_URL: directUrl }
    : undefined;

  if (hasMigrations) {
    info("Running: npm run db:deploy");
    if (directUrl) info("Using DIRECT_URL for migration connection (bypassing pooler)");
    run("npm run db:deploy", migrateEnv);
    ok("Migrations applied");
  } else {
    info("No migrations found — creating initial migration...");
    run("npm run db:migrate -- --name init", migrateEnv);
    ok("Initial migration created and applied");
  }

  // 2. Bootstrap admin
  log(`\n${c.bold}[2/2] Admin user${c.reset}`);
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    warn("BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD not set — skipping.");
    warn("Set them in .env and run: npm run bootstrap:admin");
  } else {
    run("npm run bootstrap:admin");
  }

  // Summary
  log(`\n${c.bold}${c.green}✓ Lightweight setup complete!${c.reset}\n`);
  log(`  ${c.bold}App:${c.reset}  npm run dev  →  ${c.cyan}http://localhost:3002${c.reset}`);
  log(`  ${c.bold}Email:${c.reset} Using Resend (no Mailpit). Add RESEND_API_KEY if not set.`);
  if (adminEmail) {
    log(`\n  ${c.bold}Admin login:${c.reset} ${adminEmail}`);
  }
  log(`\n  ${c.dim}Next: npm run dev${c.reset}\n`);
}

main().catch((err: unknown) => {
  const e = err as { message?: string };
  fail(e.message ?? String(err));
  process.exit(1);
});
