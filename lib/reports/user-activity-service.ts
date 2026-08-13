import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { periodToCreatedAtBounds } from "@/lib/reports/activity-period-bounds";
import type { ComparePeriodState } from "@/lib/reports/portfolio-progress-period";
import type { UserActivityRow } from "@/lib/reports/user-activity-types";

/** Aggregate activity log counts per team member for the selected period. */
export async function fetchUserActivityRows(options: {
  sessionRole: string;
  period: ComparePeriodState;
}): Promise<UserActivityRow[]> {
  const squad = isTestProjectSquadRole(options.sessionRole);
  const accessibleProjects = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
    select: { id: true },
  });
  const scopedIds = accessibleProjects.map((p) => p.id);

  const alwaysExclude = activityAlwaysExclude({ squadRole: squad });
  const createdAtBounds = periodToCreatedAtBounds(options.period);

  const countByUserId = new Map<string, number>();

  if (scopedIds.length > 0) {
    const grouped = await db.activityLog.groupBy({
      by: ["userId"],
      where: {
        projectId: { in: scopedIds },
        userId: { not: null },
        ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
        ...(Object.keys(createdAtBounds).length > 0 ? { createdAt: createdAtBounds } : {}),
      },
      _count: { _all: true },
    });

    for (const row of grouped) {
      if (row.userId) {
        countByUserId.set(row.userId, row._count._all);
      }
    }
  }

  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { code: true } },
    },
  });

  const rows = users.map((user) => ({
    id: user.id,
    name: user.name ?? user.email,
    role: user.role.code,
    count: countByUserId.get(user.id) ?? 0,
  }));

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return rows;
}
