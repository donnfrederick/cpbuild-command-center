import type {
  BySeverity,
  InspectionsReport,
  ScopeTypeInspections,
} from "@/app/api/projects/[id]/inspections-report/route";
import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";

function emptySev(): BySeverity {
  return { Minor: 0, Major: 0, Critical: 0 };
}

/** Groups flat cross-project submissions into the same shape as the project report API. */
export function buildInspectionsReportFromGlobalSubmissions(
  submissions: GlobalInspectionSubmissionRow[]
): InspectionsReport {
  const scopeMap = new Map<string, ScopeTypeInspections>();

  for (const submission of submissions) {
    const code = submission.scopeTypeCode;
    let bucket = scopeMap.get(code);
    if (!bucket) {
      bucket = {
        scopeTypeCode: code,
        scopeTypeName: submission.scopeTypeName,
        totalInspections: 0,
        passCount: 0,
        failCount: 0,
        totalDeficiencies: 0,
        bySeverity: emptySev(),
        submissions: [],
      };
      scopeMap.set(code, bucket);
    }

    bucket.submissions.push(submission);
    bucket.totalInspections++;
    if (submission.outcome === "PASS") bucket.passCount++;
    else if (submission.outcome === "FAIL") bucket.failCount++;
    bucket.totalDeficiencies += submission.totalDeficiencies;
    for (const sec of submission.sections) {
      for (const q of sec.failingQuestions) {
        for (const d of q.deficiencies) {
          const sev = d.severity as keyof BySeverity | undefined;
          if (sev && sev in bucket.bySeverity) {
            bucket.bySeverity[sev] += d.count;
          }
        }
      }
    }
  }

  const scopeTypes = [...scopeMap.values()].sort(
    (a, b) => b.totalDeficiencies - a.totalDeficiencies
  );

  return {
    projectStartedAt: new Date(0).toISOString(),
    availableInstallers: [],
    scopeTypes,
  };
}
