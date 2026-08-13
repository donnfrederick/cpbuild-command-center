/**
 * Clean up empty project_rows that were imported from spreadsheets with trailing empty rows.
 *
 * A row is considered "empty" if building, level, and unit are all empty (no meaningful identifiers).
 * These typically come from Excel sheets that have thousands of blank rows after the data.
 *
 * Usage:
 *   npx tsx scripts/cleanup-empty-project-rows.ts
 *
 * Add --dry-run to preview without deleting.
 * Add --execute to actually delete (default is dry-run for safety).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  // Find empty rows: building, level, unit all empty
  const emptyRows = await db.projectRow.findMany({
    where: {
      building: "",
      level: "",
      unit: "",
    },
    select: { id: true, projectId: true, rowIndex: true },
    orderBy: [{ projectId: "asc" }, { rowIndex: "asc" }],
  });

  const count = emptyRows.length;
  if (count === 0) {
    console.log("No empty project rows found. Nothing to clean up.");
    return;
  }

  const byProject = emptyRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.projectId] = (acc[r.projectId] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Found ${count} empty project row(s) to remove:`);
  for (const [projectId, n] of Object.entries(byProject)) {
    const label = `project ${projectId.slice(0, 8)}…`;
    console.log(`  - ${label}: ${n} empty row(s)`);
  }

  if (DRY_RUN) {
    console.log("\nDry run — no rows deleted. Run with --execute to delete.");
    return;
  }

  const ids = emptyRows.map((r) => r.id);
  const { count: deleted } = await db.projectRow.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`\nDeleted ${deleted} empty project row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
