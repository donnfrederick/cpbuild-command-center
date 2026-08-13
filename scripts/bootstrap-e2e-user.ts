#!/usr/bin/env tsx
/**
 * Bootstrap E2E Test User
 *
 * Creates an ADMIN user for E2E tests. Safe to run multiple times.
 *
 * Usage:
 *   E2E_TEST_EMAIL=e2e-test@yourdomain.com \
 *   E2E_TEST_PASSWORD="YourSecureE2EPassword!" \
 *   DATABASE_URL="<connection-string>" \
 *   npm run bootstrap:e2e-user
 *
 * Run once per environment (dev, prod).
 */

import "dotenv/config";
import { spawnSync } from "child_process";

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

if (!email) {
  console.error("Error: E2E_TEST_EMAIL must be set.");
  process.exit(1);
}
if (!password) {
  console.error("Error: E2E_TEST_PASSWORD must be set.");
  process.exit(1);
}

const result = spawnSync(
  "tsx",
  ["scripts/bootstrap-admin.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: password,
    },
  }
);

process.exit(result.status ?? 1);
