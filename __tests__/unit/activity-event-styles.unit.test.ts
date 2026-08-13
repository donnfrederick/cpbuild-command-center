import { describe, it, expect } from "vitest";
import {
  ACTIVITY_EVENT_PALETTES,
  ACTIVITY_UNIT_CHIP_STYLE,
  getActivityEventCategory,
  getActivityEventColors,
} from "@/lib/activity-event-styles";

describe("getActivityEventCategory()", () => {
  it("maps scope status events to status (orange)", () => {
    expect(getActivityEventCategory("SCOPE_STATUS_UPDATED")).toBe("status");
    expect(getActivityEventCategory("SCOPE_STATUS_BULK_UPDATED")).toBe("status");
  });

  it("maps inspection scope events to inspection (blue)", () => {
    expect(getActivityEventCategory("SCOPE_INSPECTION_UPDATED")).toBe("inspection");
    expect(getActivityEventCategory("INSPECTION_SUBMITTED")).toBe("inspection");
  });

  it("maps issue events to issue or resolved palettes", () => {
    expect(getActivityEventCategory("ISSUE_CREATED")).toBe("issue");
    expect(getActivityEventCategory("ISSUE_RESOLVED")).toBe("issueResolved");
  });

  it("maps observations to observation (violet)", () => {
    expect(getActivityEventCategory("OBSERVATION_CREATED")).toBe("observation");
  });
});

describe("getActivityEventColors()", () => {
  it("gives status and inspection different palettes", () => {
    const status = getActivityEventColors("SCOPE_STATUS_UPDATED");
    const inspection = getActivityEventColors("SCOPE_INSPECTION_UPDATED");

    expect(status.bg).not.toBe(inspection.bg);
    expect(status.color).not.toBe(inspection.color);
    expect(inspection.bg).toBe(ACTIVITY_EVENT_PALETTES.inspection.bg);
    expect(status.bg).toBe(ACTIVITY_EVENT_PALETTES.status.bg);
  });

  it("uses calibration palette when flagged", () => {
    const colors = getActivityEventColors("INSPECTION_SUBMITTED", {
      isCalibration: true,
    });
    expect(colors).toEqual(ACTIVITY_EVENT_PALETTES.calibration);
  });

  it("uses design tokens only — no hardcoded hex", () => {
    for (const palette of Object.values(ACTIVITY_EVENT_PALETTES)) {
      expect(palette.color).toMatch(/^var\(--/);
      expect(palette.bg).toMatch(/^var\(--/);
    }
  });
});

describe("ACTIVITY_UNIT_CHIP_STYLE", () => {
  it("uses primary-weight tokens for the unit scan line", () => {
    expect(ACTIVITY_UNIT_CHIP_STYLE.color).toBe("var(--neutral-900)");
    expect(ACTIVITY_UNIT_CHIP_STYLE.fontWeight).toBe(700);
    expect(ACTIVITY_UNIT_CHIP_STYLE.fontSize).toBeGreaterThanOrEqual(12);
  });
});
