/**
 * Bootstrap User Script
 *
 * Creates a user with the given email, name, password, and role.
 * Safe to run multiple times — will not overwrite an existing user.
 *
 * Usage:
 *   BOOTSTRAP_USER_EMAIL=user@example.com \
 *   BOOTSTRAP_USER_NAME="Full Name" \
 *   BOOTSTRAP_USER_PASSWORD="secure-password" \
 *   BOOTSTRAP_USER_ROLE=ADMIN \
 *   DATABASE_URL="postgresql://..." \
 *   npm run bootstrap:user
 *
 * Run once per environment (local, dev, prod) with the appropriate DATABASE_URL.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

async function main() {
  const email = process.env.BOOTSTRAP_USER_EMAIL;
  // BOOTSTRAP_USER_NAME is optional; defaults to the email prefix when omitted.
  const name = process.env.BOOTSTRAP_USER_NAME;
  const password = process.env.BOOTSTRAP_USER_PASSWORD;
  const roleCode = process.env.BOOTSTRAP_USER_ROLE;

  if (!email || !password || !roleCode) {
    throw new Error(
      "BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, and BOOTSTRAP_USER_ROLE must be set."
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set.");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (existing) {
      console.log(
        `User already exists: ${email} (role: ${existing.role.code}). No changes made.`
      );
      return;
    }

    const role = await prisma.role.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new Error(
        `Role "${roleCode}" not found in the database. Run migrations first.`
      );
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        name: name ?? email.split("@")[0],
        passwordHash,
        roleId: role.id,
      },
      include: { role: true },
    });

    console.log(
      `User created: ${user.email} (${user.name}, role: ${user.role.code})`
    );
    console.log("You can now log in with this email and password.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
