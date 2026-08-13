import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectListResilient } from "@/lib/project-unifier-merge";
import { periodToCreatedAtBounds } from "@/lib/reports/activity-period-bounds";
import type { ComparePeriodState } from "@/lib/reports/portfolio-progress-period";
import type { ProjectActivityRow } from "@/lib/reports/project-activity-types";

/** Aggregate activity log counts per project for the selected period. */
export async function fetchProjectActivityRows(options: {
  sessionRole: string;
  period: ComparePeriodState;
}): Promise<ProjectActivityRow[]> {
  const squad = isTestProjectSquadRole(options.sessionRole);
  const dbRows = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
    orderBy: { createdAt: "asc" },
  });

  const { projects: enriched } = await enrichProjectListResilient(dbRows);
  const scopedIds = enriched.map((p) => p.id);

  const alwaysExclude = activityAlwaysExclude({ squadRole: squad });
  const createdAtBounds = periodToCreatedAtBounds(options.period);

  const countByProjectId = new Map<string, number>();

  if (scopedIds.length > 0) {
    const grouped = await db.activityLog.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: scopedIds },
        ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
        ...(Object.keys(createdAtBounds).length > 0 ? { createdAt: createdAtBounds } : {}),
      },
      _count: { _all: true },
    });

    for (const row of grouped) {
      countByProjectId.set(row.projectId, row._count._all);
    }
  }

  return enriched.map((project) => ({
    id: project.id,
    name: project.projectName,
    projectManagerName: project.projectManagerName ?? "",
    installManagerName: project.installManagerName ?? "",
    count: countByProjectId.get(project.id) ?? 0,
  }));
}
