import type { ClearInspectionStatus, InspectionOutcome, PrismaClient } from "@prisma/client";
import {
  categoryToInspectionTypeCode,
  isInspectionHistoryCategory,
  isScopeInspectionStatusCategory,
} from "@/lib/inspections/inspection-type-codes";
import { getInspectionTypeIdByCode } from "@/lib/inspections/inspection-type";

/** Map submission outcome to clear_inspections.status (future: inspections.status). */
export function outcomeToInspectionHistoryStatus(
  outcome: InspectionOutcome,
): ClearInspectionStatus {
  return outcome === "FAIL" ? "FAILED" : "PASSED";
}

/** Whether a form submission should create a row in clear_inspections (future: inspections). */
export function shouldCreateInspectionHistoryRow(input: {
  scopeRowId: string | null | undefined;
  category: string | null | undefined;
}): boolean {
  if (!input.scopeRowId) return false;
  return isInspectionHistoryCategory(input.category);
}

/** Non-calibration formal inspections update scope inspectionStatus when scoped to a row. */
export function shouldSyncScopeInspectionStatus(input: {
  category: string | null | undefined;
  scopeRowId: string | null | undefined;
}): boolean {
  if (!input.scopeRowId) return false;
  return isScopeInspectionStatusCategory(input.category);
}

type InspectionHistoryClient = Pick<PrismaClient, "clearInspection" | "inspectionType">;

export async function createInspectionHistoryRow(
  client: InspectionHistoryClient,
  input: {
    scopeRowId: string;
    inspectionSubmissionId: string;
    category: string | null | undefined;
    outcome: InspectionOutcome;
    inspectedById: string | null;
    calibratedAgainstClearInspectionId?: string | null;
  },
): Promise<void> {
  const inspectionTypeId = await getInspectionTypeIdByCode(
    client,
    categoryToInspectionTypeCode(input.category),
  );
  await client.clearInspection.create({
    data: {
      rowId: input.scopeRowId,
      status: outcomeToInspectionHistoryStatus(input.outcome),
      inspectionSubmissionId: input.inspectionSubmissionId,
      inspectionTypeId,
      inspectedById: input.inspectedById,
      ...(input.calibratedAgainstClearInspectionId
        ? { calibratedAgainstClearInspectionId: input.calibratedAgainstClearInspectionId }
        : {}),
    },
  });
}

export async function upsertInspectionHistoryRow(
  client: InspectionHistoryClient,
  input: {
    inspectionSubmissionId: string;
    scopeRowId: string;
    category: string | null | undefined;
    outcome: InspectionOutcome;
    inspectedById: string | null;
  },
): Promise<void> {
  const inspectionTypeId = await getInspectionTypeIdByCode(
    client,
    categoryToInspectionTypeCode(input.category),
  );
  const status = outcomeToInspectionHistoryStatus(input.outcome);
  await client.clearInspection.upsert({
    where: { inspectionSubmissionId: input.inspectionSubmissionId },
    create: {
      rowId: input.scopeRowId,
      status,
      inspectionSubmissionId: input.inspectionSubmissionId,
      inspectionTypeId,
      inspectedById: input.inspectedById,
    },
    update: {
      status,
      deletedAt: null,
      inspectionTypeId,
    },
  });
}
