import type { ActivityEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildInspectionActivityLocationMetadata } from "@/lib/inspections/unit-inspection-ref";

interface ActivityWithMetadata {
  eventType: ActivityEventType;
  metadata: Prisma.JsonValue;
}

function asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataNeedsLocationHydration(metadata: Record<string, unknown>): boolean {
  return ![metadata.building, metadata.level, metadata.unit].some(
    (part) => typeof part === "string" && part.trim().length > 0,
  );
}

export async function hydrateInspectionActivityMetadata<T extends ActivityWithMetadata>(
  events: T[],
): Promise<T[]> {
  const inspectionEvents = events.filter((event) => event.eventType === "INSPECTION_SUBMITTED");
  if (inspectionEvents.length === 0) return events;

  const submissionIds = [
    ...new Set(
      inspectionEvents
        .map((event) => asRecord(event.metadata)?.submissionId)
        .filter(
          (submissionId): submissionId is string =>
            typeof submissionId === "string" && submissionId.length > 0,
        ),
    ),
  ];

  if (submissionIds.length === 0) return events;

  const submissions = await db.inspectionSubmission.findMany({
    where: { id: { in: submissionIds } },
    select: {
      id: true,
      templateSnapshot: true,
      unitId: true,
      scopeRowId: true,
      scopeTypeCode: true,
    },
  });

  const submissionById = new Map(submissions.map((submission) => [submission.id, submission] as const));

  const scopeRowIds = [
    ...new Set(
      submissions
        .map((submission) => submission.scopeRowId)
        .filter((rowId): rowId is string => typeof rowId === "string" && rowId.length > 0),
    ),
  ];

  const scopeRowsById = scopeRowIds.length
    ? new Map(
        (
          await db.projectRow.findMany({
            where: { id: { in: scopeRowIds } },
            select: {
              id: true,
              building: true,
              level: true,
              unit: true,
              scopeType: { select: { name: true } },
            },
          })
        ).map((row) => [row.id, row] as const),
      )
    : new Map();

  return events.map((event) => {
    if (event.eventType !== "INSPECTION_SUBMITTED") return event;
    const metadata = asRecord(event.metadata);
    const submissionId = metadata?.submissionId;
    if (typeof submissionId !== "string") return event;

    const submission = submissionById.get(submissionId);
    if (!submission) return event;

    let nextMetadata = metadata ?? {};

    const snapshot = asRecord(submission.templateSnapshot);
    if (snapshot?.category === "CALIBRATION_INSPECTION") {
      nextMetadata = { ...nextMetadata, category: "CALIBRATION_INSPECTION" };
    }

    if (metadata && metadataNeedsLocationHydration(metadata)) {
      const scopeRow = submission.scopeRowId
        ? scopeRowsById.get(submission.scopeRowId) ?? null
        : null;
      nextMetadata = {
        ...nextMetadata,
        ...buildInspectionActivityLocationMetadata({
          scopeRowId: submission.scopeRowId,
          unitId: submission.unitId,
          scopeRow,
          scopeTypeCode: submission.scopeTypeCode,
        }),
      };
    }

    if (nextMetadata === metadata) return event;

    return {
      ...event,
      metadata: nextMetadata,
    } as T;
  });
}
