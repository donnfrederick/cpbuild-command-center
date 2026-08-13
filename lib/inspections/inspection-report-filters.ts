import type {
  ScopeTypeInspections,
  SubmissionRow,
} from "@/app/api/projects/[id]/inspections-report/route";
import {
  inspectionTypeNameForCode,
  REPORT_INSPECTION_TYPE_DEFINITIONS,
  type InspectionTypeCode,
} from "@/lib/inspections/inspection-type-codes";
import {
  buildUnitsBuildingLevelFilterOptions,
  unitsBuildingKey,
  unitsLevelFilterKey,
} from "@/lib/units-location-filter-options";

/** @deprecated Use multi-select scope codes; kept for tests migrating from single-select. */
export const ALL_INSPECTION_SCOPES = "__all__";

export function allInspectionScopeCodes(
  scopeTypes: readonly Pick<ScopeTypeInspections, "scopeTypeCode">[]
): string[] {
  return scopeTypes.map((scopeType) => scopeType.scopeTypeCode);
}

export function isAllScopeCodesSelected(
  selectedScopeCodes: ReadonlySet<string>,
  allScopeCodes: readonly string[]
): boolean {
  return isUnsetOrAllSelected(selectedScopeCodes, allScopeCodes);
}

export function scopeSelectionLabel(
  scopeTypes: readonly ScopeTypeInspections[],
  selectedScopeCodes: ReadonlySet<string>
): string {
  const allCodes = allInspectionScopeCodes(scopeTypes);
  return multiSelectFilterLabel("All scopes", selectedScopeCodes, allCodes, "scopes");
}

export function isAllValuesSelected(
  selectedValues: ReadonlySet<string>,
  allValues: readonly string[]
): boolean {
  if (allValues.length === 0) return true;
  return (
    selectedValues.size === allValues.length &&
    allValues.every((value) => selectedValues.has(value))
  );
}

/** Empty selection means "all" — nothing checked in the UI until the user narrows. */
export function isUnsetOrAllSelected(
  selectedValues: ReadonlySet<string>,
  allValues: readonly string[]
): boolean {
  if (allValues.length === 0) return true;
  if (selectedValues.size === 0) return true;
  return isAllValuesSelected(selectedValues, allValues);
}

export function matchesMultiSelectFilter(
  value: string,
  selectedValues: ReadonlySet<string>,
  allValues: readonly string[]
): boolean {
  if (allValues.length === 0) return true;
  if (isUnsetOrAllSelected(selectedValues, allValues)) return true;
  return selectedValues.has(value);
}

export function multiSelectFilterLabel(
  allLabel: string,
  selectedValues: ReadonlySet<string>,
  allValues: readonly string[],
  pluralLabel: string
): string {
  if (isUnsetOrAllSelected(selectedValues, allValues)) {
    return allLabel;
  }
  const names = allValues.filter((value) => selectedValues.has(value));
  if (names.length <= 2) return names.join(", ");
  return `${names.length} ${pluralLabel}`;
}

export type InspectionReportSubmissionRow = SubmissionRow & {
  scopeTypeName: string;
  scopeTypeCode: string;
  projectId?: string;
  projectName?: string;
};

export interface InspectionReportClientFilters {
  filterResult: "all" | "PASS" | "FAIL";
  selectedIMs: ReadonlySet<string>;
  allIMs: readonly string[];
  selectedPMs: ReadonlySet<string>;
  allPMs: readonly string[];
  selectedInspectors: ReadonlySet<string>;
  allInspectors: readonly string[];
  selectedInstallers: ReadonlySet<string>;
  allInstallers: readonly string[];
  filterLocation: string;
  selectedBuildings: ReadonlySet<string>;
  selectedLevels: ReadonlySet<string>;
  selectedInspectionTypeCodes: ReadonlySet<string>;
  allInspectionTypeCodes: readonly string[];
  selectedCalibrationModes: ReadonlySet<string>;
  allCalibrationModes: readonly string[];
}

export type InspectionReportFilterOmit =
  | "im"
  | "pm"
  | "inspector"
  | "installer"
  | "inspectionType"
  | "calibration"
  | "location";

/** Non-calibration inspection attempts vs calibration records. */
export const INSPECTION_REPORT_RECORD_INSPECTION = "inspection";
export const INSPECTION_REPORT_RECORD_CALIBRATION = "calibration";

