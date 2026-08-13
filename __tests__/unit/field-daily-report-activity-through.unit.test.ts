import { describe, expect, it } from "vitest";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { dayBoundsInOrgTz, todayReportDateInOrgTz } from "@/lib/field-daily-report/timezone";

describe("activityThroughForReportDate", () => {
  const now = new Date("2026-07-16T18:30:00.000Z");

  it("uses end of org day for past report dates", () => {
    const reportDate = "2026-07-10";
    const through = activityThroughForReportDate(reportDate, now);
    expect(through.getTime()).toBe(dayBoundsInOrgTz(reportDate).end.getTime());
  });

  it("uses now for today's report date", () => {
    const today = todayReportDateInOrgTz(now);
    const through = activityThroughForReportDate(today, now);
    expect(through).toBe(now);
  });
});
