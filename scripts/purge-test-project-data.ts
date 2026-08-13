#!/usr/bin/env -S npx tsx
/**
 * Purge all field data (clear inspections, submissions, issues, observations,
 * activity logs, test seed batches) from test projects.
 *
 * Safety: only runs against projects where isTestProject = true.
 *
 * Usage:
 *   DATABASE_URL=<prod-url> npx tsx scripts/purge-test-project-data.ts --dry-run --all
 *   DATABASE_URL=<prod-url> npx tsx scripts/purge-test-project-data.ts --execute --all
 *   DATABASE_URL=<prod-url> npx tsx scripts/purge-test-project-data.ts --execute --project-id <id>
 *
 * Options:
 *   --dry-run          Print counts only (default if --execute omitted)
 *   --execute          Perform deletes
 *   --all              All isTestProject rows (includes soft-deleted projects when set)
 *   --project-id <id>  Single project
 *   --soft-delete      After purge, set deletedAt on projects that are still active
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reconcileProjectInspectionStatuses } from "@/lib/inspections/reconcile-scope-inspection-status";

function parseArgs(argv: string[]): {
  execute: boolean;
  all: boolean;
  projectId?: string;
  softDelete: boolean;
} {
  const execute = argv.includes("--execute");
  const all = argv.includes("--all");
  const softDelete = argv.includes("--soft-delete");
  const projectIdIdx = argv.indexOf("--project-id");
  const projectId =
    projectIdIdx >= 0 && argv[projectIdIdx + 1] ? argv[projectIdIdx + 1] : undefined;
  return { execute, all, projectId, softDelete };
}

/** Prisma filter for test projects targeted by this script (--all or --project-id). */
export function testProjectSelectionWhere(opts: {
  all: boolean;
  projectId?: string;
}): { isTestProject: true; id?: string; deletedAt?: null } {
  return {
    isTestProject: true,
    ...(opts.projectId ? { id: opts.projectId } : {}),
    // --all and explicit --project-id may target soft-deleted shells; isTestProject guard remains.
    ...(opts.all || opts.projectId ? {} : { deletedAt: null }),
  };
}

export interface PurgeCounts {
  clearInspections: number;
  inspectionSubmissions: number;
  projectIssues: number;
  projectObservations: number;
  activityLogs: number;
  testSeedBatches: number;
  scopeRows: number;
}

export async function countTestProjectData(
  db: PrismaClient,
  projectId: string
): Promise<PurgeCounts> {
  const rowIds = (
    await db.projectRow.findMany({ where: { projectId }, select: { id: true } })
  ).map((r) => r.id);

  const [
    clearInspections,
    inspectionSubmissions,
    projectIssues,
    projectObservations,
    activityLogs,
    testSeedBatches,
  ] = await Promise.all([
    db.clearInspection.count({ where: { row: { projectId } } }),
    db.inspectionSubmission.count({ where: { projectId } }),
    db.projectIssue.count({ where: { projectId } }),
    db.projectObservation.count({ where: { projectId } }),
    db.activityLog.count({ where: { projectId } }),
    db.testSeedBatch.count({ where: { projectId } }),
  ]);

  return {
    clearInspections,
    inspectionSubmissions,
    projectIssues,
    projectObservations,
    activityLogs,
    testSeedBatches,
    scopeRows: rowIds.length,
  };
}

/** Hard-delete all field / seed data for one test project. Does not delete the project row or scope rows. */
export async function purgeTestProjectData(
  db: PrismaClient,
  projectId: string
): Promise<PurgeCounts> {
  const before = await countTestProjectData(db, projectId);

  await db.$transaction([
    db.clearInspection.deleteMany({ where: { row: { projectId } } }),
    db.inspectionSubmission.deleteMany({ where: { projectId } }),
    db.projectIssue.deleteMany({ where: { projectId } }),
    db.projectObservation.deleteMany({ where: { projectId } }),
    db.activityLog.deleteMany({ where: { projectId } }),
    db.testSeedBatch.deleteMany({ where: { projectId } }),
  ]);

  await reconcileProjectInspectionStatuses(projectId, db);

  return before;
}

async function main(): Promise<void> {
  const { execute, all, projectId, softDelete } = parseArgs(process.argv.slice(2));

  if (!all && !projectId) {
    console.error(
      "Usage: npx tsx scripts/purge-test-project-data.ts [--dry-run|--execute] (--all | --project-id <id>) [--soft-delete]"
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    const projects = await db.project.findMany({
      where: testProjectSelectionWhere({ all, projectId }),
      select: {
        id: true,
        unifierPid: true,
        sourceUnifierPid: true,
        deletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (projects.length === 0) {
      console.error("No matching test projects found.");
      process.exit(1);
    }

    for (const p of projects) {
      if (!p.unifierPid?.includes("__TEST") && !projectId) {
        console.warn(`Skipping ${p.id} — isTestProject but unexpected unifierPid`);
        continue;
      }

      const counts = await countTestProjectData(db, p.id);
      console.log(
        `\n${execute ? "EXECUTING" : "DRY-RUN"} — project ${p.id}` +
          ` (sourcePid=${p.sourceUnifierPid ?? "n/a"}, deleted=${p.deletedAt != null})`
      );
      console.log(JSON.stringify(counts, null, 2));

      if (execute) {
        const removed = await purgeTestProjectData(db, p.id);
        console.log("Purged:", removed);

        if (softDelete && p.deletedAt == null) {
          await db.project.update({
            where: { id: p.id },
            data: { deletedAt: new Date() },
          });
          console.log("Soft-deleted project shell.");
        }
      }
    }

    if (!execute) {
      console.log("\nRe-run with --execute to apply deletes.");
    }
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.includes("purge-test-project-data")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
