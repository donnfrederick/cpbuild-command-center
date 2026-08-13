import type { Prisma } from "@prisma/client";

/**
 * BI list filter: default excludes test projects; whitelisted keys may include test clone IDs.
 */
export function biProjectListWhere(allowedProjectIds: string[]): Prisma.ProjectWhereInput {
  if (allowedProjectIds.length === 0) {
    return { deletedAt: null, isTestProject: false };
  }
  return {
    deletedAt: null,
    id: { in: allowedProjectIds },
  };
}

/**
 * BI single-project lookup: non-test by default; whitelisted project ID may be a test clone.
 */
export function biProjectByIdWhere(
  projectId: string,
  allowedProjectIds: string[]
): Prisma.ProjectWhereInput {
  if (allowedProjectIds.length > 0 && allowedProjectIds.includes(projectId)) {
    return { id: projectId, deletedAt: null };
  }
  return { id: projectId, deletedAt: null, isTestProject: false };
}
