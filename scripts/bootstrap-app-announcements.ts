/**
 * Bootstrap default in-app announcement campaigns (idempotent).
 *
 * Usage: npm run bootstrap:app-announcements
 *
 * No default campaigns are seeded — admins create announcements per environment.
 * Normalizes legacy audience values to ALL and removes the PR #1850 auto-seeded campaign if present.
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const LEGACY_SAVE_TO_PHOTOS_SLUG = "save-to-photos";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Error: DATABASE_URL must be set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const normalized = await prisma.appAnnouncement.updateMany({
      where: { audience: { not: "ALL" } },
      data: { audience: "ALL" },
    });
    if (normalized.count > 0) {
      console.log(`Normalized announcement audience to ALL (${normalized.count} row(s)).`);
    }

    const removed = await prisma.appAnnouncement.deleteMany({
      where: {
        slug: LEGACY_SAVE_TO_PHOTOS_SLUG,
        ctaHref: "/settings",
        ctaLabelEn: "Open account settings",
      },
    });
    if (removed.count > 0) {
      console.log(
        `Removed legacy auto-seeded announcement "${LEGACY_SAVE_TO_PHOTOS_SLUG}" (${removed.count}).`,
      );
    } else {
      console.log("App announcements bootstrap: no default campaigns configured — skipping.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

export { main as bootstrapAppAnnouncements };
