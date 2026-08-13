import type { SubmissionRow } from "@/app/api/projects/[id]/inspections-report/route";
import {
  fetchInspectionsReport,
  parseInspectionReportDateParam,
} from "@/lib/inspections/fetch-inspections-report";
import { loadAccessibleProjects } from "@/lib/reports/portfolio-progress-service";

export interface GlobalInspectionSubmissionRow extends SubmissionRow {
  scopeTypeCode: string;
  scopeTypeName: string;
  projectId: string;
  projectName: string;
}

export interface GlobalInspectionsReport {
  submissions: GlobalInspectionSubmissionRow[];
}

export interface FetchGlobalInspectionsReportOptions {
  role: string;
  fromDate?: Date | null;
  toDate?: Date | null;
}

export async function fetchGlobalInspectionsReport(
  options: FetchGlobalInspectionsReportOptions
): Promise<GlobalInspectionsReport> {
  const { role, fromDate = null, toDate = null } = options;
  const projects = await loadAccessibleProjects(role);

  if (projects.length === 0) {
    return { submissions: [] };
  }

  const submissions: GlobalInspectionSubmissionRow[] = [];

  for (const project of projects) {
    const report = await fetchInspectionsReport(project.id, { fromDate, toDate });
    for (const scopeType of report.scopeTypes) {
      for (const row of scopeType.submissions) {
        submissions.push({
          ...row,
          scopeTypeCode: scopeType.scopeTypeCode,
          scopeTypeName: scopeType.scopeTypeName,
          projectId: project.id,
          projectName: project.projectName?.trim() || project.id,
        });
      }
    }
  }

  submissions.sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
  submissions.forEach((row, index) => {
    row.seqNumber = index + 1;
  });

  return { submissions };
}

export { parseInspectionReportDateParam };
