import { describe, expect, it } from "vitest";
import {
  attachSubmitterFromSession,
} from "@/lib/inspections/resolve-submission-submitter";
import {
  buildProjectHubFormsExportFilterSummary,
  countActiveProjectHubFormFilters,
  filterProjectHubFormSubmissions,
  projectHubDatePresetRange,
  projectHubFormExportRecords,
  submissionInProjectHubDateRange,
  uniqueProjectHubFormNames,
} from "@/lib/inspections/project-hub-form-list-filters";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

function makeSub(overrides: Partial<InspectionSubmission> = {}): InspectionSubmission {
  return {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Daily Update",
    categorySnapshot: "OTHER",
    level: "project",
    projectId: "proj-1",
    unitId: "__project__",
    submittedAt: "2026-06-18T12:00:00.000Z",
    submittedBy: "—",
    outcome: "COMPLETE",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
    ...overrides,
  };
}

function filterInput(
  overrides: Partial<{
    selectedFormNames: Set<string>;
    allFormNames: string[];
    fromDate: string;
    toDate: string;
  }> = {},
) {
  const allFormNames = overrides.allFormNames ?? ["Daily Update", "Safety Log"];
  return {
    selectedFormNames: overrides.selectedFormNames ?? new Set(allFormNames),
    allFormNames,
    fromDate: overrides.fromDate ?? "",
    toDate: overrides.toDate ?? "",
  };
}

describe("attachSubmitterFromSession()", () => {
  it("adds synthetic clearInspection when missing", () => {
    const result = attachSubmitterFromSession(
      { id: "sub-1", clearInspection: null },
      { id: "user-1", name: "Phil Amour" },
    );
    expect(result.clearInspection?.inspectedBy?.name).toBe("Phil Amour");
  });

  it("preserves existing clearInspection inspector", () => {
    const result = attachSubmitterFromSession(
      {
        id: "sub-1",
        clearInspection: {
          inspectedById: "u2",
          inspectedBy: { id: "u2", name: "Existing" },
        },
      },
      { id: "user-1", name: "Phil Amour" },
    );
    expect(result.clearInspection?.inspectedBy?.name).toBe("Existing");
  });
});

describe("partitionInspectionSubmissionsForPdfExport", () => {
  it("excludes pending sync rows from PDF export", async () => {
    const { partitionInspectionSubmissionsForPdfExport } = await import(
      "@/lib/inspections/submissionsApi"
    );
    const subs = [
      { id: "server-1", _pendingSync: undefined },
      { id: "local-1", _pendingSync: true },
    ] as import("@/lib/inspections/submissionsApi").InspectionSubmission[];

    const { exportable, pendingCount } = partitionInspectionSubmissionsForPdfExport(subs);
    expect(exportable.map((s) => s.id)).toEqual(["server-1"]);
    expect(pendingCount).toBe(1);
  });
});

describe("project-hub-form-list-filters", () => {
  const now = new Date("2026-06-18T15:00:00.000Z");

  it("filters by selected form names", () => {
    const subs = [
      makeSub({ id: "a", formNameSnapshot: "Daily Update" }),
      makeSub({ id: "b", formNameSnapshot: "Safety Log" }),
    ];
    expect(
      filterProjectHubFormSubmissions(
        subs,
        filterInput({ selectedFormNames: new Set(["Safety Log"]) }),
      ),
    ).toHaveLength(1);
  });

  it("filters by custom date range", () => {
    const subs = [
      makeSub({ id: "old", submittedAt: "2026-06-01T12:00:00.000Z" }),
      makeSub({ id: "new", submittedAt: "2026-06-17T12:00:00.000Z" }),
    ];
    const filtered = filterProjectHubFormSubmissions(
      subs,
      filterInput({ fromDate: "2026-06-10", toDate: "2026-06-18" }),
    );
    expect(filtered.map((s) => s.id)).toEqual(["new"]);
  });

  it("filters by last 7 day preset range", () => {
    const range = projectHubDatePresetRange("last7", now);
    expect(submissionInProjectHubDateRange("2026-06-17T08:00:00.000Z", range.fromDate, range.toDate)).toBe(
      true,
    );
    expect(submissionInProjectHubDateRange("2026-06-01T08:00:00.000Z", range.fromDate, range.toDate)).toBe(
      false,
    );
  });

  it("counts active filters for date and form selection", () => {
    expect(countActiveProjectHubFormFilters(filterInput())).toBe(0);
    expect(
      countActiveProjectHubFormFilters(
        filterInput({ fromDate: "2026-06-01", toDate: "2026-06-18" }),
      ),
    ).toBe(1);
    expect(
      countActiveProjectHubFormFilters(
        filterInput({ selectedFormNames: new Set(["Daily Update"]) }),
      ),
    ).toBe(1);
  });

  it("builds export filter summary", () => {
    const summary = buildProjectHubFormsExportFilterSummary(
      filterInput({
        fromDate: "2026-06-01",
        toDate: "2026-06-18",
        selectedFormNames: new Set(["Daily Update"]),
      }),
      2,
    );
    expect(summary).toContain("2026-06-01");
    expect(summary).toContain("Daily Update");
  });

  it("maps export metadata rows with seq numbers (submitter resolved at export API)", () => {
    const records = projectHubFormExportRecords([
      makeSub({ id: "a", submittedBy: "Phil Amour" }),
      makeSub({ id: "b", formNameSnapshot: "Safety Log" }),
    ]);
    expect(records).toHaveLength(2);
    expect(records[0]?.submissionId).toBe("a");
    expect(records[0]?.seqNumber).toBe(1);
    expect(records[0]?.imName).toBeNull();
    expect(records[1]?.seqNumber).toBe(2);
  });

  it("lists unique form names in encounter order", () => {
    const names = uniqueProjectHubFormNames([
      makeSub({ formNameSnapshot: "Daily Update" }),
      makeSub({ formNameSnapshot: "Safety Log" }),
      makeSub({ formNameSnapshot: "Daily Update" }),
    ]);
    expect(names).toEqual(["Daily Update", "Safety Log"]);
  });
});
