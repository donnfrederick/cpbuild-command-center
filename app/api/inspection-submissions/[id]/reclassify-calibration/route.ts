import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { buildInspectionActivityLocationMetadata } from "@/lib/inspections/unit-inspection-ref";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import {
  ReclassifyCalibrationError,
  reclassifyClearSubmissionToCalibration,
} from "@/lib/inspections/reclassify-submission-calibration";

const BodySchema = z.object({
  calibratedAgainstSubmissionId: z.string().min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.CALIBRATE_INSPECTION)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.inspectionSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      unitId: true,
      scopeRowId: true,
      scopeTypeCode: true,
      form: { select: { name: true, category: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const readBlock = await enforceProjectReadVisibility(existing.projectId, effective);
  if (readBlock) return readBlock;

  try {
    const inspectedById = await resolveSessionToDbUserId(effective.user);
    const result = await reclassifyClearSubmissionToCalibration(db, {
      submissionId: id,
      calibratedAgainstSubmissionId: parsed.data.calibratedAgainstSubmissionId,
      inspectedById,
    });

    void (async () => {
      try {
        const actorId = effective.user.id ?? null;
        const userName = await resolveActorName(actorId);
        const scopeRow = existing.scopeRowId
          ? await db.projectRow.findUnique({
              where: { id: existing.scopeRowId },
              select: {
                building: true,
                level: true,
                unit: true,
                scopeType: { select: { name: true } },
              },
            })
          : null;
        const locationMeta = buildInspectionActivityLocationMetadata({
          scopeRowId: existing.scopeRowId,
          unitId: existing.unitId,
          scopeRow,
          scopeTypeCode: existing.scopeTypeCode,
        });
        void logActivity(existing.projectId, actorId, userName, {
          eventType: "INSPECTION_SUBMITTED",
          submissionId: existing.id,
          formName: existing.form?.name ?? "Inspection",
          category: "CALIBRATION_INSPECTION",
          outcome: "PASS",
          deficiencyCount: 0,
          failedQuestionCount: 0,
          totalDeficiencyCount: 0,
          attemptNumber: 1,
          isEdit: true,
          ...locationMeta,
        });
      } catch {
        // Activity logging must not fail the request.
      }
    })();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ReclassifyCalibrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
