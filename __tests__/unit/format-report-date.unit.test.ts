import { describe, it, expect } from "vitest";
import {
  formatReportDate,
  formatReportDateRangeCompact,
} from "@/lib/format-report-date";

describe("formatReportDate", () => {
  it("formats ISO date for en-US locale", () => {
    expect(formatReportDate("2025-01-06", "en-US")).toMatch(/1\/6\/25/);
  });

  it("returns em dash when date is null or missing", () => {
    expect(formatReportDate(null, "en-US")).toBe("—");
    expect(formatReportDate(undefined, "en-US")).toBe("—");
  });

  it("formatReportDateRangeCompact uses month/day only", () => {
    expect(formatReportDateRangeCompact("2026-05-27", "2026-06-03", "en-US")).toBe("5/27–6/3");
  });
});
