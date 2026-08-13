/**
 * Bootstrap Inspection Types
 *
 * Ensures CLEAR_INSPECTION and CALIBRATION_INSPECTION rows exist in
 * inspection_types. Idempotent — safe on every container start.
 *
 * Usage:
 *   npm run bootstrap:inspection-types
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { INSPECTION_TYPE_DEFINITIONS } from "../lib/inspections/inspection-type-codes.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.inspectionType.createMany({
      data: [...INSPECTION_TYPE_DEFINITIONS],
      skipDuplicates: true,
    });

    const created = result.count;
    const skipped = INSPECTION_TYPE_DEFINITIONS.length - created;
    console.log(`[bootstrap-inspection-types] Done — ${created} created, ${skipped} already existed.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[bootstrap-inspection-types] FATAL:", err);
  process.exit(1);
});
