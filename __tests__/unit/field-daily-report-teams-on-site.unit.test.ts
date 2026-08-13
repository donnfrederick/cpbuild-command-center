import { describe, expect, it } from "vitest";
import { buildTeamsOnSiteRollup } from "@/lib/field-daily-report/enrich-teams-on-site";
import { UNKNOWN_SUBCONTRACTOR_LABEL } from "@/lib/subcontractor-display";
import type { FieldDailyReportStatusGroup } from "@/lib/field-daily-report/types";

describe("buildTeamsOnSiteRollup", () => {
  it("groups status-update units by subcontractor label", () => {
    const statusGroups: FieldDailyReportStatusGroup[] = [
      {
        id: "status-0",
        statusLabel: "Install: In Progress",
        unitEntries: [
          {
            locationLabel: "Bldg 1 · L2 · Unit 316",
            building: "1",
            level: "2",
            unit: "316",
            subcontractorLabel: "CABIU",
            activityLogIds: ["a1"],
          },
          {
            locationLabel: "Bldg 1 · L2 · Unit 317",
            building: "1",
            level: "2",
            unit: "317",
            subcontractorLabel: "CABIU",
            activityLogIds: ["a2"],
          },
          {
            locationLabel: "Bldg 1 · L3 · Unit 401",
            building: "1",
            level: "3",
            unit: "401",
            subcontractorLabel: "Drywall Co",
            activityLogIds: ["a3"],
          },
        ],
        sourceActivityLogIds: ["a1", "a2", "a3"],
      },
    ];

    const { summaryGroups } = buildTeamsOnSiteRollup(statusGroups);
    expect(summaryGroups).toHaveLength(2);
    const cabiu = summaryGroups.find((g) => g.subcontractorLabel === "CABIU");
    expect(cabiu?.unitEntries).toHaveLength(2);
    expect(summaryGroups.find((g) => g.subcontractorLabel === "Drywall Co")?.unitEntries).toHaveLength(1);
  });

  it("dedupes the same unit across multiple status groups", () => {
    const statusGroups: FieldDailyReportStatusGroup[] = [
      {
        id: "s1",
        statusLabel: "Install: In Progress",
        unitEntries: [
          {
            locationLabel: "Bldg 1 · L2 · Unit 201",
            building: "1",
            level: "2",
            unit: "201",
            subcontractorLabel: "CABIU",
            activityLogIds: ["a1"],
          },
        ],
        sourceActivityLogIds: ["a1"],
      },
      {
        id: "s2",
        statusLabel: "Install: Complete",
        unitEntries: [
          {
            locationLabel: "Bldg 1 · L2 · Unit 201",
            building: "1",
            level: "2",
            unit: "201",
            subcontractorLabel: "CABIU",
            activityLogIds: ["a2"],
          },
        ],
        sourceActivityLogIds: ["a2"],
      },
    ];

    const { summaryGroups } = buildTeamsOnSiteRollup(statusGroups);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].unitEntries).toHaveLength(1);
  });

  it("buckets units without a subcontractor as Unassigned", () => {
    const { summaryGroups } = buildTeamsOnSiteRollup([
      {
        id: "s1",
        statusLabel: "Install: In Progress",
        unitEntries: [
          {
            locationLabel: "Bldg 1 · L2 · Unit 203",
            building: "1",
            level: "2",
            unit: "203",
            activityLogIds: ["a1"],
          },
        ],
        sourceActivityLogIds: ["a1"],
      },
    ]);
    expect(summaryGroups[0].subcontractorLabel).toBe("Unassigned");
  });

  it("groups unresolved subcontractor placeholders separately from Unassigned", () => {
    const { summaryGroups } = buildTeamsOnSiteRollup([
      {
        id: "s1",
        statusLabel: "Install: In Progress",
        unitEntries: [
          {
            locationLabel: "Bldg 1 · L2 · Unit 203",
            building: "1",
            level: "2",
            unit: "203",
            subcontractorLabel: UNKNOWN_SUBCONTRACTOR_LABEL,
            activityLogIds: ["a1"],
          },
        ],
        sourceActivityLogIds: ["a1"],
      },
    ]);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].subcontractorLabel).toBe(UNKNOWN_SUBCONTRACTOR_LABEL);
  });
});
