/**
 * Verification gate for inspection reporting backfill.
 *
 * Asserts zero FORM submissions with formVersionId set where any answer row
 * has formVersionQuestionId IS NULL. Exit 0 when clean; exit 1 when orphans exist.
 *
 * Usage:
 *   npm run verify:inspection-reporting-backfill
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export interface OrphanedAnswerRow {
  submissionId: string;
  formVersionId: string;
  orphanAnswerCount: number;
}

export async function findOrphanedFormAnswers(
  prisma: Pick<PrismaClient, "$queryRawUnsafe">
): Promise<OrphanedAnswerRow[]> {
  return prisma.$queryRawUnsafe<OrphanedAnswerRow[]>(`
    SELECT
      s.id AS "submissionId",
      s."formVersionId" AS "formVersionId",
      COUNT(a.id)::int AS "orphanAnswerCount"
    FROM inspection_submissions s
    INNER JOIN inspection_answers a ON a."inspectionSubmissionId" = s.id
    WHERE s.source = 'FORM'
      AND s."formVersionId" IS NOT NULL
      AND a."formVersionQuestionId" IS NULL
    GROUP BY s.id, s."formVersionId"
    ORDER BY s."submittedAt" ASC
    LIMIT 50
  `);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[verify-inspection-reporting-backfill] DATABASE_URL is not set.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const orphans = await findOrphanedFormAnswers(prisma);

    if (orphans.length === 0) {
      console.log(
        "[verify-inspection-reporting-backfill] OK — no FORM answers missing formVersionQuestionId."
      );
      process.exit(0);
    }

    console.error(
      `[verify-inspection-reporting-backfill] FAIL — ${orphans.length} submission(s) have answers without formVersionQuestionId:`
    );
    for (const row of orphans) {
      console.error(
        `  submission=${row.submissionId} formVersion=${row.formVersionId} orphanAnswers=${row.orphanAnswerCount}`
      );
    }
    console.error(
      "Run: npm run backfill:inspection-reporting (or set RUN_INSPECTION_REPORTING_BACKFILL=1 on Railway deploy)"
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  typeof process !== "undefined"
  && process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error(
      "[verify-inspection-reporting-backfill] Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  });
}
