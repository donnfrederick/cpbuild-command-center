/**
 * Bootstrap Admin Script
 *
 * Creates the initial admin user from environment variables.
 * Safe to run multiple times — will not overwrite an existing admin.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD=... npm run bootstrap:admin
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { isPlaceholderCredential } from "./bootstrap-utils.js";

const SALT_ROUNDS = 12;

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password || isPlaceholderCredential(email, password)) {
    if (process.env.NODE_ENV === "production" && email && password) {
      console.error(
        "⚠️  BOOTSTRAP WARNING: Placeholder credentials detected in production. " +
          "Admin user will NOT be created. Set real values for BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD."
      );
    } else {
      console.warn(
        "Bootstrap skipped: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD with real values (not placeholders)."
      );
    }
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (existing) {
      console.log(`Admin user already exists: ${email} (role: ${existing.role.code})`);
      console.log("No changes made.");
      return;
    }

    const adminRole = await prisma.role.findUnique({ where: { code: "ADMIN" } });
    if (!adminRole) {
      console.error("Error: ADMIN role not found. Run migrations first.");
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const admin = await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash,
        roleId: adminRole.id,
      },
      include: { role: true },
    });

    console.log(`Admin user created successfully: ${admin.email} (id: ${admin.id}, role: ${admin.role.code})`);
    console.log("IMPORTANT: Rotate the BOOTSTRAP_ADMIN_PASSWORD after first login.");
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly (not when imported for testing)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
