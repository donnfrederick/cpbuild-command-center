#!/usr/bin/env -S npx tsx
/**
 * Soft-delete orphan clear_inspection rows on real (non-test) projects.
 *
 * Orphans = active rows with no linked form submission (legacy CLEAR_INSPECTION_SET toggles).
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/purge-orphan-clear-inspections.ts --dry-run
 *   DATABASE_URL=<url> npx tsx scripts/purge-orphan-clear-inspections.ts --execute
 *   DATABASE_URL=<url> npx tsx scripts/purge-orphan-clear-inspections.ts --dry-run --verbose
 *
 * Options:
 *   --dry-run   Print counts only (default when --execute omitted)
 *   --execute   Soft-delete orphans and reconcile scope inspectionStatus
 *   --verbose   Print per-project breakdown and sample orphan IDs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reconcileScopeRowInspectionStatus } from "@/lib/inspections/reconcile-scope-inspection-status";

/** Spot-check ID from Tosh's validation example (Jefferson Westchester B1-L4-404). */
export const TOSH_VALIDATION_ORPHAN_ID = "e470d53be79145128f74832c8";

export interface OrphanClearInspectionRow {
  id: string;
  rowId: string;
  status: string;
  projectId: string;
  projectName: string;
  unifierPid: string | null;
}

export function orphanClearInspectionWhere() {
  return {
    deletedAt: null,
    inspectionSubmissionId: null,
    row: {
      project: {
        isTestProject: false,
        deletedAt: null,
      },
    },
  } as const;
}

export async function findOrphanClearInspections(
  db: PrismaClient
): Promise<OrphanClearInspectionRow[]> {
  const rows = await db.clearInspection.findMany({
    where: orphanClearInspectionWhere(),
    select: {
      id: true,
      rowId: true,
      status: true,
      row: {
        select: {
          projectId: true,
          project: {
            select: {
              unifierPid: true,
              sourceUnifierPid: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    rowId: r.rowId,
    status: r.status,
    projectId: r.row.projectId,
    projectName: r.row.project.unifierPid ?? r.row.project.sourceUnifierPid ?? r.row.projectId,
    unifierPid: r.row.project.unifierPid,
  }));
}

export interface ProjectOrphanSummary {
  projectId: string;
  projectName: string;
  unifierPid: string | null;
  count: number;
}

export function summarizeOrphansByProject(
  orphans: OrphanClearInspectionRow[]
): ProjectOrphanSummary[] {
  const byProject = new Map<string, ProjectOrphanSummary>();
  for (const o of orphans) {
    const existing = byProject.get(o.projectId);
    if (existing) {
      existing.count += 1;
    } else {
      byProject.set(o.projectId, {
        projectId: o.projectId,
        projectName: o.projectName,
        unifierPid: o.unifierPid,
        count: 1,
      });
    }
  }
  return [...byProject.values()].sort((a, b) => b.count - a.count);
}

export interface PurgeOrphanResult {
  orphanCount: number;
  softDeleted: number;
  affectedProjects: number;
  reconciledRowsCleared: number;
}

export async function purgeOrphanClearInspections(
  db: PrismaClient,
  execute: boolean
): Promise<PurgeOrphanResult> {
  const orphans = await findOrphanClearInspections(db);
  const affectedRowIds = [...new Set(orphans.map((o) => o.rowId))];
  const affectedProjectIds = [...new Set(orphans.map((o) => o.projectId))];

  if (!execute || orphans.length === 0) {
    return {
      orphanCount: orphans.length,
      softDeleted: 0,
      affectedProjects: affectedProjectIds.length,
      reconciledRowsCleared: 0,
    };
  }

  const now = new Date();
  const softDeleted = await db.clearInspection.updateMany({
    where: orphanClearInspectionWhere(),
    data: { deletedAt: now },
  });

  const reconciledRowsCleared = await reconcileScopeRowInspectionStatus(affectedRowIds, db);

  return {
    orphanCount: orphans.length,
    softDeleted: softDeleted.count,
    affectedProjects: affectedProjectIds.length,
    reconciledRowsCleared,
  };
}

function parseArgs(argv: string[]): { execute: boolean; verbose: boolean } {
  return {
    execute: argv.includes("--execute"),
    verbose: argv.includes("--verbose"),
  };
}

async function main(): Promise<void> {
  const { execute, verbose } = parseArgs(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    const orphans = await findOrphanClearInspections(db);
    const summaries = summarizeOrphansByProject(orphans);

    console.log(`\n${execute ? "EXECUTING" : "DRY-RUN"} — orphan clear_inspections on real projects`);
    console.log(`Total orphans: ${orphans.length}`);
    console.log(`Affected projects: ${summaries.length}`);

    const toshExample = orphans.find((o) => o.id === TOSH_VALIDATION_ORPHAN_ID);
    if (toshExample) {
      console.log(
        `\nTosh validation example (${TOSH_VALIDATION_ORPHAN_ID}) IS in orphan set:` +
          ` ${toshExample.projectName} — row ${toshExample.rowId} status=${toshExample.status}`
      );
    } else if (orphans.length > 0) {
      console.log(
        `\nTosh validation example (${TOSH_VALIDATION_ORPHAN_ID}) not found` +
          " (already cleaned or ID changed)."
      );
    }

    if (verbose && summaries.length > 0) {
      console.log("\nPer-project breakdown (top 20):");
      for (const s of summaries.slice(0, 20)) {
        console.log(
          `  ${s.count.toString().padStart(4)} — ${s.projectName}` +
            ` (pid=${s.unifierPid ?? "n/a"}, id=${s.projectId})`
        );
      }
      console.log("\nSample orphan IDs (first 10):");
      for (const o of orphans.slice(0, 10)) {
        console.log(`  ${o.id} — ${o.projectName} status=${o.status}`);
      }
    }

    if (execute) {
      const result = await purgeOrphanClearInspections(db, true);
      console.log("\nResult:", JSON.stringify(result, null, 2));
    } else {
      console.log("\nRe-run with --execute to soft-delete orphans and reconcile scope rows.");
      console.log("Add --verbose for per-project breakdown.");
    }
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.includes("purge-orphan-clear-inspections")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
