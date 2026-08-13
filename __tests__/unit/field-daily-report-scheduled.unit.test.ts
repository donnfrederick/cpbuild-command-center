import { describe, expect, it } from "vitest";
import {
  isOrgTzMidnightHour,
  scheduledFieldDailyReportDate,
} from "@/lib/field-daily-report/scheduled-generate";
import { FIELD_DAILY_REPORT_TIMEZONE } from "@/lib/field-daily-report/timezone";

describe("scheduledFieldDailyReportDate", () => {
  it("returns yesterday in org TZ when run just after midnight", () => {
    // 2026-07-17 00:30 America/Denver → report for 2026-07-16
    const now = new Date("2026-07-17T06:30:00.000Z");
    expect(scheduledFieldDailyReportDate(now, FIELD_DAILY_REPORT_TIMEZONE)).toBe("2026-07-16");
  });
});

describe("isOrgTzMidnightHour", () => {
  it("is true during the first hour after org-TZ midnight", () => {
    const now = new Date("2026-07-17T06:30:00.000Z");
    expect(isOrgTzMidnightHour(now, FIELD_DAILY_REPORT_TIMEZONE)).toBe(true);
  });

  it("is false during the afternoon org-TZ hour", () => {
    const now = new Date("2026-07-17T20:30:00.000Z");
    expect(isOrgTzMidnightHour(now, FIELD_DAILY_REPORT_TIMEZONE)).toBe(false);
  });
});
