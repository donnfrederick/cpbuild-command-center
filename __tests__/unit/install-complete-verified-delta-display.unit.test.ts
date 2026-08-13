import { describe, expect, it } from "vitest";
import {
  formatInstallCompleteVerifiedUnitDeltaLabel,
  progressPercentDeltaColor,
  resolveInstallCompleteVerifiedUnitDelta,
  resolveProgressPercentDelta,
} from "@/lib/field-daily-report/install-complete-verified-delta-display";

describe("install-complete-verified delta display", () => {
  it("formats positive, negative, and zero labels", () => {
    expect(formatInstallCompleteVerifiedUnitDeltaLabel(3)).toBe("+3");
    expect(formatInstallCompleteVerifiedUnitDeltaLabel(-2)).toBe("-2");
    expect(formatInstallCompleteVerifiedUnitDeltaLabel(0)).toBe("0");
  });

  it("uses green, red, and gray token colors for progress percent delta", () => {
    expect(progressPercentDeltaColor(2)).toBe("var(--success-700)");
    expect(progressPercentDeltaColor(-1)).toBe("var(--error-600)");
    expect(progressPercentDeltaColor(0)).toBe("var(--neutral-400)");
  });

  it("reads pctCompleteDelta from progress snapshot", () => {
    expect(
      resolveProgressPercentDelta({
        statusChangeCount: 0,
        installCompleteCount: 0,
        installCompleteQtyToday: 0,
        installCompleteVerifiedUnitDelta: 0,
        inspectionSubmittedCount: 0,
        issuesCreatedCount: 0,
        issuesResolvedCount: 0,
        observationsCreatedCount: 0,
        pctCompleteDelta: 1,
      }),
    ).toBe(1);
  });

  it("defaults missing legacy snapshot values to zero", () => {
    expect(
      resolveInstallCompleteVerifiedUnitDelta({
        statusChangeCount: 0,
        installCompleteCount: 0,
        installCompleteQtyToday: 0,
        inspectionSubmittedCount: 0,
        issuesCreatedCount: 0,
        issuesResolvedCount: 0,
        observationsCreatedCount: 0,
      }),
    ).toBe(0);
  });
});
