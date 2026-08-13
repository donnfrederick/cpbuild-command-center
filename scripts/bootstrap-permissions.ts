/**
 * Bootstrap Permissions Script
 *
 * Upserts every permission defined in lib/permissions.ts into the `permissions`
 * table. Safe to re-run on every container start — never deletes rows.
 *
 * Usage: npm run bootstrap:permissions
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSION_METADATA } from "../lib/permission-metadata.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    let upserted = 0;
    for (const meta of PERMISSION_METADATA) {
      await prisma.permission.upsert({
        where: { code: meta.code },
        create: {
          code: meta.code,
          name: meta.label,
          description: meta.description,
        },
        update: {
          name: meta.label,
          description: meta.description,
        },
      });
      upserted += 1;
    }
    console.log(`[bootstrap-permissions] Done — ${upserted} permission(s) upserted.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[bootstrap-permissions] Fatal:", err);
  process.exit(1);
});
