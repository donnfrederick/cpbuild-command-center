import type { PrismaClient } from "@prisma/client";

export class CalibrationTargetError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CalibrationTargetError";
    this.status = status;
  }
}

type CalibrationTargetClient = Pick<PrismaClient, "clearInspection">;

/** Resolve the clear_inspections row a calibration is reviewing. */
export async function resolveCalibratedAgainstClearInspectionId(
  client: CalibrationTargetClient,
  input: {
    isCalibration: boolean;
    scopeRowId: string | null | undefined;
    calibratedAgainstSubmissionId: string | null | undefined;
  },
): Promise<string | null> {
  if (!input.isCalibration) return null;

  if (!input.scopeRowId) {
    throw new CalibrationTargetError(
      "scopeRowId is required for calibration inspections",
      400,
    );
  }

  if (!input.calibratedAgainstSubmissionId) {
    throw new CalibrationTargetError(
      "calibratedAgainstSubmissionId is required for calibration inspections",
      400,
    );
  }

  const target = await client.clearInspection.findFirst({
    where: {
      inspectionSubmissionId: input.calibratedAgainstSubmissionId,
      deletedAt: null,
      rowId: input.scopeRowId,
      inspectionType: { code: "CLEAR_INSPECTION" },
    },
    select: { id: true },
  });

  if (!target) {
    throw new CalibrationTargetError(
      "Referenced clear inspection not found on this scope",
      422,
    );
  }

  return target.id;
}

/** Latest non-deleted clear inspection on a scope (for seed/backfill helpers). */
export async function findLatestClearInspectionIdForScope(
  client: CalibrationTargetClient,
  scopeRowId: string,
  before?: Date,
): Promise<string | null> {
  const row = await client.clearInspection.findFirst({
    where: {
      rowId: scopeRowId,
      deletedAt: null,
      inspectionType: { code: "CLEAR_INSPECTION" },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}
