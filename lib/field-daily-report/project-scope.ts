import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import { FIELD_DAILY_ALL_EVENT_TYPES } from "@/lib/field-daily-report/event-sets";
import { dayBoundsInOrgTz, todayReportDateInOrgTz, compareReportDates } from "@/lib/field-daily-report/timezone";
import { enrichProjectListResilient } from "@/lib/project-unifier-merge";
import { checkProjectVisibleInApi, isTestProjectSquadRole } from "@/lib/production-project-access";

function baseProjectWhere(sessionRole: string): Prisma.ProjectWhereInput {
  const squad = isTestProjectSquadRole(sessionRole);
  return {
    deletedAt: null,
    ...(squad ? {} : { isTestProject: false }),
  };
}

async function loadProjectsWhere(where: Prisma.ProjectWhereInput) {
  const rows = await db.project.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  const { projects } = await enrichProjectListResilient(rows);
  return projects;
}

/**
 * Active projects the user may target in global backfill.
 * Unlike `loadReportProjects`, not limited to field activity on a specific day.
 */
export async function loadBackfillProjects(userId: string, sessionRole: string) {
  const baseWhere = baseProjectWhere(sessionRole);

  if (sessionRole === "INSTALL_MANAGER") {
    return loadProjectsWhere({ ...baseWhere, installManagerId: userId });
  }

  if (sessionRole === "PROJECT_MANAGER") {
    return loadProjectsWhere({ ...baseWhere, projectManagerId: userId });
  }

  // ADMIN / INSTALL_DIRECTOR — full active portfolio
  return loadProjectsWhere(baseWhere);
}

/** Projects included in a user's field daily report for the given calendar day. */
export async function loadReportProjects(
  userId: string,
  sessionRole: string,
  reportDate: string,
) {
  const baseWhere = baseProjectWhere(sessionRole);

  if (sessionRole === "INSTALL_MANAGER") {
    return loadProjectsWhere({ ...baseWhere, installManagerId: userId });
  }

  if (sessionRole === "PROJECT_MANAGER") {
    return loadProjectsWhere({ ...baseWhere, projectManagerId: userId });
  }

  // ADMIN / INSTALL_DIRECTOR — assigned IM/PM projects plus any project with field activity that day.
  const { start, end } = dayBoundsInOrgTz(reportDate);
  const today = todayReportDateInOrgTz();
  const activityEnd = compareReportDates(reportDate, today) < 0 ? end : new Date();
  const activityRows = await db.activityLog.findMany({
    where: {
      eventType: { in: FIELD_DAILY_ALL_EVENT_TYPES },
      createdAt: { gte: start, lte: activityEnd },
    },
    distinct: ["projectId"],
    select: { projectId: true },
  });
  const activityProjectIds = activityRows.map((row) => row.projectId);

  const rows = await db.project.findMany({
    where: {
      ...baseWhere,
      OR: [
        { installManagerId: userId },
        { projectManagerId: userId },
        ...(activityProjectIds.length > 0 ? [{ id: { in: activityProjectIds } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const { projects } = await enrichProjectListResilient(rows);
  return projects;
}

export async function userCanAccessProjectFieldDaily(
  userId: string,
  sessionRole: string,
  projectId: string,
  reportDate: string,
): Promise<boolean> {
  if (!canUseFieldDailyReport(sessionRole)) return false;

  const projects = await loadReportProjects(userId, sessionRole, reportDate);
  if (projects.some((project) => project.id === projectId)) {
    return true;
  }

  // Project hub card: user already navigated to /projects/[id]. Portfolio scope alone
  // excludes ADMIN/PM projects with no field activity today — allow read when the project
  // is visible in the workspace (same rules as the project list / layout).
  const row = await db.project.findFirst({
    where: { id: projectId },
    select: { id: true, deletedAt: true, isTestProject: true },
  });
  if (!row) return false;
  return checkProjectVisibleInApi(row, sessionRole).allowed;
}
