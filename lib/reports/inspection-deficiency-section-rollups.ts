import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  filterGlobalInspectionSubmissions,
  personFilterOptionLabel,
  submissionIMName,
  submissionInstallerName,
  submissionPMName,
} from "@/lib/inspections/inspection-report-filters";

export interface InspectionDeficiencySectionRow {
  id: string;
  sectionTitle: string;
  occurrenceCount: number;
  /** Distinct inspections that contributed at least one deficiency in this section. */
  inspectionCount: number;
}

export type InspectionDeficiencyGroupDimension =
  | "scope"
  | "project"
  | "subcontractor"
  | "pm"
  | "im";

export type InspectionDeficiencyView = "overview" | InspectionDeficiencyGroupDimension;

export interface InspectionDeficiencyGroupRow {
  id: string;
  name: string;
  totalOccurrences: number;
  sections: InspectionDeficiencySectionRow[];
}

/** Catch-all form sections always sort last when deficiency counts tie. */
export function isCatchAllDeficiencySectionTitle(title: string): boolean {
  const normalized = title.trim().replace(/:+$/, "").toUpperCase();
  return normalized === "OTHER" || normalized === "GENERAL";
}

export function compareDeficiencySectionTitles(a: string, b: string): number {
  const aCatchAll = isCatchAllDeficiencySectionTitle(a);
  const bCatchAll = isCatchAllDeficiencySectionTitle(b);
  if (aCatchAll && !bCatchAll) return 1;
  if (!aCatchAll && bCatchAll) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function collectSectionTitlesFromSubmissions(
  submissions: readonly GlobalInspectionSubmissionRow[]
): string[] {
  const titles = new Set<string>();
  for (const submission of submissions) {
    for (const section of submission.sections) {
      if (section.sectionTitle.trim()) titles.add(section.sectionTitle.trim());
    }
  }
  return [...titles].sort(compareDeficiencySectionTitles);
}

export function rollupInspectionDeficienciesBySection(
  submissions: readonly GlobalInspectionSubmissionRow[],
  options?: { includeZeroSections?: boolean }
): InspectionDeficiencySectionRow[] {
  const includeZeroSections = options?.includeZeroSections ?? true;
  const buckets = new Map<
    string,
    { sectionTitle: string; occurrenceCount: number; inspectionIds: Set<string> }
  >();

  if (includeZeroSections) {
    for (const title of collectSectionTitlesFromSubmissions(submissions)) {
      buckets.set(title, {
        sectionTitle: title,
        occurrenceCount: 0,
        inspectionIds: new Set(),
      });
    }
  }

  for (const submission of submissions) {
    for (const section of submission.sections) {
      const title = section.sectionTitle.trim() || "General";
      const occurrences = section.totalOccurrences;
      if (occurrences <= 0 && !includeZeroSections) continue;

      const bucket = buckets.get(title) ?? {
        sectionTitle: title,
        occurrenceCount: 0,
        inspectionIds: new Set<string>(),
      };
      bucket.occurrenceCount += occurrences;
      if (occurrences > 0) bucket.inspectionIds.add(submission.submissionId);
      buckets.set(title, bucket);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      id: bucket.sectionTitle,
      sectionTitle: bucket.sectionTitle,
      occurrenceCount: bucket.occurrenceCount,
      inspectionCount: bucket.inspectionIds.size,
    }))
    .sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) {
        return b.occurrenceCount - a.occurrenceCount;
      }
      return compareDeficiencySectionTitles(a.sectionTitle, b.sectionTitle);
    });
}

export function getDeficiencyGroupKey(
  submission: GlobalInspectionSubmissionRow,
  dimension: InspectionDeficiencyGroupDimension
): { id: string; rawName: string } {
  switch (dimension) {
    case "scope":
      return {
        id: (submission.scopeTypeCode ?? "").trim(),
        rawName: (submission.scopeTypeName ?? "").trim() || (submission.scopeTypeCode ?? "").trim(),
      };
    case "im":
      return { id: submissionIMName(submission), rawName: submissionIMName(submission) };
    case "pm":
      return { id: submissionPMName(submission), rawName: submissionPMName(submission) };
    case "subcontractor":
      return {
        id: submissionInstallerName(submission),
        rawName: submissionInstallerName(submission),
      };
    case "project":
      return {
        id: submission.projectId,
        rawName: submission.projectName?.trim() || submission.projectId,
      };
  }
}

export function rollupInspectionDeficienciesByGroup(
  submissions: readonly GlobalInspectionSubmissionRow[],
  dimension: InspectionDeficiencyGroupDimension,
  unassignedLabel: string
): InspectionDeficiencyGroupRow[] {
  const buckets = new Map<string, GlobalInspectionSubmissionRow[]>();

  for (const submission of submissions) {
    const { id } = getDeficiencyGroupKey(submission, dimension);
    const group = buckets.get(id) ?? [];
    group.push(submission);
    buckets.set(id, group);
  }

  return [...buckets.entries()]
    .map(([id, groupSubmissions]) => {
      const { rawName } = getDeficiencyGroupKey(groupSubmissions[0]!, dimension);
      const name =
        dimension === "project" || dimension === "scope"
          ? rawName || id
          : personFilterOptionLabel(rawName, unassignedLabel);
      const sections = rollupInspectionDeficienciesBySection(groupSubmissions, {
        includeZeroSections: true,
      });
      const totalOccurrences = sections.reduce((sum, row) => sum + row.occurrenceCount, 0);
      return { id, name, totalOccurrences, sections };
    })
    .filter((group) => group.sections.length > 0)
    .sort((a, b) => {
      if (b.totalOccurrences !== a.totalOccurrences) {
        return b.totalOccurrences - a.totalOccurrences;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export function filterSubmissionsForDeficiencyReport(
  submissions: readonly GlobalInspectionSubmissionRow[],
  filters: {
    selectedInspectionTypeCodes: ReadonlySet<string>;
    selectedScopeCodes: ReadonlySet<string>;
  }
): GlobalInspectionSubmissionRow[] {
  return filterGlobalInspectionSubmissions(submissions, filters);
}
