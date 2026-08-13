import type { PrismaClient } from "@prisma/client";

export interface OverwriteBlockCounts {
  submissions: number;
  clearInspections: number;
  rowsWithProgress: number;
  issues: number;
  observations: number;
}

export interface OverwriteBlockStatus {
  blocked: boolean;
  counts: OverwriteBlockCounts;
}

type DbLike = Pick<
  PrismaClient,
  | "inspectionSubmission"
  | "clearInspection"
  | "projectRow"
  | "projectIssue"
  | "projectObservation"
>;

/** Returns whether overwrite mode is blocked due to existing field data on the project. */
export async function getOverwriteBlockStatus(
  db: DbLike,
  projectId: string,
): Promise<OverwriteBlockStatus> {
  const [
    submissions,
    clearInspections,
    rowsWithProgress,
    issues,
    observations,
  ] = await Promise.all([
    db.inspectionSubmission.count({ where: { projectId } }),
    db.clearInspection.count({ where: { row: { projectId } } }),
    db.projectRow.count({
      where: {
        projectId,
        OR: [
          { scopeStage: { not: null } },
          { scopeStatus: { not: null } },
          { inspectionStatus: { not: null } },
        ],
      },
    }),
    db.projectIssue.count({ where: { projectId } }),
    db.projectObservation.count({ where: { projectId } }),
  ]);

  const counts: OverwriteBlockCounts = {
    submissions,
    clearInspections,
    rowsWithProgress,
    issues,
    observations,
  };

  const blocked =
    submissions > 0 ||
    clearInspections > 0 ||
    rowsWithProgress > 0 ||
    issues > 0 ||
    observations > 0;

  return { blocked, counts };
}
