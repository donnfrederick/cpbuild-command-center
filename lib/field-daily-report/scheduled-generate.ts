import { FieldDailyReportTrigger } from "@prisma/client";
import { db } from "@/lib/db";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { generateFieldDailyReport } from "@/lib/field-daily-report/service";
import {
  FIELD_DAILY_REPORT_TIMEZONE,
  reportDateDaysBefore,
  todayReportDateInOrgTz,
  zonedHourInOrgTz,
} from "@/lib/field-daily-report/timezone";

export interface ScheduledFieldDailyGenerateResult {
  reportDate: string;
  installManagersProcessed: number;
  installManagersWithReports: number;
  projectsWritten: number;
  skipped: boolean;
  skipReason?: string;
  errors: Array<{ installManagerUserId: string; message: string }>;
}

/** Calendar day that just ended when the job runs shortly after org-TZ midnight. */
export function scheduledFieldDailyReportDate(
  now = new Date(),
  timeZone = FIELD_DAILY_REPORT_TIMEZONE,
): string {
  const today = todayReportDateInOrgTz(now, timeZone);
  return reportDateDaysBefore(today, 1);
}

/** True during the first hour after org-TZ midnight (00:00–00:59). */
export function isOrgTzMidnightHour(
  now = new Date(),
  timeZone = FIELD_DAILY_REPORT_TIMEZONE,
): boolean {
  return zonedHourInOrgTz(now, timeZone) === 0;
}

async function loadActiveInstallManagerIds(): Promise<string[]> {
  const rows = await db.project.findMany({
    where: {
      deletedAt: null,
      isTestProject: false,
      installManagerId: { not: null },
    },
    distinct: ["installManagerId"],
    select: { installManagerId: true },
  });
  return rows.map((row) => row.installManagerId).filter((id): id is string => Boolean(id));
}

export async function runScheduledFieldDailyReports(options?: {
  reportDate?: string;
  now?: Date;
  /** When true, run even outside the org-TZ midnight hour (manual / workflow_dispatch). */
  force?: boolean;
}): Promise<ScheduledFieldDailyGenerateResult> {
  const now = options?.now ?? new Date();
  const reportDate = options?.reportDate ?? scheduledFieldDailyReportDate(now);

  if (!options?.force && !isOrgTzMidnightHour(now)) {
    return {
      reportDate,
      installManagersProcessed: 0,
      installManagersWithReports: 0,
      projectsWritten: 0,
      skipped: true,
      skipReason: "not_org_midnight_hour",
      errors: [],
    };
  }

  const installManagerIds = await loadActiveInstallManagerIds();
  const activityThrough = activityThroughForReportDate(reportDate, now);

  let installManagersWithReports = 0;
  let projectsWritten = 0;
  const errors: ScheduledFieldDailyGenerateResult["errors"] = [];

  for (const installManagerUserId of installManagerIds) {
    try {
      const report = await generateFieldDailyReport({
        installManagerUserId,
        sessionRole: "INSTALL_MANAGER",
        reportDate,
        trigger: FieldDailyReportTrigger.SCHEDULED,
        generatedByUserId: null,
        activityThrough,
      });
      if (report && report.projects.length > 0) {
        installManagersWithReports += 1;
        projectsWritten += report.projects.length;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push({ installManagerUserId, message });
    }
  }

  return {
    reportDate,
    installManagersProcessed: installManagerIds.length,
    installManagersWithReports,
    projectsWritten,
    skipped: false,
    errors,
  };
}
