import "server-only";

import { db } from "@/lib/db";
import type { FieldDailyReportPdfMediaRef } from "@/lib/field-daily-report/pdf-export-types";
import type {
  FieldDailyReportExportMediaContext,
  StatusUpdatePhotoRow,
} from "@/lib/field-daily-report/pdf-export-media";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";
import { dayBoundsInOrgTz } from "@/lib/field-daily-report/timezone";
import { fieldDailyInspectionSubmissionSelect } from "@/lib/field-daily-report/hydrate-inspection-details";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import { listInspectionPayloadImageRefs } from "@/lib/pdf/inspection-submission-pdf";

export type { FieldDailyReportExportMediaContext, StatusUpdatePhotoRow };

/** Status-update album photos captured on the report day for this project. */
export async function loadStatusUpdatePhotoRowsForExport(options: {
  projectId: string;
  reportDate: string;
  activityThrough?: Date;
}): Promise<StatusUpdatePhotoRow[]> {
  const { start, end } = dayBoundsInOrgTz(options.reportDate);
  const through = options.activityThrough ?? end;

  return db.mediaAttachment.findMany({
    where: {
      unitPhotoProjectId: options.projectId,
      unitPhotoSourceType: "status_update",
      mimeType: { startsWith: "image/" },
      createdAt: { gte: start, lte: through },
    },
    select: {
      storageUrl: true,
      storageKey: true,
      mimeType: true,
      caption: true,
      unitPhotoUnitRef: true,
      unitPhotoSourceLabel: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Embedded inspection / clear-inspection photos keyed by submission id. */
export async function loadInspectionImagesForExport(
  submissionIds: string[],
): Promise<Map<string, FieldDailyReportPdfMediaRef[]>> {
  const uniqueIds = [...new Set(submissionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const submissions = await db.inspectionSubmission.findMany({
    where: { id: { in: uniqueIds } },
    select: fieldDailyInspectionSubmissionSelect,
  });

  const map = new Map<string, FieldDailyReportPdfMediaRef[]>();
  for (const submission of submissions) {
    const hydrated = await hydrateInspectionSubmissionView(submission);
    const refs = listInspectionPayloadImageRefs(hydrated.payload).map((ref) => ({
      storageUrl: ref.storageUrl,
      storageKey: ref.storageKey,
      mimeType: ref.mimeType ?? "image/jpeg",
      caption: null as string | null,
    }));
    if (refs.length > 0) {
      map.set(submission.id, refs);
    }
  }
  return map;
}

function collectSubmissionIds(snapshot: FieldDailyReportProjectSnapshot): string[] {
  const ids = new Set<string>();
  for (const group of snapshot.inspections.summaryGroups) {
    for (const item of group.items) {
      if (item.submissionId) ids.add(item.submissionId);
    }
  }
  return [...ids];
}

/** Load status-update and inspection media for PDF export. */
export async function buildFieldDailyReportExportMediaContext(options: {
  projectId: string;
  reportDate: string;
  snapshot: FieldDailyReportProjectSnapshot;
  activityThrough?: Date;
}): Promise<FieldDailyReportExportMediaContext> {
  const [statusPhotoRows, inspectionImagesBySubmissionId] = await Promise.all([
    loadStatusUpdatePhotoRowsForExport({
      projectId: options.projectId,
      reportDate: options.reportDate,
      activityThrough: options.activityThrough,
    }),
    loadInspectionImagesForExport(collectSubmissionIds(options.snapshot)),
  ]);

  return { statusPhotoRows, inspectionImagesBySubmissionId };
}
