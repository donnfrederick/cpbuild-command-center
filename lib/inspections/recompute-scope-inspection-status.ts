import type { InspectionStatus, PrismaClient } from "@prisma/client";
import { isScopeInspectionStatusCategory, categoryFromSubmissionSnapshot } from "@/lib/inspections/inspection-type-codes";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";

type RecomputeClient = Pick<PrismaClient, "inspectionSubmission" | "projectRow">;

function outcomeToRowInspectionStatus(
  outcome: "PASS" | "FAIL" | "COMPLETE",
): InspectionStatus {
  return outcome === "FAIL" ? "FAILED" : "PASSED";
}

/**
 * Sets project_rows.inspectionStatus from the newest non-calibration submission
 * on this scope (including BACKFILL). Null when none remain.
 */
export async function recomputeScopeInspectionStatusFromSubmissions(
  scopeRowId: string,
  client: RecomputeClient,
): Promise<InspectionStatus | null> {
  const submissions = await client.inspectionSubmission.findMany({
    where: { scopeRowId },
    orderBy: { submittedAt: "desc" },
    select: {
      outcome: true,
      source: true,
      templateSnapshot: true,
      form: { select: { category: true } },
    },
  });

  const latest = submissions.find((sub) => {
    if (sub.source === "BACKFILL") return true;
    if (categoryFromSubmissionSnapshot(sub.templateSnapshot) === "CALIBRATION_INSPECTION") {
      return false;
    }
    const category = resolveGridSubmissionCategory(
      sub.templateSnapshot,
      sub.form?.category,
    );
    return isScopeInspectionStatusCategory(category);
  });

  const nextStatus: InspectionStatus | null = latest
    ? outcomeToRowInspectionStatus(latest.outcome)
    : null;

  await client.projectRow.update({
    where: { id: scopeRowId },
    data: { inspectionStatus: nextStatus },
  });

  return nextStatus;
}
