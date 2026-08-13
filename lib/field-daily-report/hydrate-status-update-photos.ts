import "server-only";

import { loadStatusUpdatePhotoRowsForExport } from "@/lib/field-daily-report/hydrate-export-media";
import type { FieldDailyReportPdfMediaRef } from "@/lib/field-daily-report/pdf-export-types";
import {
  statusPhotosForUnitEntry,
  type StatusPhotoMatchContext,
} from "@/lib/field-daily-report/pdf-export-media";
import type {
  FieldDailyReportProjectSnapshot,
  FieldDailyReportStatusUnitEntry,
  FieldDailyReportStatusUnitEntryAttachment,
} from "@/lib/field-daily-report/types";

function snapshotHasStatusUnitEntries(snapshot: FieldDailyReportProjectSnapshot): boolean {
  if (snapshot.statusUpdates.summaryGroups.some((g) => (g.unitEntries?.length ?? 0) > 0)) {
    return true;
  }
  if (snapshot.teamsOnSite?.summaryGroups.some((g) => g.unitEntries.length > 0)) return true;
  if (snapshot.subcontractors?.summaryGroups.some((g) => g.unitEntries.length > 0)) return true;
  return false;
}

function toStatusUpdateAttachments(
  photos: FieldDailyReportPdfMediaRef[],
): FieldDailyReportStatusUnitEntryAttachment[] {
  return photos.map((photo, index) => ({
    id: photo.storageKey ?? photo.storageUrl ?? `status-photo-${index}`,
    storageUrl: photo.storageUrl,
    storageKey: photo.storageKey,
    mimeType: photo.mimeType,
    caption: photo.caption,
  }));
}

function hydrateUnitEntries(
  entries: FieldDailyReportStatusUnitEntry[],
  statusPhotoRows: Awaited<ReturnType<typeof loadStatusUpdatePhotoRowsForExport>>,
  context: StatusPhotoMatchContext,
): FieldDailyReportStatusUnitEntry[] {
  return entries.map((entry) => {
    const photos = statusPhotosForUnitEntry(statusPhotoRows, entry, context);
    if (photos.length === 0) return entry;
    return {
      ...entry,
      statusUpdateAttachments: toStatusUpdateAttachments(photos),
    };
  });
}

/** Attach status-update album photos to unit entries for UI and PDF matching. */
export async function hydrateStatusUpdatePhotos(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
  options: { reportDate: string; activityThrough?: Date },
): Promise<FieldDailyReportProjectSnapshot> {
  if (!snapshotHasStatusUnitEntries(snapshot)) return snapshot;

  const statusPhotoRows = await loadStatusUpdatePhotoRowsForExport({
    projectId,
    reportDate: options.reportDate,
    activityThrough: options.activityThrough,
  });
  if (statusPhotoRows.length === 0) return snapshot;

  return {
    ...snapshot,
    statusUpdates: {
      ...snapshot.statusUpdates,
      summaryGroups: snapshot.statusUpdates.summaryGroups.map((group) => ({
        ...group,
        unitEntries: hydrateUnitEntries(group.unitEntries ?? [], statusPhotoRows, {
          statusLabel: group.statusLabel,
          scopeStage: group.scopeStage ? String(group.scopeStage) : undefined,
          scopeStatus: group.scopeStatus ? String(group.scopeStatus) : undefined,
        }),
      })),
    },
    teamsOnSite: snapshot.teamsOnSite,
    subcontractors: snapshot.subcontractors,
  };
}
