/**
 * Bootstrap Issue Catalog
 *
 * Ensures default issue types and responsible parties exist.
 * Idempotent — safe on every container start; never overwrites display names.
 *
 * Usage: npm run bootstrap:issue-catalog
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ISSUE_TYPE_CATALOG_DEFINITIONS,
  RESPONSIBLE_PARTY_CATALOG_DEFINITIONS,
} from "../lib/issues/issue-catalog-definitions.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const issueResult = await prisma.issueTypeCatalog.createMany({
      data: ISSUE_TYPE_CATALOG_DEFINITIONS.map((row) => ({
        code: row.code,
        displayName: row.displayName,
        sortOrder: row.sortOrder,
        requiresVisual: row.requiresVisual,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    const partyResult = await prisma.responsiblePartyCatalog.createMany({
      data: RESPONSIBLE_PARTY_CATALOG_DEFINITIONS.map((row) => ({
        code: row.code,
        displayName: row.displayName,
        sortOrder: row.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    console.log(
      `[bootstrap-issue-catalog] Done — issue types: ${issueResult.count} created; parties: ${partyResult.count} created.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[bootstrap-issue-catalog] FATAL:", err);
  process.exit(1);
});