export function isMeaningfulLocationValue(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && trimmed !== "0";
}

export function submissionPhase(
  submission: { shipPhase?: string; buildPhase?: string },
): string {
  const ship = (submission.shipPhase ?? "").trim();
  if (isMeaningfulLocationValue(ship)) return ship;
  return (submission.buildPhase ?? "").trim();
}

export type InspectionReportLocationField = "building" | "area" | "phase" | "level";

export function submissionLocationFieldValue(
  submission: SubmissionRow,
  field: InspectionReportLocationField
): string {
  if (field === "phase") return submissionPhase(submission);
  return (submission[field] ?? "").trim();
}

export function formatSubmissionLocationSubtext(
  submission: Pick<SubmissionRow, "building" | "level"> & {
    area?: string;
    shipPhase?: string;
    buildPhase?: string;
  },
): string | null {
  const parts: string[] = [];
  if (isMeaningfulLocationValue(submission.building)) {
    parts.push(`Bldg ${submission.building.trim()}`);
  }
  const phase = submissionPhase(submission);
  if (isMeaningfulLocationValue(phase)) parts.push(`Phase ${phase}`);
  if (isMeaningfulLocationValue(submission.area)) {
    parts.push(`Area ${(submission.area ?? "").trim()}`);
  }
  if (isMeaningfulLocationValue(submission.level)) {
    parts.push(`Level ${submission.level.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function collectLocationFieldValues(
  submissions: readonly SubmissionRow[],
  field: InspectionReportLocationField
): string[] {
  const values = new Set<string>();
  for (const submission of submissions) {
    const value = submissionLocationFieldValue(submission, field);
    if (isMeaningfulLocationValue(value)) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function buildInspectionReportLocationFilterOptions(
  submissions: readonly Pick<SubmissionRow, "building" | "level">[],
) {
  return buildUnitsBuildingLevelFilterOptions(
    submissions.map((submission) => ({
      building: submission.building,
      level: submission.level,
    })),
  );
}

export function hasActiveInspectionReportLocationFilters(
  selectedBuildings: ReadonlySet<string>,
  selectedLevels: ReadonlySet<string>,
): boolean {
  return selectedBuildings.size > 0 || selectedLevels.size > 0;
}

export function submissionMatchesLocationHierarchyFilter(
  submission: Pick<SubmissionRow, "building" | "level">,
  selectedBuildings: ReadonlySet<string>,
  selectedLevels: ReadonlySet<string>,
): boolean {
  if (!hasActiveInspectionReportLocationFilters(selectedBuildings, selectedLevels)) {
    return true;
  }
  const buildingKey = unitsBuildingKey(submission.building);
  const levelKey = unitsLevelFilterKey(submission.building, submission.level);
  return selectedBuildings.has(buildingKey) || selectedLevels.has(levelKey);
}

function normalizePersonName(name: string): string {
  return name.replace(/^\[(Seed|SEED)\]\s*/i, "").trim();
}

export function submissionInspectorName(submission: SubmissionRow): string {
  return normalizePersonName(submission.submittedByName || "");
}

export function submissionIMName(submission: SubmissionRow): string {
  return normalizePersonName(submission.imName ?? "");
}

export function submissionPMName(submission: SubmissionRow): string {
  return normalizePersonName(submission.pmName ?? "");
}

/** Sentinel for submissions with no install manager or project manager assigned. */
export const INSPECTION_REPORT_PERSON_UNASSIGNED = "";

export function collectSubmissionIMNames(submissions: readonly SubmissionRow[]): string[] {
  const names = new Set<string>();
  for (const submission of submissions) {
    names.add(submissionIMName(submission));
  }
  return sortPersonFilterNames([...names]);
}

export function collectSubmissionPMNames(submissions: readonly SubmissionRow[]): string[] {
  const names = new Set<string>();
  for (const submission of submissions) {
    names.add(submissionPMName(submission));
  }
  return sortPersonFilterNames([...names]);
}

export function collectSubmissionInspectorNames(submissions: readonly SubmissionRow[]): string[] {
  const names = new Set<string>();
  for (const submission of submissions) {
    names.add(submissionInspectorName(submission));
  }
  return sortPersonFilterNames([...names]);
}

function sortPersonFilterNames(names: string[]): string[] {
  return names.sort((a, b) => {
    if (a === INSPECTION_REPORT_PERSON_UNASSIGNED) return 1;
    if (b === INSPECTION_REPORT_PERSON_UNASSIGNED) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

export function personFilterOptionLabel(name: string, unassignedLabel: string): string {
  return name === INSPECTION_REPORT_PERSON_UNASSIGNED ? unassignedLabel : name;
}

export function submissionInstallerName(submission: SubmissionRow): string {
  return normalizePersonName(submission.installTeamName ?? "");
}

const REPORT_TYPE_ORDER = new Map<string, number>(
  REPORT_INSPECTION_TYPE_DEFINITIONS.map((row, index) => [row.code, index])
);

export function collectInspectionTypeCodes(submissions: readonly SubmissionRow[]): string[] {
  const codes = new Set<string>();
  for (const submission of submissions) {
    const code = submission.inspectionTypeCode;
    if (!code || code === "CALIBRATION_INSPECTION") continue;
    codes.add(code);
  }
  return [...codes].sort((a, b) => {
    const orderA = REPORT_TYPE_ORDER.get(a) ?? 999;
    const orderB = REPORT_TYPE_ORDER.get(b) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
}

export function inspectionTypeFilterLabel(code: string): string {
  if (REPORT_TYPE_ORDER.has(code)) {
    return inspectionTypeNameForCode(code as InspectionTypeCode);
  }
  return code;
}

export function inspectionTypeSelectionLabel(
  selectedInspectionTypeCodes: ReadonlySet<string>,
  allInspectionTypeCodes: readonly string[]
): string {
  return multiSelectFilterLabel(
    "All types",
    selectedInspectionTypeCodes,
    allInspectionTypeCodes,
    "types"
  );
}

export function submissionMatchesInspectionTypeFilter(
  submission: SubmissionRow,
  filters: Pick<InspectionReportClientFilters, "selectedInspectionTypeCodes" | "allInspectionTypeCodes">
): boolean {
  if (filters.allInspectionTypeCodes.length === 0) return true;
  if (isUnsetOrAllSelected(filters.selectedInspectionTypeCodes, filters.allInspectionTypeCodes)) {
    return true;
  }
  return filters.selectedInspectionTypeCodes.has(submission.inspectionTypeCode);
}

export function submissionCalibrationFilterValue(
  submission: Pick<SubmissionRow, "isCalibration">
): typeof INSPECTION_REPORT_RECORD_CALIBRATION | typeof INSPECTION_REPORT_RECORD_INSPECTION {
  return submission.isCalibration
    ? INSPECTION_REPORT_RECORD_CALIBRATION
    : INSPECTION_REPORT_RECORD_INSPECTION;
}

export function collectCalibrationFilterValues(submissions: readonly SubmissionRow[]): string[] {
  const values = new Set<string>();
  for (const submission of submissions) {
    values.add(submissionCalibrationFilterValue(submission));
  }
  const ordered: string[] = [];
  if (values.has(INSPECTION_REPORT_RECORD_INSPECTION)) {
    ordered.push(INSPECTION_REPORT_RECORD_INSPECTION);
  }
  if (values.has(INSPECTION_REPORT_RECORD_CALIBRATION)) {
    ordered.push(INSPECTION_REPORT_RECORD_CALIBRATION);
  }
  return ordered;
}

export function submissionMatchesCalibrationFilter(
  submission: Pick<SubmissionRow, "isCalibration">,
  filters: Pick<InspectionReportClientFilters, "selectedCalibrationModes" | "allCalibrationModes">
): boolean {
  if (filters.allCalibrationModes.length === 0) return true;
  if (isUnsetOrAllSelected(filters.selectedCalibrationModes, filters.allCalibrationModes)) {
    return true;
  }
  return filters.selectedCalibrationModes.has(submissionCalibrationFilterValue(submission));
}

export type InspectionReportQuickFilter = "all" | "passed" | "failed" | "calibration";

/** Which summary pill matches the current result + calibration filter combo, if any. */
export function detectInspectionReportQuickFilter(
  filterResult: "all" | "PASS" | "FAIL",
  selectedCalibrationModes: ReadonlySet<string>,
  allCalibrationModes: readonly string[],
): InspectionReportQuickFilter | null {
  if (
    filterResult === "all" &&
    isUnsetOrAllSelected(selectedCalibrationModes, allCalibrationModes)
  ) {
    return "all";
  }
  if (
    filterResult === "PASS" &&
    selectedCalibrationModes.size === 1 &&
    selectedCalibrationModes.has(INSPECTION_REPORT_RECORD_INSPECTION)
  ) {
    return "passed";
  }
  if (
    filterResult === "FAIL" &&
    selectedCalibrationModes.size === 1 &&
    selectedCalibrationModes.has(INSPECTION_REPORT_RECORD_INSPECTION)
  ) {
    return "failed";
  }
  if (
    filterResult === "all" &&
    selectedCalibrationModes.size === 1 &&
    selectedCalibrationModes.has(INSPECTION_REPORT_RECORD_CALIBRATION)
  ) {
    return "calibration";
  }
  return null;
}

export function inspectionReportQuickFilterPatch(
  kind: InspectionReportQuickFilter,
  _allCalibrationModes: readonly string[],
): {
  filterResult: "all" | "PASS" | "FAIL";
  selectedCalibrationModes: Set<string>;
} {
  switch (kind) {
    case "passed":
      return {
        filterResult: "PASS",
        selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
      };
    case "failed":
      return {
        filterResult: "FAIL",
        selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_INSPECTION]),
      };
    case "calibration":
      return {
        filterResult: "all",
        selectedCalibrationModes: new Set([INSPECTION_REPORT_RECORD_CALIBRATION]),
      };
    default:
      return {
        filterResult: "all",
        selectedCalibrationModes: new Set<string>(),
      };
  }
}

export interface InspectionScopeOption {
  code: string;
  name: string;
}

export function collectInspectionScopeOptions(
  submissions: readonly Pick<InspectionReportSubmissionRow, "scopeTypeCode" | "scopeTypeName">[]
): InspectionScopeOption[] {
  const byCode = new Map<string, string>();
  for (const submission of submissions) {
    const code = (submission.scopeTypeCode ?? "").trim();
    if (!code) continue;
    const name = (submission.scopeTypeName ?? "").trim() || code;
    byCode.set(code, name);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function submissionMatchesScopeFilter(
  submission: Pick<InspectionReportSubmissionRow, "scopeTypeCode">,
  selectedScopeCodes: ReadonlySet<string>,
  allScopeCodes: readonly string[]
): boolean {
  if (allScopeCodes.length === 0) return true;
  if (isUnsetOrAllSelected(selectedScopeCodes, allScopeCodes)) return true;
  return selectedScopeCodes.has(submission.scopeTypeCode);
}

export function filterGlobalInspectionSubmissions<
  T extends SubmissionRow & Pick<InspectionReportSubmissionRow, "scopeTypeCode">,
>(
  submissions: readonly T[],
  filters: {
    selectedInspectionTypeCodes: ReadonlySet<string>;
    selectedScopeCodes: ReadonlySet<string>;
  }
): T[] {
  const allInspectionTypeCodes = collectInspectionTypeCodes(submissions);
  const allScopeCodes = collectInspectionScopeOptions(submissions).map((option) => option.code);

  return submissions.filter(
    (submission) =>
      submissionMatchesInspectionTypeFilter(submission, {
        selectedInspectionTypeCodes: filters.selectedInspectionTypeCodes,
        allInspectionTypeCodes,
      }) &&
      submissionMatchesScopeFilter(
        submission,
        filters.selectedScopeCodes,
        allScopeCodes
      )
  );
}

export interface InspectionReportStats {
  total: number;
  passed: number;
  failed: number;
  complete: number;
  calibrations: number;
  clearInspections: number;
  totalDeficiencies: number;
}

export function applyInspectionReportClientFilters(
  submissions: SubmissionRow[],
  filters: InspectionReportClientFilters,
  omit?: readonly InspectionReportFilterOmit[]
): SubmissionRow[] {
  const skipIM = omit?.includes("im") ?? false;
  const skipPM = omit?.includes("pm") ?? false;
  const skipInspector = omit?.includes("inspector") ?? false;
  const skipInstaller = omit?.includes("installer") ?? false;
  const skipInspectionType = omit?.includes("inspectionType") ?? false;
  const skipCalibration = omit?.includes("calibration") ?? false;
  const skipLocation = omit?.includes("location") ?? false;

  return submissions.filter((sub) => {
    if (filters.filterResult !== "all" && sub.outcome !== filters.filterResult) return false;

    if (!skipIM && filters.allIMs.length > 0) {
      if (
        !matchesMultiSelectFilter(submissionIMName(sub), filters.selectedIMs, filters.allIMs)
      ) {
        return false;
      }
    }

    if (!skipPM && filters.allPMs.length > 0) {
      if (
        !matchesMultiSelectFilter(submissionPMName(sub), filters.selectedPMs, filters.allPMs)
      ) {
        return false;
      }
    }

    if (!skipInspector && filters.allInspectors.length > 0) {
      if (
        !matchesMultiSelectFilter(
          submissionInspectorName(sub),
          filters.selectedInspectors,
          filters.allInspectors
        )
      ) {
        return false;
      }
    }

    if (!skipInstaller && filters.allInstallers.length > 0) {
      if (
        !matchesMultiSelectFilter(
          submissionInstallerName(sub),
          filters.selectedInstallers,
          filters.allInstallers
        )
      ) {
        return false;
      }
    }

    if (!skipInspectionType) {
      if (!submissionMatchesInspectionTypeFilter(sub, filters)) return false;
    }

    if (!skipCalibration) {
      if (!submissionMatchesCalibrationFilter(sub, filters)) return false;
    }

    if (!skipLocation) {
      if (
        !submissionMatchesLocationHierarchyFilter(
          sub,
          filters.selectedBuildings,
          filters.selectedLevels,
        )
      ) {
        return false;
      }
    }

    if (filters.filterLocation) {
      const q = filters.filterLocation.toLowerCase();
      const phase = submissionPhase(sub);
      if (
        !(sub.unit || "").toLowerCase().includes(q) &&
        !(sub.building || "").toLowerCase().includes(q) &&
        !(sub.level || "").toLowerCase().includes(q) &&
        !(sub.area || "").toLowerCase().includes(q) &&
        !phase.toLowerCase().includes(q) &&
        !submissionIMName(sub).toLowerCase().includes(q) &&
        !submissionPMName(sub).toLowerCase().includes(q) &&
        !submissionInspectorName(sub).toLowerCase().includes(q) &&
        !(sub.inspectionTypeName || "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
}

export function computeInspectionReportStats(
  submissions: readonly SubmissionRow[]
): InspectionReportStats {
  let passed = 0;
  let failed = 0;
  let complete = 0;
  let calibrations = 0;
  let totalDeficiencies = 0;

  for (const sub of submissions) {
    if (sub.isCalibration) {
      calibrations++;
    } else if (sub.outcome === "PASS") {
      passed++;
    } else if (sub.outcome === "FAIL") {
      failed++;
    } else if (sub.outcome === "COMPLETE") {
      complete++;
    }
    totalDeficiencies += sub.totalDeficiencies;
  }

  return {
    total: submissions.length,
    passed,
    failed,
    complete,
    calibrations,
    clearInspections: submissions.length - calibrations,
    totalDeficiencies,
  };
}

export function countInspectionReportFilterBadge(
  filters: InspectionReportClientFilters,
  selectedScopeCodes: ReadonlySet<string>,
  allScopeCodes: readonly string[],
  selectedProjectIds: ReadonlySet<string> = new Set(),
  allProjectIds: readonly string[] = []
): number {
  let count = 0;
  if (allScopeCodes.length > 0 && !isUnsetOrAllSelected(selectedScopeCodes, allScopeCodes)) {
    count++;
  }
  if (allProjectIds.length > 0 && !isUnsetOrAllSelected(selectedProjectIds, allProjectIds)) {
    count++;
  }
  if (filters.filterResult !== "all") count++;
  if (hasActiveInspectionReportLocationFilters(filters.selectedBuildings, filters.selectedLevels)) {
    count++;
  }
  if (filters.filterLocation.trim().length > 0) count++;
  if (filters.allIMs.length > 0 && !isUnsetOrAllSelected(filters.selectedIMs, filters.allIMs)) {
    count++;
  }
  if (filters.allPMs.length > 0 && !isUnsetOrAllSelected(filters.selectedPMs, filters.allPMs)) {
    count++;
  }
  if (
    filters.allInspectors.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInspectors, filters.allInspectors)
  ) {
    count++;
  }
  if (
    filters.allInstallers.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInstallers, filters.allInstallers)
  ) {
    count++;
  }
  if (
    filters.allInspectionTypeCodes.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInspectionTypeCodes, filters.allInspectionTypeCodes)
  ) {
    count++;
  }
  if (
    filters.allCalibrationModes.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedCalibrationModes, filters.allCalibrationModes)
  ) {
    count++;
  }
  return count;
}

export function hasActiveInspectionReportClientFilters(
  filters: InspectionReportClientFilters
): boolean {
  const imActive =
    filters.allIMs.length > 0 && !isUnsetOrAllSelected(filters.selectedIMs, filters.allIMs);
  const pmActive =
    filters.allPMs.length > 0 && !isUnsetOrAllSelected(filters.selectedPMs, filters.allPMs);
  const inspectorActive =
    filters.allInspectors.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInspectors, filters.allInspectors);
  const installerActive =
    filters.allInstallers.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInstallers, filters.allInstallers);
  const typeActive =
    filters.allInspectionTypeCodes.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedInspectionTypeCodes, filters.allInspectionTypeCodes);
  const calibrationActive =
    filters.allCalibrationModes.length > 0 &&
    !isUnsetOrAllSelected(filters.selectedCalibrationModes, filters.allCalibrationModes);
  const locationActive = hasActiveInspectionReportLocationFilters(
    filters.selectedBuildings,
    filters.selectedLevels,
  );

  return (
    filters.filterResult !== "all" ||
    imActive ||
    pmActive ||
    inspectorActive ||
    installerActive ||
    typeActive ||
    calibrationActive ||
    locationActive ||
    filters.filterLocation.trim().length > 0
  );
}

export function isAllInspectionScopesSelected(scopeCode: string): boolean {
  return scopeCode === ALL_INSPECTION_SCOPES;
}

function scopeTypesForSelection(
  scopeTypes: readonly ScopeTypeInspections[],
  selectedScopeCodes: ReadonlySet<string>
): ScopeTypeInspections[] {
  const allCodes = allInspectionScopeCodes(scopeTypes);
  if (isUnsetOrAllSelected(selectedScopeCodes, allCodes)) return [...scopeTypes];
  return scopeTypes.filter((scopeType) => selectedScopeCodes.has(scopeType.scopeTypeCode));
}

export function flattenInspectionReportSubmissions(
  scopeTypes: readonly ScopeTypeInspections[],
  filters: InspectionReportClientFilters,
  selectedScopeCodes: ReadonlySet<string>,
  selectedProjectIds: ReadonlySet<string> = new Set(),
  allProjectIds: readonly string[] = []
): InspectionReportSubmissionRow[] {
  const scopedTypes = scopeTypesForSelection(scopeTypes, selectedScopeCodes);

  const rows = scopedTypes.flatMap((scopeType) =>
    applyInspectionReportClientFilters(scopeType.submissions, filters).map((submission) => ({
      ...submission,
      scopeTypeName: scopeType.scopeTypeName,
      scopeTypeCode: scopeType.scopeTypeCode,
    }))
  );

  const projectFiltered =
    allProjectIds.length === 0
      ? rows
      : rows.filter((submission) => {
          const projectId = (submission as InspectionReportSubmissionRow).projectId ?? "";
          if (!projectId) return true;
          return matchesMultiSelectFilter(projectId, selectedProjectIds, allProjectIds);
        });

  return projectFiltered.map((submission, index) => ({
    ...submission,
    seqNumber: index + 1,
  }));
}

/** @deprecated Single-select API — prefer selectedScopeCodes Set. */
export function flattenInspectionReportSubmissionsByCode(
  scopeTypes: readonly ScopeTypeInspections[],
  filters: InspectionReportClientFilters,
  scopeCode: string
): InspectionReportSubmissionRow[] {
  if (isAllInspectionScopesSelected(scopeCode)) {
    return flattenInspectionReportSubmissions(
      scopeTypes,
      filters,
      new Set(allInspectionScopeCodes(scopeTypes))
    );
  }
  return flattenInspectionReportSubmissions(scopeTypes, filters, new Set([scopeCode]));
}

export function countUnfilteredInspectionReportSubmissions(
  scopeTypes: readonly ScopeTypeInspections[],
  selectedScopeCodes: ReadonlySet<string>,
  selectedProjectIds: ReadonlySet<string> = new Set(),
  allProjectIds: readonly string[] = []
): number {
  return flattenInspectionReportSubmissions(
    scopeTypes,
    {
      filterResult: "all",
      selectedIMs: new Set(),
      allIMs: [],
      selectedPMs: new Set(),
      allPMs: [],
      selectedInspectors: new Set(),
      allInspectors: [],
      selectedInstallers: new Set(),
      allInstallers: [],
      filterLocation: "",
      selectedBuildings: new Set(),
      selectedLevels: new Set(),
      selectedInspectionTypeCodes: new Set(),
      allInspectionTypeCodes: [],
      selectedCalibrationModes: new Set(),
      allCalibrationModes: [],
    },
    selectedScopeCodes,
    selectedProjectIds,
    allProjectIds
  ).length;
}

/** @deprecated Single-select API — prefer selectedScopeCodes Set. */
export function countUnfilteredInspectionReportSubmissionsByCode(
  scopeTypes: readonly ScopeTypeInspections[],
  scopeCode: string
): number {
  if (isAllInspectionScopesSelected(scopeCode)) {
    return countUnfilteredInspectionReportSubmissions(
      scopeTypes,
      new Set(allInspectionScopeCodes(scopeTypes))
    );
  }
  return countUnfilteredInspectionReportSubmissions(scopeTypes, new Set([scopeCode]));
}

export type InspectionReportSortKey =
  | "seqNumber"
  | "project"
  | "unit"
  | "attempt"
  | "inspectionType"
  | "scope"
  | "im"
  | "pm"
  | "inspector"
  | "subcontractor"
  | "submittedAt"
  | "outcome"
  | "totalDeficiencies";

export type InspectionReportSortDir = "asc" | "desc";

function compareSortStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareAttemptRows(a: SubmissionRow, b: SubmissionRow): number {
  if (a.isCalibration !== b.isCalibration) {
    return a.isCalibration ? 1 : -1;
  }
  return (a.attemptNumber ?? 0) - (b.attemptNumber ?? 0);
}

export function compareInspectionReportRows(
  a: InspectionReportSubmissionRow,
  b: InspectionReportSubmissionRow,
  sortKey: InspectionReportSortKey
): number {
  switch (sortKey) {
    case "seqNumber":
      return a.seqNumber - b.seqNumber;
    case "project":
      return compareSortStrings(a.projectName ?? "", b.projectName ?? "");
    case "unit":
      return compareSortStrings(a.unit || "", b.unit || "");
    case "attempt":
      return compareAttemptRows(a, b);
    case "inspectionType":
      return compareSortStrings(a.inspectionTypeName || "", b.inspectionTypeName || "");
    case "scope":
      return compareSortStrings(a.scopeTypeName || "", b.scopeTypeName || "");
    case "im":
      return compareSortStrings(submissionIMName(a), submissionIMName(b));
    case "pm":
      return compareSortStrings(submissionPMName(a), submissionPMName(b));
    case "inspector":
      return compareSortStrings(submissionInspectorName(a), submissionInspectorName(b));
    case "subcontractor":
      return compareSortStrings(submissionInstallerName(a), submissionInstallerName(b));
    case "submittedAt":
      return a.submittedAt.localeCompare(b.submittedAt);
    case "outcome":
      return compareSortStrings(a.outcome || "", b.outcome || "");
    case "totalDeficiencies":
      return a.totalDeficiencies - b.totalDeficiencies;
    default:
      return 0;
  }
}

export function sortInspectionReportRows(
  rows: readonly InspectionReportSubmissionRow[],
  sortKey: InspectionReportSortKey,
  sortDir: InspectionReportSortDir
): InspectionReportSubmissionRow[] {
  return [...rows].sort((a, b) => {
    const cmp = compareInspectionReportRows(a, b, sortKey);
    return sortDir === "asc" ? cmp : -cmp;
  });
}

export function defaultInspectionReportSortDir(
  sortKey: InspectionReportSortKey
): InspectionReportSortDir {
  return sortKey === "totalDeficiencies" || sortKey === "submittedAt" || sortKey === "seqNumber"
    ? "desc"
    : "asc";
}
