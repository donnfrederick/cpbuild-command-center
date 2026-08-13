import type { PrismaClient } from "@prisma/client";
import { buildInspectionCategoryStub } from "@/lib/inspections/reporting-normalization";
import { resolvedSubmissionCategory } from "@/lib/inspections/inspection-type-codes";
import { getInspectionTypeIdByCode } from "@/lib/inspections/inspection-type";
import { resolveCalibratedAgainstClearInspectionId } from "@/lib/inspections/calibration-target";

export class ReclassifyCalibrationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReclassifyCalibrationError";
    this.status = status;
  }
}

type ReclassifyClient = Pick<
  PrismaClient,
  "inspectionSubmission" | "clearInspection" | "inspectionType"
>;

export async function reclassifyClearSubmissionToCalibration(
  client: ReclassifyClient,
  input: {
    submissionId: string;
    calibratedAgainstSubmissionId: string;
    inspectedById: string | null;
  },
): Promise<{ submissionId: string; calibratedAgainstSubmissionId: string }> {
  const submission = await client.inspectionSubmission.findUnique({
    where: { id: input.submissionId },
    include: {
      form: { select: { category: true, name: true } },
      clearInspection: {
        select: {
          id: true,
          rowId: true,
          deletedAt: true,
          inspectionType: { select: { code: true } },
        },
      },
    },
  });

  if (!submission) {
    throw new ReclassifyCalibrationError("Submission not found", 404);
  }

  if (!submission.scopeRowId) {
    throw new ReclassifyCalibrationError("Scope is required to reclassify a submission", 422);
  }

  const storedCategory = resolvedSubmissionCategory(
    submission.templateSnapshot,
    submission.form?.category,
  );
  if (storedCategory === "CALIBRATION_INSPECTION") {
    throw new ReclassifyCalibrationError("Submission is already a calibration inspection", 422);
  }
  if (storedCategory !== "CLEAR_INSPECTION" && submission.source !== "BACKFILL") {
    throw new ReclassifyCalibrationError("Only clear inspections can be reclassified to calibration", 422);
  }

  const existingCalibration = await client.clearInspection.findFirst({
    where: {
      rowId: submission.scopeRowId,
      deletedAt: null,
      inspectionType: { code: "CALIBRATION_INSPECTION" },
    },
    select: { id: true },
  });
  if (existingCalibration) {
    throw new ReclassifyCalibrationError(
      "This scope already has a calibration inspection",
      409,
    );
  }

  if (input.calibratedAgainstSubmissionId === input.submissionId) {
    throw new ReclassifyCalibrationError(
      "Choose a different clear inspection to calibrate against",
      422,
    );
  }

  const calibratedAgainstClearInspectionId = await resolveCalibratedAgainstClearInspectionId(
    client,
    {
      isCalibration: true,
      scopeRowId: submission.scopeRowId,
      calibratedAgainstSubmissionId: input.calibratedAgainstSubmissionId,
    },
  );

  const calibrationTypeId = await getInspectionTypeIdByCode(
    client,
    "CALIBRATION_INSPECTION",
  );

  await client.inspectionSubmission.update({
    where: { id: submission.id },
    data: {
      templateSnapshot: buildInspectionCategoryStub("CALIBRATION_INSPECTION"),
    },
  });

  if (submission.clearInspection && submission.clearInspection.deletedAt == null) {
    await client.clearInspection.update({
      where: { id: submission.clearInspection.id },
      data: {
        inspectionTypeId: calibrationTypeId,
        calibratedAgainstClearInspectionId,
        inspectedById: input.inspectedById ?? undefined,
      },
    });
  } else {
    await client.clearInspection.create({
      data: {
        rowId: submission.scopeRowId,
        status: submission.outcome === "FAIL" ? "FAILED" : "PASSED",
        inspectionSubmissionId: submission.id,
        inspectionTypeId: calibrationTypeId,
        inspectedById: input.inspectedById,
        calibratedAgainstClearInspectionId,
      },
    });
  }

  return {
    submissionId: submission.id,
    calibratedAgainstSubmissionId: input.calibratedAgainstSubmissionId,
  };
}
