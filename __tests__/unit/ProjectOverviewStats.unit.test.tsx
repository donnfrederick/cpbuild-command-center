import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  computeInstallCompleteStackedBarPercentages,
  ProjectOverviewStats,
} from "@/components/projects/ProjectOverviewStats";
import type { ScopeStats } from "@/lib/overview-stats";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function scopeStats(overrides: Partial<ScopeStats> = {}): ScopeStats {
  return {
    name: "Millwork",
    totalQty: 100,
    installCompleteQty: 25,
    pct: 25,
    totalEntries: 4,
    installCompleteEntries: 1,
    stages: {
      notStarted: 0,
      staging: 0,
      assembly: 0,
      installInProgress: 1,
      installCompleteSub: 2,
      installComplete: 1,
    },
    clearInspections: { passed: 0, failed: 0 },
    ...overrides,
  };
}

describe("computeInstallCompleteStackedBarPercentages", () => {
  it("uses count basis for both verified and SUB segments", () => {
    const pct = computeInstallCompleteStackedBarPercentages(
      scopeStats({
        pct: 80,
        totalEntries: 4,
        installCompleteEntries: 1,
        stages: {
          notStarted: 0,
          staging: 0,
          assembly: 0,
          installInProgress: 1,
          installCompleteSub: 2,
          installComplete: 1,
        },
      })
    );

    expect(pct).toEqual({ verifiedPct: 25, subPct: 50 });
  });

  it("returns zeroes when there are no entries", () => {
    expect(
      computeInstallCompleteStackedBarPercentages(
        scopeStats({
          totalEntries: 0,
          installCompleteEntries: 0,
          stages: {
            notStarted: 0,
            staging: 0,
            assembly: 0,
            installInProgress: 0,
            installCompleteSub: 0,
            installComplete: 0,
          },
        })
      )
    ).toEqual({ verifiedPct: 0, subPct: 0 });
  });

  it("treats missing legacy SUB counts as zero", () => {
    const legacyScope = scopeStats({
      stages: {
        notStarted: 0,
        staging: 0,
        assembly: 0,
        installInProgress: 1,
        installComplete: 1,
      } as ScopeStats["stages"],
    });

    expect(computeInstallCompleteStackedBarPercentages(legacyScope)).toEqual({
      verifiedPct: 25,
      subPct: 0,
    });
  });
});

describe("ProjectOverviewStats", () => {
  it("renders when a legacy stage payload is missing installCompleteSub", () => {
    const legacyScope = scopeStats({
      stages: {
        notStarted: 0,
        staging: 0,
        assembly: 0,
        installInProgress: 1,
        installComplete: 1,
      } as ScopeStats["stages"],
    });

    render(
      <ProjectOverviewStats
        projectId="project-1"
        stats={{
          overall: {
            totalQty: 100,
            installCompleteQty: 25,
            pct: 25,
            installCompleteEntries: 1,
          },
          byScope: [legacyScope],
          clearInspections: { passed: 0, failed: 0 },
          totalScopes: 4,
        }}
      />,
    );

    expect(screen.getByText("0 unverified")).toBeInTheDocument();
  });
});
