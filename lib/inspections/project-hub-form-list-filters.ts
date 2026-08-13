import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

export const PROJECT_HUB_INITIAL_VISIBLE = 3;

export type ProjectHubFormDatePreset = "all" | "last7" | "last30" | "last90" | "custom";

export interface ProjectHubFormFilterInput {
  selectedFormNames: ReadonlySet<string>;
  allFormNames: readonly string[];
  fromDate: string;
  toDate: string;
  now?: Date;
}

function startOfDayIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar range for date preset chips (YYYY-MM-DD). */
export function projectHubDatePresetRange(
  preset: Exclude<ProjectHubFormDatePreset, "all" | "custom">,
  now: Date = new Date(),
): { fromDate: string; toDate: string } {
  const days = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
  const toDate = startOfDayIso(now);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - (days - 1));
  return { fromDate: startOfDayIso(from), toDate };
}

export function isAllFormNamesSelected(
  selected: ReadonlySet<string>,
  all: readonly string[],
): boolean {
  if (all.length === 0) return true;
  return all.every((name) => selected.has(name));
}

export function submissionInProjectHubDateRange(
  submittedAt: string,
  fromDate: string,
  toDate: string,
): boolean {
  const time = new Date(submittedAt).getTime();
  if (fromDate) {
    const fromMs = new Date(`${fromDate}T00:00:00`).getTime();
    if (time < fromMs) return false;
  }
  if (toDate) {
    const toMs = new Date(`${toDate}T23:59:59.999`).getTime();
    if (time > toMs) return false;
  }
  return true;
}

/** Unique form names for filter checkboxes, preserving first-seen order. */
export function uniqueProjectHubFormNames(submissions: InspectionSubmission[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const sub of submissions) {
    const name = sub.formNameSnapshot?.trim() || "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function filterProjectHubFormSubmissions(
  submissions: InspectionSubmission[],
  input: ProjectHubFormFilterInput,
): InspectionSubmission[] {
  const allSelected = isAllFormNamesSelected(input.selectedFormNames, input.allFormNames);
  return submissions.filter((sub) => {
    const name = sub.formNameSnapshot?.trim() || "";
    if (!allSelected && name && !input.selectedFormNames.has(name)) {
      return false;
    }
    return submissionInProjectHubDateRange(sub.submittedAt, input.fromDate, input.toDate);
  });
}

export function countActiveProjectHubFormFilters(input: ProjectHubFormFilterInput): number {
  let count = 0;
  if (input.fromDate || input.toDate) count += 1;
  if (
    input.allFormNames.length > 0 &&
    !isAllFormNamesSelected(input.selectedFormNames, input.allFormNames)
  ) {
    count += 1;
  }
  return count;
}

export function buildProjectHubFormsExportFilterSummary(
  input: ProjectHubFormFilterInput,
  filteredCount: number,
): string {
  const parts: string[] = [];
  if (input.fromDate || input.toDate) {
    const from = input.fromDate || "…";
    const to = input.toDate || "…";
    parts.push(`${from} – ${to}`);
  }
  if (
    input.allFormNames.length > 0 &&
    !isAllFormNamesSelected(input.selectedFormNames, input.allFormNames)
  ) {
    parts.push([...input.selectedFormNames].join(", "));
  }
  if (parts.length === 0) {
    return `${filteredCount} project form${filteredCount === 1 ? "" : "s"}`;
  }
  return parts.join(" · ");
}

/** Metadata row for bulk PDF export via inspections-report/export-pdf. */
export function projectHubFormExportRecords(submissions: InspectionSubmission[]) {
  return submissions.map((sub, index) => ({
    submissionId: sub.id,
    seqNumber: index + 1,
    scopeTypeName: "Project",
    unit: "—",
    building: "",
    level: "",
    area: "",
    phase: "",
    imName: null,
    installTeamName: null,
    attemptLabel: "Submitted",
    totalDeficiencies: sub.deficiencyCount,
  }));
}
