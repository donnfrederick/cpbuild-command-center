import { describe, expect, it } from "vitest";
import {
  formatMobileAttemptLine,
  inspectionReportEntryTone,
  inspectorDisplayName,
  inspectorInitials,
  mobileInspectionTypeLabel,
  reportRowLocationLabel,
  subcontractorDisplayName,
} from "@/lib/inspections/inspection-report-mobile";

describe("inspection-report-mobile helpers", () => {
  it("strips seed prefixes from inspector and subcontractor names", () => {
    expect(inspectorDisplayName("[Seed] Sarah Mitchell")).toBe("Sarah Mitchell");
    expect(subcontractorDisplayName("[SEED] Acme Install")).toBe("Acme Install");
  });

  it("derives inspector initials from first and last name", () => {
    expect(inspectorInitials("Sarah Mitchell")).toBe("SM");
    expect(inspectorInitials("Alex")).toBe("AL");
    expect(inspectorInitials("")).toBe("?");
  });

  it("formats attempt lines for regular and calibration inspections", () => {
    const formatDate = (iso: string) => iso.slice(0, 10);
    expect(
      formatMobileAttemptLine({
        isCalibration: false,
        attemptNumber: 2,
        submittedAt: "2026-05-15T12:00:00.000Z",
        formatDate,
      })
    ).toBe("Attempt #2 · 2026-05-15");
    expect(
      formatMobileAttemptLine({
        isCalibration: true,
        attemptNumber: null,
        submittedAt: "2026-05-15T12:00:00.000Z",
        formatDate,
      })
    ).toBe("Calibration · 2026-05-15");
  });

  it("maps outcomes to card tone classes", () => {
    expect(inspectionReportEntryTone("PASS", false)).toBe("pass");
    expect(inspectionReportEntryTone("FAIL", false)).toBe("fail");
    expect(inspectionReportEntryTone("PASS", true)).toBe("calibration");
  });

  it("builds overlay location labels from report row fields", () => {
    expect(
      reportRowLocationLabel({
        unit: "608",
        building: "1",
        level: "6",
        shipPhase: "1",
      }),
    ).toBe("Bldg 1 · Phase 1 · Level 6 · Unit 608");
  });

  it("abbreviates clear inspection type labels for mobile cards", () => {
    expect(
      mobileInspectionTypeLabel("Clear Inspection", "CLEAR_INSPECTION", "Clear Insp"),
    ).toBe("Clear Insp");
    expect(
      mobileInspectionTypeLabel("Field Verification Inspection", "FIELD_VERIFICATION", "Clear Insp"),
    ).toBe("Field Verification Insp");
  });
});
