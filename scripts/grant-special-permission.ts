/**
 * One-off helper: grant a special permission to a user by email.
 * Usage:
 *   GRANT_USER_EMAIL=user@example.com GRANT_PERMISSION=forms:manage npm run grant:special-permission
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NON_GRANTABLE_SPECIAL_PERMISSIONS, PERMISSIONS, type Permission } from "../lib/permissions";

const KNOWN_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS));

async function main() {
  const email = process.env.GRANT_USER_EMAIL?.trim();
  const permission = process.env.GRANT_PERMISSION?.trim();
  const note = process.env.GRANT_NOTE ?? "Granted via grant-special-permission script";

  if (!email || !permission) {
    throw new Error("GRANT_USER_EMAIL and GRANT_PERMISSION must be set.");
  }

  if (!KNOWN_PERMISSIONS.has(permission)) {
    throw new Error(`Unknown permission: ${permission}`);
  }

  if (NON_GRANTABLE_SPECIAL_PERMISSIONS.includes(permission as Permission)) {
    throw new Error(`Permission cannot be granted via special permissions: ${permission}`);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    const admin = await prisma.user.findFirst({
      where: { role: { code: "ADMIN" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true },
    });
    if (!admin) {
      throw new Error("No admin user found for grantedById");
    }

    const grant = await prisma.userSpecialPermission.upsert({
      where: { userId_permission: { userId: user.id, permission } },
      create: {
        userId: user.id,
        permission,
        note,
        grantedById: admin.id,
      },
      update: {
        note,
        grantedById: admin.id,
        grantedAt: new Date(),
      },
      select: { id: true, permission: true, note: true, grantedAt: true },
    });

    console.log(`Granted ${permission} to ${user.name ?? user.email}`);
    console.log(JSON.stringify({ user, grant, grantedBy: admin.email }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
