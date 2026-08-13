import { describe, it, expect } from "vitest";
import {
  allInspectionScopeCodes,
  applyInspectionReportClientFilters,
  collectInspectionTypeCodes,
  collectCalibrationFilterValues,
  detectInspectionReportQuickFilter,
  INSPECTION_REPORT_RECORD_CALIBRATION,
  INSPECTION_REPORT_RECORD_INSPECTION,
  inspectionReportQuickFilterPatch,
  submissionMatchesCalibrationFilter,
  collectInspectionScopeOptions,
  collectSubmissionIMNames,
  collectSubmissionInspectorNames,
  collectSubmissionPMNames,
  personFilterOptionLabel,
  INSPECTION_REPORT_PERSON_UNASSIGNED,
  collectLocationFieldValues,
  buildInspectionReportLocationFilterOptions,
  submissionMatchesLocationHierarchyFilter,
  hasActiveInspectionReportLocationFilters,
  computeInspectionReportStats,
  countInspectionReportFilterBadge,
  countUnfilteredInspectionReportSubmissions,
  defaultInspectionReportSortDir,
  flattenInspectionReportSubmissions,
  formatSubmissionLocationSubtext,
  hasActiveInspectionReportClientFilters,
  inspectionTypeFilterLabel,
  inspectionTypeSelectionLabel,
  isAllScopeCodesSelected,
  isAllValuesSelected,
  isUnsetOrAllSelected,
  multiSelectFilterLabel,
  scopeSelectionLabel,
  sortInspectionReportRows,
  submissionMatchesInspectionTypeFilter,
  submissionMatchesScopeFilter,
  filterGlobalInspectionSubmissions,
  type InspectionReportSubmissionRow,
} from "@/lib/inspections/inspection-report-filters";
import type { SubmissionRow } from "@/app/api/projects/[id]/inspections-report/route";

function row(partial: Partial<SubmissionRow> & Pick<SubmissionRow, "submissionId">): SubmissionRow {
  return {
    seqNumber: 1,
    scopeTypeCode: "MILL",
    scopeTypeName: "Millwork",
    unit: "101",
    building: "A",
    level: "2",
    area: "",
    shipPhase: "",
    buildPhase: "",
    imName: "Alice IM",
    pmName: "Bob PM",
    inspectionTypeCode: "CLEAR_INSPECTION",
    inspectionTypeName: "Clear Inspection",
    submittedByName: "Inspector",
    installTeamName: "Sub Co",
    submittedAt: "2026-05-01T12:00:00.000Z",
    outcome: "PASS",
    totalDeficiencies: 0,
    isCalibration: false,
    attemptNumber: 1,
    sections: [],
    ...partial,
  };
}

function baseFilters(
  overrides: Partial<ReturnType<typeof makeFilters>> = {}
) {
  return makeFilters(overrides);
}

function makeFilters(overrides: {
  filterResult?: "all" | "PASS" | "FAIL";
  selectedIMs?: Set<string>;
  allIMs?: string[];
  selectedPMs?: Set<string>;
  allPMs?: string[];
  selectedInspectors?: Set<string>;
  allInspectors?: string[];
  selectedInstallers?: Set<string>;
  allInstallers?: string[];
  filterLocation?: string;
  selectedBuildings?: Set<string>;
  selectedLevels?: Set<string>;
  selectedInspectionTypeCodes?: Set<string>;
  allInspectionTypeCodes?: string[];
  selectedCalibrationModes?: Set<string>;
  allCalibrationModes?: string[];
} = {}) {
  const allIMs = overrides.allIMs ?? ["Alice IM"];
  const allPMs = overrides.allPMs ?? ["Bob PM"];
  const allInspectors = overrides.allInspectors ?? ["Inspector"];
  const allInstallers = overrides.allInstallers ?? ["Sub Co"];
  const allInspectionTypeCodes =
    overrides.allInspectionTypeCodes ?? ["CLEAR_INSPECTION", "FIELD_VERIFICATION"];
  const allCalibrationModes =
    overrides.allCalibrationModes ?? [
      INSPECTION_REPORT_RECORD_INSPECTION,
      INSPECTION_REPORT_RECORD_CALIBRATION,
    ];
  return {
    filterResult: overrides.filterResult ?? ("all" as const),
    selectedIMs: overrides.selectedIMs ?? new Set<string>(),
    allIMs,
    selectedPMs: overrides.selectedPMs ?? new Set<string>(),
    allPMs,
    selectedInspectors: overrides.selectedInspectors ?? new Set<string>(),
    allInspectors,
    selectedInstallers: overrides.selectedInstallers ?? new Set<string>(),
    allInstallers,
    filterLocation: overrides.filterLocation ?? "",
    selectedBuildings: overrides.selectedBuildings ?? new Set<string>(),
    selectedLevels: overrides.selectedLevels ?? new Set<string>(),
    selectedInspectionTypeCodes:
      overrides.selectedInspectionTypeCodes ?? new Set<string>(),
    allInspectionTypeCodes,
    selectedCalibrationModes:
      overrides.selectedCalibrationModes ?? new Set<string>(),
    allCalibrationModes,
  };
}

