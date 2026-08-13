import { snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";
import type { FieldDailyReportProjectDto } from "@/lib/field-daily-report/types";

export type FieldDailyReportActivityFilter = "all" | "withChanges";

export interface FieldDailyReportProjectFilterOptions {
  searchQuery?: string;
  activityFilter?: FieldDailyReportActivityFilter;
}

/** Client-side filters for the global field daily report project list. */
export function filterFieldDailyReportProjects(
  projects: FieldDailyReportProjectDto[],
  options: FieldDailyReportProjectFilterOptions = {},
): FieldDailyReportProjectDto[] {
  const query = options.searchQuery?.trim().toLowerCase() ?? "";
  const activityFilter = options.activityFilter ?? "all";

  return projects
    .filter((project) => {
      if (activityFilter === "withChanges" && !snapshotHasFieldActivity(project.snapshot)) {
        return false;
      }
      if (query && !project.projectName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aHasActivity = snapshotHasFieldActivity(a.snapshot) ? 0 : 1;
      const bHasActivity = snapshotHasFieldActivity(b.snapshot) ? 0 : 1;
      return aHasActivity - bHasActivity;
    });
}
