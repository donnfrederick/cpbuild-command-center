import { describe, it, expect } from "vitest";
import {
  GLOBAL_REPORTS,
  getGlobalReportByPath,
  isGlobalReportSubRoute,
} from "@/lib/reports/global-reports-registry";

describe("global-reports-registry", () => {
  it("defines activity and progress reports", () => {
    expect(GLOBAL_REPORTS.map((r) => r.id)).toEqual([
      "activity",
      "progress",
      "inspections",
      "field-daily",
    ]);
  });

  it("isGlobalReportSubRoute returns true for report paths", () => {
    expect(isGlobalReportSubRoute("/reports/activity")).toBe(true);
    expect(isGlobalReportSubRoute("/reports/progress")).toBe(true);
    expect(isGlobalReportSubRoute("/reports/inspections")).toBe(true);
    expect(isGlobalReportSubRoute("/reports/field-daily")).toBe(true);
    expect(isGlobalReportSubRoute("/reports")).toBe(false);
  });

  it("getGlobalReportByPath resolves current report", () => {
    expect(getGlobalReportByPath("/reports/progress")?.id).toBe("progress");
    expect(getGlobalReportByPath("/reports")).toBeUndefined();
  });
});