function reportRow(
  partial: Partial<InspectionReportSubmissionRow> & Pick<InspectionReportSubmissionRow, "submissionId">
): InspectionReportSubmissionRow {
  return {
    ...row(partial),
    scopeTypeName: partial.scopeTypeName ?? "Millwork",
    scopeTypeCode: partial.scopeTypeCode ?? "MILL",
  };
}

describe("inspection-report-filters", () => {
  const scopeTypes = [
    {
      scopeTypeCode: "MILL",
      scopeTypeName: "Millwork",
      submissions: [row({ submissionId: "1", unit: "101" })],
    },
    {
      scopeTypeCode: "CASE",
      scopeTypeName: "Casework",
      submissions: [row({ submissionId: "2", unit: "202" })],
    },
    {
      scopeTypeCode: "TOP",
      scopeTypeName: "Countertops",
      submissions: [row({ submissionId: "3", unit: "303" })],
    },
  ];

  it("computeInspectionReportStats counts outcomes and calibrations", () => {
    const stats = computeInspectionReportStats([
      row({ submissionId: "1", outcome: "PASS", totalDeficiencies: 2 }),
      row({ submissionId: "2", outcome: "FAIL", totalDeficiencies: 3 }),
      row({ submissionId: "3", isCalibration: true, attemptNumber: null, outcome: "PASS" }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.passed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.calibrations).toBe(1);
    expect(stats.clearInspections).toBe(2);
    expect(stats.totalDeficiencies).toBe(5);
  });

  it("applyInspectionReportClientFilters respects result and search filters", () => {
    const submissions = [
      row({ submissionId: "1", unit: "201", outcome: "PASS" }),
      row({ submissionId: "2", unit: "202", outcome: "FAIL" }),
    ];
    const failedOnly = applyInspectionReportClientFilters(submissions, {
      ...baseFilters(),
      filterResult: "FAIL",
    });
    expect(failedOnly).toHaveLength(1);
    expect(failedOnly[0]?.submissionId).toBe("2");

    const unitMatch = applyInspectionReportClientFilters(submissions, {
      ...baseFilters(),
      filterLocation: "201",
    });
    expect(unitMatch).toHaveLength(1);
    expect(unitMatch[0]?.submissionId).toBe("1");
  });

  it("applyInspectionReportClientFilters supports IM, PM, subcontractor, and inspection type", () => {
    const submissions = [
      row({
        submissionId: "clear-a",
        imName: "IM A",
        pmName: "PM A",
        installTeamName: "Sub A",
        inspectionTypeCode: "CLEAR_INSPECTION",
      }),
      row({
        submissionId: "field-b",
        imName: "IM B",
        pmName: "PM B",
        installTeamName: "Sub B",
        inspectionTypeCode: "FIELD_VERIFICATION",
        inspectionTypeName: "Field Verification",
      }),
    ];
    const allTypes = collectInspectionTypeCodes(submissions);

    const clearOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allInspectionTypeCodes: allTypes,
        selectedInspectionTypeCodes: new Set(["CLEAR_INSPECTION"]),
      })
    );
    expect(clearOnly.map((entry) => entry.submissionId)).toEqual(["clear-a"]);

    const imOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allIMs: ["IM A", "IM B"],
        selectedIMs: new Set(["IM B"]),
      })
    );
    expect(imOnly.map((entry) => entry.submissionId)).toEqual(["field-b"]);

    const pmOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allPMs: ["PM A", "PM B"],
        selectedPMs: new Set(["PM A"]),
      })
    );
    expect(pmOnly.map((entry) => entry.submissionId)).toEqual(["clear-a"]);

    const subOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allInstallers: ["Sub A", "Sub B"],
        selectedInstallers: new Set(["Sub B"]),
      })
    );
    expect(subOnly.map((entry) => entry.submissionId)).toEqual(["field-b"]);
  });

  it("applyInspectionReportClientFilters supports inspector filter", () => {
    const submissions = [
      row({ submissionId: "1", submittedByName: "Alice Inspector" }),
      row({ submissionId: "2", submittedByName: "Bob Inspector" }),
    ];
    const allInspectors = collectSubmissionInspectorNames(submissions);

    const aliceOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allInspectors,
        selectedInspectors: new Set(["Alice Inspector"]),
      })
    );
    expect(aliceOnly.map((entry) => entry.submissionId)).toEqual(["1"]);
  });

  it("collectInspectionTypeCodes and inspectionTypeSelectionLabel describe type options", () => {
    const submissions = [
      row({ submissionId: "1", inspectionTypeCode: "CLEAR_INSPECTION" }),
      row({ submissionId: "2", inspectionTypeCode: "FIELD_VERIFICATION" }),
      row({
        submissionId: "3",
        isCalibration: true,
        attemptNumber: null,
        inspectionTypeCode: "CLEAR_INSPECTION",
      }),
    ];
    expect(collectInspectionTypeCodes(submissions)).toEqual([
      "CLEAR_INSPECTION",
      "FIELD_VERIFICATION",
    ]);
    expect(inspectionTypeFilterLabel("CLEAR_INSPECTION")).toBe("Clear Inspection");
    expect(
      inspectionTypeSelectionLabel(
        new Set(collectInspectionTypeCodes(submissions)),
        collectInspectionTypeCodes(submissions)
      )
    ).toBe("All types");
    expect(
      submissionMatchesInspectionTypeFilter(
        submissions[1]!,
        makeFilters({
          allInspectionTypeCodes: collectInspectionTypeCodes(submissions),
          selectedInspectionTypeCodes: new Set(["FIELD_VERIFICATION"]),
        })
      )
    ).toBe(true);
    expect(
      submissionMatchesInspectionTypeFilter(
        submissions[0]!,
        makeFilters({
          allInspectionTypeCodes: collectInspectionTypeCodes(submissions),
          selectedInspectionTypeCodes: new Set(["FIELD_VERIFICATION"]),
        })
      )
    ).toBe(false);
  });

  it("collectCalibrationFilterValues and submissionMatchesCalibrationFilter narrow calibrations", () => {
    const submissions = [
      row({ submissionId: "1" }),
      row({
        submissionId: "2",
        isCalibration: true,
        attemptNumber: null,
      }),
    ];
    expect(collectCalibrationFilterValues(submissions)).toEqual([
      INSPECTION_REPORT_RECORD_INSPECTION,
      INSPECTION_REPORT_RECORD_CALIBRATION,
    ]);
    expect(
      submissionMatchesCalibrationFilter(
        submissions[1]!,
        makeFilters({
          selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
        })
      )
    ).toBe(true);
    expect(
      applyInspectionReportClientFilters(submissions, makeFilters({
        selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
      })).map((entry) => entry.submissionId)
    ).toEqual(["2"]);
  });

  it("detectInspectionReportQuickFilter maps result + calibration combo to summary pills", () => {
    const allModes = [
      INSPECTION_REPORT_RECORD_INSPECTION,
      INSPECTION_REPORT_RECORD_CALIBRATION,
    ];

    expect(
      detectInspectionReportQuickFilter("all", new Set<string>(), allModes)
    ).toBe("all");
    expect(
      detectInspectionReportQuickFilter("all", new Set(allModes), allModes)
    ).toBe("all");
    expect(
      detectInspectionReportQuickFilter(
        "PASS",
        new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
        allModes
      )
    ).toBe("passed");
    expect(
      detectInspectionReportQuickFilter(
        "FAIL",
        new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
        allModes
      )
    ).toBe("failed");
    expect(
      detectInspectionReportQuickFilter(
        "all",
        new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
        allModes
      )
    ).toBe("calibration");
    expect(
      detectInspectionReportQuickFilter(
        "PASS",
        new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
        allModes
      )
    ).toBeNull();
  });

  it("inspectionReportQuickFilterPatch returns filter state for each quick pill", () => {
    const allModes = [
      INSPECTION_REPORT_RECORD_INSPECTION,
      INSPECTION_REPORT_RECORD_CALIBRATION,
    ];

    expect(inspectionReportQuickFilterPatch("all", allModes)).toEqual({
      filterResult: "all",
      selectedCalibrationModes: new Set<string>(),
    });
    expect(inspectionReportQuickFilterPatch("passed", allModes)).toEqual({
      filterResult: "PASS",
      selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
    });
    expect(inspectionReportQuickFilterPatch("failed", allModes)).toEqual({
      filterResult: "FAIL",
      selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
    });
    expect(inspectionReportQuickFilterPatch("calibration", allModes)).toEqual({
      filterResult: "all",
      selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
    });
  });

  it("collectInspectionScopeOptions and filterGlobalInspectionSubmissions narrow by scope", () => {
    const submissions: InspectionReportSubmissionRow[] = [
      {
        ...row({ submissionId: "1" }),
        scopeTypeCode: "CABIU",
        scopeTypeName: "Cabinetry",
      },
      {
        ...row({ submissionId: "2", outcome: "FAIL" }),
        scopeTypeCode: "MILL",
        scopeTypeName: "Millwork",
      },
    ];

    expect(collectInspectionScopeOptions(submissions)).toEqual([
      { code: "CABIU", name: "Cabinetry" },
      { code: "MILL", name: "Millwork" },
    ]);

    expect(
      submissionMatchesScopeFilter(submissions[0]!, new Set(["CABIU"]), ["CABIU", "MILL"])
    ).toBe(true);
    expect(
      submissionMatchesScopeFilter(submissions[1]!, new Set(["CABIU"]), ["CABIU", "MILL"])
    ).toBe(false);

    const filtered = filterGlobalInspectionSubmissions(submissions, {
      selectedInspectionTypeCodes: new Set(),
      selectedScopeCodes: new Set(["MILL"]),
    });
    expect(filtered.map((entry) => entry.submissionId)).toEqual(["2"]);
  });

  it("hasActiveInspectionReportClientFilters and badge count detect active filters", () => {
    expect(hasActiveInspectionReportClientFilters(baseFilters())).toBe(false);
    expect(
      hasActiveInspectionReportClientFilters(
        makeFilters({
          allIMs: ["Alice", "Bob"],
          selectedIMs: new Set(["Alice"]),
        })
      )
    ).toBe(true);
    const partialTypes = makeFilters({
      allInspectionTypeCodes: ["CLEAR_INSPECTION", "FIELD_VERIFICATION"],
      selectedInspectionTypeCodes: new Set(["FIELD_VERIFICATION"]),
    });
    expect(hasActiveInspectionReportClientFilters(partialTypes)).toBe(true);
    expect(
      countInspectionReportFilterBadge(
        partialTypes,
        new Set(allInspectionScopeCodes(scopeTypes)),
        allInspectionScopeCodes(scopeTypes)
      )
    ).toBe(1);
  });

  it("flattenInspectionReportSubmissions supports all scopes and multi-select", () => {
    const allCodes = new Set(allInspectionScopeCodes(scopeTypes));

    const allRows = flattenInspectionReportSubmissions(scopeTypes, baseFilters(), allCodes);
    expect(allRows).toHaveLength(3);
    expect(allRows.map((entry) => entry.scopeTypeName)).toEqual([
      "Millwork",
      "Casework",
      "Countertops",
    ]);
    expect(allRows.map((entry) => entry.seqNumber)).toEqual([1, 2, 3]);

    const millRows = flattenInspectionReportSubmissions(
      scopeTypes,
      baseFilters(),
      new Set(["MILL"])
    );
    expect(millRows).toHaveLength(1);
    expect(millRows[0]?.scopeTypeCode).toBe("MILL");
  });

  it("countUnfilteredInspectionReportSubmissions respects scope selection", () => {
    const allCodes = new Set(allInspectionScopeCodes(scopeTypes));

    expect(countUnfilteredInspectionReportSubmissions(scopeTypes, allCodes)).toBe(3);
    expect(
      countUnfilteredInspectionReportSubmissions(scopeTypes, new Set(["MILL"]))
    ).toBe(1);
  });

  it("formatSubmissionLocationSubtext includes area and phase when set", () => {
    expect(
      formatSubmissionLocationSubtext({
        building: "1",
        area: "Lobby",
        level: "2",
        shipPhase: "Phase A",
        buildPhase: "",
      })
    ).toBe("Bldg 1 · Phase Phase A · Area Lobby · Level 2");

    expect(
      formatSubmissionLocationSubtext({
        building: "",
        area: "0",
        level: "3",
        shipPhase: "",
        buildPhase: "Build B",
      })
    ).toBe("Phase Build B · Level 3");
  });

  it("collectLocationFieldValues ignores empty and placeholder area values", () => {
    const submissions = [
      row({ submissionId: "1", area: "Lobby", shipPhase: "P1" }),
      row({ submissionId: "2", area: "0", buildPhase: "P2" }),
      row({ submissionId: "3", area: "", shipPhase: "", buildPhase: "" }),
    ];
    expect(collectLocationFieldValues(submissions, "area")).toEqual(["Lobby"]);
    expect(collectLocationFieldValues(submissions, "phase")).toEqual(["P1", "P2"]);
  });

  it("sortInspectionReportRows sorts every table column", () => {
    const rows = [
      reportRow({
        submissionId: "1",
        seqNumber: 2,
        unit: "202",
        scopeTypeName: "Casework",
        imName: "Bob",
        pmName: "PM Z",
        submittedByName: "[Seed] Zed",
        installTeamName: "[SEED] Sub B",
        submittedAt: "2026-05-02T12:00:00.000Z",
        outcome: "FAIL",
        totalDeficiencies: 3,
        attemptNumber: 2,
      }),
      reportRow({
        submissionId: "2",
        seqNumber: 1,
        unit: "101",
        scopeTypeName: "Millwork",
        imName: "Alice",
        pmName: "PM A",
        submittedByName: "Amy",
        installTeamName: "Sub A",
        submittedAt: "2026-05-01T12:00:00.000Z",
        outcome: "PASS",
        totalDeficiencies: 0,
        isCalibration: true,
        attemptNumber: null,
      }),
    ];

    expect(sortInspectionReportRows(rows, "scope", "asc").map((entry) => entry.submissionId)).toEqual([
      "1",
      "2",
    ]);
    expect(sortInspectionReportRows(rows, "im", "asc").map((entry) => entry.submissionId)).toEqual([
      "2",
      "1",
    ]);
    expect(sortInspectionReportRows(rows, "pm", "asc").map((entry) => entry.submissionId)).toEqual([
      "2",
      "1",
    ]);
    expect(sortInspectionReportRows(rows, "inspector", "asc").map((entry) => entry.submissionId)).toEqual([
      "2",
      "1",
    ]);
    expect(sortInspectionReportRows(rows, "subcontractor", "asc").map((entry) => entry.submissionId)).toEqual([
      "2",
      "1",
    ]);
    expect(sortInspectionReportRows(rows, "attempt", "asc").map((entry) => entry.submissionId)).toEqual([
      "1",
      "2",
    ]);
    expect(sortInspectionReportRows(rows, "inspectionType", "asc").map((entry) => entry.submissionId)).toEqual([
      "1",
      "2",
    ]);
    expect(defaultInspectionReportSortDir("submittedAt")).toBe("desc");
    expect(defaultInspectionReportSortDir("scope")).toBe("asc");
  });

  it("isUnsetOrAllSelected treats empty selection as all", () => {
    const allValues = ["A", "B", "C"];
    expect(isUnsetOrAllSelected(new Set(), allValues)).toBe(true);
    expect(isUnsetOrAllSelected(new Set(["A"]), allValues)).toBe(false);
    expect(isUnsetOrAllSelected(new Set(allValues), allValues)).toBe(true);
  });

  it("isAllValuesSelected and multiSelectFilterLabel describe selection state", () => {
    const allValues = ["Alice", "Bob", "Carol"];
    const allSet = new Set(allValues);

    expect(isAllValuesSelected(allSet, allValues)).toBe(true);
    expect(multiSelectFilterLabel("All IMs", allSet, allValues, "IMs")).toBe("All IMs");

    const manyScopes = new Set(allInspectionScopeCodes(scopeTypes));
    expect(scopeSelectionLabel(scopeTypes, manyScopes)).toBe("All scopes");
    expect(isAllScopeCodesSelected(manyScopes, allInspectionScopeCodes(scopeTypes))).toBe(true);
  });

  it("collectSubmissionIMNames includes unassigned and sorts it last", () => {
    const submissions = [
      row({ submissionId: "1", imName: "Zara IM" }),
      row({ submissionId: "2", imName: "" }),
      row({ submissionId: "3", imName: "Alice IM" }),
    ];
    expect(collectSubmissionIMNames(submissions)).toEqual([
      "Alice IM",
      "Zara IM",
      INSPECTION_REPORT_PERSON_UNASSIGNED,
    ]);
    expect(personFilterOptionLabel("", "Unassigned")).toBe("Unassigned");
  });

  it("collectSubmissionInspectorNames uses submittedByName and sorts unassigned last", () => {
    const submissions = [
      row({ submissionId: "1", submittedByName: "Zara Inspector" }),
      row({ submissionId: "2", submittedByName: "" }),
      row({ submissionId: "3", submittedByName: "Alice Inspector" }),
    ];
    expect(collectSubmissionInspectorNames(submissions)).toEqual([
      "Alice Inspector",
      "Zara Inspector",
      INSPECTION_REPORT_PERSON_UNASSIGNED,
    ]);
  });

  it("applyInspectionReportClientFilters matches unassigned IM rows", () => {
    const submissions = [
      row({ submissionId: "assigned", imName: "Alice IM" }),
      row({ submissionId: "missing", imName: "" }),
    ];
    const allIMs = collectSubmissionIMNames(submissions);

    const unassignedOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({
        allIMs,
        selectedIMs: new Set([INSPECTION_REPORT_PERSON_UNASSIGNED]),
      })
    );
    expect(unassignedOnly.map((row) => row.submissionId)).toEqual(["missing"]);
  });

  it("buildInspectionReportLocationFilterOptions groups buildings and levels", () => {
    const submissions = [
      row({ submissionId: "1", building: "A", level: "2" }),
      row({ submissionId: "2", building: "A", level: "3" }),
      row({ submissionId: "3", building: "B", level: "1" }),
    ];
    expect(buildInspectionReportLocationFilterOptions(submissions)).toEqual({
      buildings: ["A", "B"],
      buildingLevels: {
        A: ["2", "3"],
        B: ["1"],
      },
    });
  });

  it("applyInspectionReportClientFilters narrows by building or level", () => {
    const submissions = [
      row({ submissionId: "a2", building: "A", level: "2" }),
      row({ submissionId: "a3", building: "A", level: "3" }),
      row({ submissionId: "b1", building: "B", level: "1" }),
    ];

    const buildingA = applyInspectionReportClientFilters(
      submissions,
      makeFilters({ selectedBuildings: new Set(["A"]) }),
    );
    expect(buildingA.map((s) => s.submissionId)).toEqual(["a2", "a3"]);

    const levelOnly = applyInspectionReportClientFilters(
      submissions,
      makeFilters({ selectedLevels: new Set(["A::3"]) }),
    );
    expect(levelOnly.map((s) => s.submissionId)).toEqual(["a3"]);

    expect(
      submissionMatchesLocationHierarchyFilter(
        row({ submissionId: "x", building: "A", level: "2" }),
        new Set(["B"]),
        new Set(["A::2"]),
      ),
    ).toBe(true);

    expect(hasActiveInspectionReportLocationFilters(new Set(), new Set())).toBe(false);
    expect(hasActiveInspectionReportLocationFilters(new Set(["A"]), new Set())).toBe(true);
  });

  it("countInspectionReportFilterBadge counts active location hierarchy once", () => {
    const filters = makeFilters({
      selectedBuildings: new Set(["A"]),
      selectedLevels: new Set(["B::1"]),
    });
    expect(countInspectionReportFilterBadge(filters, new Set(), [])).toBe(1);
  });
});
