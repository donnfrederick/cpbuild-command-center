import {
  compareReportDates,
  dayBoundsInOrgTz,
  todayReportDateInOrgTz,
} from "@/lib/field-daily-report/timezone";

/** Activity upper bound when generating a report for a calendar day. */
export function activityThroughForReportDate(reportDate: string, now = new Date()): Date {
  const today = todayReportDateInOrgTz(now);
  if (compareReportDates(reportDate, today) < 0) {
    return dayBoundsInOrgTz(reportDate).end;
  }
  return now;
}
