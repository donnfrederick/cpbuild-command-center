/**
 * Bootstrap Observation Catalog
 *
 * Ensures default observation types exist.
 * Idempotent — safe on every container start.
 *
 * Usage: npm run bootstrap:observation-catalog
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { OBSERVATION_TYPE_CATALOG_DEFINITIONS } from "../lib/observations/observation-catalog-definitions.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.observationTypeCatalog.createMany({
      data: OBSERVATION_TYPE_CATALOG_DEFINITIONS.map((row) => ({
        code: row.code,
        displayName: row.displayName,
        sortOrder: row.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    console.log(`[bootstrap-observation-catalog] Done — ${result.count} observation types created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[bootstrap-observation-catalog] FATAL:", err);
  process.exit(1);
});
