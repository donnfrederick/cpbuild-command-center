#!/usr/bin/env tsx
/**
 * Unifier credentials check — secure status without exposing the password.
 *
 * Run: npm run unifier:check
 *
 * Shows where the password is set (env vs Key Vault) and a masked hint.
 * Never prints the full password.
 */

import "dotenv/config";
import { existsSync } from "fs";
import { join } from "path";

const c = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m" };

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}

function main() {
  const root = join(process.cwd());
  const envPath = join(root, ".env");
  const hasEnvFile = existsSync(envPath);

  console.log(`\n${c.dim}Unifier credentials check${c.reset}\n`);

  const baseUrl = process.env.UNIFIER_BASE_URL;
  const username = process.env.UNIFIER_USERNAME ?? "Coadmin";
  const password = process.env.UNIFIER_PASSWORD;
  const keyVaultUrl = process.env.AZURE_KEYVAULT_URL;
  const mockMode = process.env.UNIFIER_MOCK === "true";

  // Base URL
  if (baseUrl) {
    console.log(`  ${c.green}✓${c.reset} UNIFIER_BASE_URL: ${baseUrl}`);
  } else {
    console.log(`  ${c.red}✗${c.reset} UNIFIER_BASE_URL: not set`);
  }

  // Username
  console.log(`  ${c.dim}→${c.reset} UNIFIER_USERNAME: ${username}`);

  // Password source
  if (keyVaultUrl) {
    console.log(`  ${c.green}✓${c.reset} Password source: Azure Key Vault (${keyVaultUrl})`);
    console.log(`  ${c.dim}  Secret name: unifier-password${c.reset}`);
  } else if (password && password.length > 0 && !password.toLowerCase().includes("replace")) {
    console.log(`  ${c.green}✓${c.reset} UNIFIER_PASSWORD: set (${password.length} chars)`);
    console.log(`  ${c.dim}  Masked: ${mask(password)}${c.reset}`);
  } else {
    console.log(`  ${c.red}✗${c.reset} UNIFIER_PASSWORD: not set or still placeholder`);
    if (hasEnvFile) {
      console.log(`  ${c.yellow}  Add to .env: UNIFIER_PASSWORD="your-integration-password"${c.reset}`);
    } else {
      console.log(`  ${c.yellow}  Copy .env.example to .env, then set UNIFIER_PASSWORD${c.reset}`);
    }
  }

  if (mockMode) {
    console.log(`\n  ${c.green}✓${c.reset} UNIFIER_MOCK=true — using mock data (no API credentials needed)`);
  }

  console.log(`\n  ${c.dim}To test connection: npm run dev → DevTools → Debugger tab${c.reset}`);
  console.log(`  ${c.dim}Or: curl http://localhost:3002/api/devtools/unifier-test (when dev server running)${c.reset}\n`);
}

main();
