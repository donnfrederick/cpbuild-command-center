import { describe, expect, it } from "vitest";
import {
  defaultInspectionReportPeriod,
  inspectionReportPeriodWithPreset,
  isInspectionReportCustomRangeInvalid,
  resolveInspectionReportPeriodQuery,
} from "@/lib/reports/inspection-report-period";

describe("inspection-report-period", () => {
  it("defaultInspectionReportPeriod is all time", () => {
    expect(defaultInspectionReportPeriod()).toEqual({
      preset: "all",
      customFrom: "",
      customTo: "",
    });
    expect(resolveInspectionReportPeriodQuery(defaultInspectionReportPeriod())).toEqual({});
  });

  it("resolveInspectionReportPeriodQuery returns a 7-day window for 1w", () => {
    const query = resolveInspectionReportPeriodQuery({
      preset: "1w",
      customFrom: "",
      customTo: "",
    });
    expect(query.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(query.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(query.from! <= query.to!).toBe(true);
  });

  it("resolveInspectionReportPeriodQuery uses custom dates when valid", () => {
    expect(
      resolveInspectionReportPeriodQuery({
        preset: "custom",
        customFrom: "2026-01-01",
        customTo: "2026-01-31",
      })
    ).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("isInspectionReportCustomRangeInvalid catches empty or reversed custom ranges", () => {
    expect(
      isInspectionReportCustomRangeInvalid({
        preset: "custom",
        customFrom: "",
        customTo: "2026-01-01",
      })
    ).toBe(true);
    expect(
      isInspectionReportCustomRangeInvalid({
        preset: "custom",
        customFrom: "2026-02-01",
        customTo: "2026-01-01",
      })
    ).toBe(true);
    expect(
      isInspectionReportCustomRangeInvalid({
        preset: "all",
        customFrom: "",
        customTo: "",
      })
    ).toBe(false);
  });

  it("inspectionReportPeriodWithPreset seeds custom dates from 1w when empty", () => {
    const next = inspectionReportPeriodWithPreset(defaultInspectionReportPeriod(), "custom");
    expect(next.preset).toBe("custom");
    expect(next.customFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(next.customTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
