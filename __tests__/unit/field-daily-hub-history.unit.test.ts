import { describe, expect, it } from "vitest";
import {
  defaultFieldDailyHistoryRange,
  FIELD_DAILY_HISTORY_DEFAULT_LOOKBACK_DAYS,
  FIELD_DAILY_HISTORY_PAGE_SIZE,
  formatFieldDailyReportGeneratedAt,
  fieldDailyReportHistoryTimeLabel,
  parseFieldDailyHistoryQuery,
} from "@/lib/field-daily-report/hub-history";
import { reportDateDaysBefore } from "@/lib/field-daily-report/timezone";

describe("parseFieldDailyHistoryQuery", () => {
  const now = new Date("2026-07-14T18:00:00.000Z");

  it("defaults to last 90 days through today", () => {
    const parsed = parseFieldDailyHistoryQuery(new URLSearchParams(), now);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.toDate).toBe("2026-07-14");
    expect(parsed.fromDate).toBe(reportDateDaysBefore("2026-07-14", FIELD_DAILY_HISTORY_DEFAULT_LOOKBACK_DAYS));
    expect(parsed.limit).toBe(FIELD_DAILY_HISTORY_PAGE_SIZE);
  });

  it("rejects from after to", () => {
    const params = new URLSearchParams({ from: "2026-07-14", to: "2026-07-01" });
    const parsed = parseFieldDailyHistoryQuery(params, now);
    expect(parsed).toEqual({ error: "from must be on or before to" });
  });

  it("parses cursor and custom limit", () => {
    const params = new URLSearchParams({
      from: "2026-06-01",
      to: "2026-07-14",
      cursor: "2026-07-10",
      limit: "25",
    });
    const parsed = parseFieldDailyHistoryQuery(params, now);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.cursor).toBe("2026-07-10");
    expect(parsed.limit).toBe(25);
  });
});
describe("formatFieldDailyReportGeneratedAt", () => {
  it("includes calendar date and time for past report dates", () => {
    const label = formatFieldDailyReportGeneratedAt("2026-07-10T18:52:43.000Z", "en-US");
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/10/);
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/52|12:52/);
    expect(label).not.toMatch(/12:00:00 AM/);
  });

  it("shows the generation date when run on a different day than the report", () => {
    const label = formatFieldDailyReportGeneratedAt("2026-07-16T19:49:09.000Z", "en-US");
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/16/);
    expect(label).toMatch(/2026/);
  });
});

describe("fieldDailyReportHistoryTimeLabel", () => {
  it("delegates to formatFieldDailyReportGeneratedAt", () => {
    const label = fieldDailyReportHistoryTimeLabel({
      reportDate: "2026-07-14",
      generatedAt: "2026-07-14T18:49:54.000Z",
      todayDate: "2026-07-14",
      locale: "en-US",
    });
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/14/);
    expect(label).not.toMatch(/12:00:00 AM/);
  });
});

describe("defaultFieldDailyHistoryRange", () => {
  it("matches org-today end and 90-day lookback", () => {
    const range = defaultFieldDailyHistoryRange(new Date("2026-07-14T18:00:00.000Z"));
    expect(range.toDate).toBe("2026-07-14");
    expect(range.fromDate).toBe("2026-04-15");
  });
});
