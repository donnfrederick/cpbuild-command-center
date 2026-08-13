/**
 * Bootstrap Roles Script
 *
 * Ensures every role defined in lib/permissions.ts ROLE_PERMISSIONS exists as
 * a row in the `roles` table. Uses createMany with skipDuplicates so it is
 * fully atomic and safe to re-run even under concurrent container starts.
 *
 * WHY THIS EXISTS:
 * The `roles` table is migration-managed for schema changes, but role *rows*
 * are reference data that must stay in sync with the ROLE_PERMISSIONS map in
 * code. Without this script, adding a RoleCode to lib/permissions.ts silently
 * creates a code-only role that can never be assigned — the DB row is missing.
 *
 * This script closes that gap permanently: deploying is the sync mechanism.
 *
 * KEEP IN SYNC WITH lib/permissions.ts RoleCode / ROLE_PERMISSIONS.
 * When adding a new RoleCode there, add the matching entry here in the same PR.
 *
 * Usage:
 *   npm run bootstrap:roles
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLE_PERMISSIONS, type RoleCode } from "../lib/permissions.js";

/**
 * Canonical role definitions — must match lib/permissions.ts ROLE_PERMISSIONS keys.
 * Typed with `satisfies` so a typo or missing RoleCode fails at build time.
 * Descriptions are shown in the admin UI role selector.
 */
const ROLE_DEFINITIONS = [
  { code: "ADMIN",               name: "Admin",               description: "Full access to all features" },
  { code: "TEAM_LEAD",           name: "Team Lead",           description: "Team management and project oversight" },
  { code: "DESIGNER",            name: "Designer",            description: "Design system and UI" },
  { code: "MEMBER",              name: "Member",              description: "Base access" },
  { code: "PRODUCT",             name: "Product",             description: "Product management" },
  { code: "DEVELOPER",           name: "Developer",           description: "Engineering and devtools access" },
  { code: "EXECUTIVE",           name: "Executive",           description: "Executive read-only access" },
  { code: "CONTROLS_MANAGER",    name: "Controls Manager",    description: "Field Tracker and project creation" },
  { code: "INSTALL_MANAGER",     name: "Install Manager",     description: "Unit status and project management" },
  { code: "INSTALL_DIRECTOR",    name: "Install Director",    description: "Field leadership — operational parity with Admin (forms, inspections, issues); not platform admin" },
  { code: "PROJECT_MANAGER",     name: "Project Manager",     description: "Project oversight and creation" },
  { code: "PROJECT_COORDINATOR", name: "Project Coordinator", description: "Project read-only access" },
  { code: "BI_ANALYST",          name: "BI Analyst",          description: "Read-only access for internal BI reporting" },
] satisfies Array<{ code: RoleCode; name: string; description: string }>;

// Runtime guard: fail fast if a RoleCode was added to lib/permissions.ts but
// not to ROLE_DEFINITIONS, which would leave the DB row missing on deploy.
const definedCodes = new Set(ROLE_DEFINITIONS.map((r) => r.code));
const missingCodes = (Object.keys(ROLE_PERMISSIONS) as RoleCode[]).filter((c) => !definedCodes.has(c));
if (missingCodes.length > 0) {
  console.error(`[bootstrap-roles] FATAL: ROLE_DEFINITIONS is missing codes: ${missingCodes.join(", ")}. Add them before deploying.`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.role.createMany({
      data: ROLE_DEFINITIONS,
      skipDuplicates: true,
    });

    const created = result.count;
    const skipped = ROLE_DEFINITIONS.length - created;
    console.log(`[bootstrap-roles] Done — ${created} created, ${skipped} already existed.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[bootstrap-roles] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
