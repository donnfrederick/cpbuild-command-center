/**
 * Bootstrap Role Permissions Script
 *
 * For each built-in role in ROLE_PERMISSIONS, inserts missing role_permissions
 * rows. Never deletes existing rows — admin edits via Role Manager are preserved.
 *
 * Run after bootstrap:roles and bootstrap:permissions.
 *
 * Usage: npm run bootstrap:role-permissions
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLE_PERMISSIONS, type RoleCode } from "../lib/permissions.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    let inserted = 0;
    let skipped = 0;

    for (const roleCode of Object.keys(ROLE_PERMISSIONS) as RoleCode[]) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) {
        console.warn(`[bootstrap-role-permissions] Role ${roleCode} not in DB — run bootstrap:roles first.`);
        continue;
      }

      const permCodes = ROLE_PERMISSIONS[roleCode];
      for (const permCode of permCodes) {
        const permission = await prisma.permission.findUnique({ where: { code: permCode } });
        if (!permission) {
          console.warn(`[bootstrap-role-permissions] Permission ${permCode} missing — run bootstrap:permissions first.`);
          skipped += 1;
          continue;
        }

        const result = await prisma.rolePermission.createMany({
          data: [{ roleId: role.id, permissionId: permission.id }],
          skipDuplicates: true,
        });
        inserted += result.count;
      }
    }

    console.log(
      `[bootstrap-role-permissions] Done — ${inserted} row(s) inserted, ${skipped} skipped (missing permission rows).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[bootstrap-role-permissions] Fatal:", err);
  process.exit(1);
});
