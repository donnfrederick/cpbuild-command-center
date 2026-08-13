import { unitLocationKey } from "@/lib/field-daily-report/unit-entry-target";
import type { FieldDailyReportPdfMediaRef } from "@/lib/field-daily-report/pdf-export-types";
import type { FieldDailyReportStatusUnitEntry } from "@/lib/field-daily-report/types";
import { parseSourceLabel } from "@/lib/offline/status-photo-queue";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import { isImageMimeType } from "@/lib/pdf/field-media-mime-infer";

export interface StatusUpdatePhotoRow {
  storageUrl: string;
  storageKey: string | null;
  mimeType: string;
  caption: string | null;
  unitPhotoUnitRef: string | null;
  unitPhotoSourceLabel: string | null;
}

export interface FieldDailyReportExportMediaContext {
  statusPhotoRows: StatusUpdatePhotoRow[];
  inspectionImagesBySubmissionId: Map<string, FieldDailyReportPdfMediaRef[]>;
}

function toPdfMediaRef(row: {
  storageUrl: string;
  storageKey?: string | null;
  mimeType: string;
  caption?: string | null;
}): FieldDailyReportPdfMediaRef {
  return {
    storageUrl: row.storageUrl,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    caption: row.caption,
  };
}

function imageAttachmentsFromIssueOrObs(
  attachments: { storageUrl: string; storageKey?: string | null; mimeType: string; caption?: string | null }[],
): FieldDailyReportPdfMediaRef[] {
  return attachments
    .filter((a) => isImageMimeType(a.mimeType))
    .map((a) => toPdfMediaRef(a));
}

function normalizeStatusLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface StatusPhotoMatchContext {
  /** Parent status group label, e.g. "In Assembly". */
  statusLabel?: string;
  scopeStage?: string;
  scopeStatus?: string;
}

function statusLabelMatchesPhoto(
  photoStatusLabel: string,
  context: StatusPhotoMatchContext,
): boolean {
  const photoNorm = normalizeStatusLabel(photoStatusLabel);
  if (!photoNorm) return false;

  if (context.statusLabel && normalizeStatusLabel(context.statusLabel) === photoNorm) {
    return true;
  }

  if (context.scopeStage && context.scopeStatus) {
    const fromGroup = combinedOptionDisplay(
      context.scopeStage as ScopeStage,
      context.scopeStatus as ScopeStatus,
    ).label;
    if (normalizeStatusLabel(fromGroup) === photoNorm) return true;
  }

  return false;
}

function scopeLabelMatchesEntry(scopePart: string, entryScopeName: string | undefined): boolean {
  if (!scopePart.trim()) return true;
  if (!entryScopeName?.trim()) return true;
  const code = scopePart.trim().toLowerCase();
  const name = entryScopeName.trim().toLowerCase();
  return name.startsWith(code) || name.includes(code) || code.startsWith(name.slice(0, 3));
}

export function statusPhotoMatchesEntry(
  photo: Pick<StatusUpdatePhotoRow, "unitPhotoUnitRef" | "unitPhotoSourceLabel">,
  entry: FieldDailyReportStatusUnitEntry,
  context?: StatusPhotoMatchContext,
): boolean {
  const unitRef = photo.unitPhotoUnitRef?.trim();
  if (!unitRef) return false;
  if (unitRef !== unitLocationKey(entry)) return false;

  const label = photo.unitPhotoSourceLabel?.trim();
  if (!label) return false;

  const { scopeName: photoScope, statusDisplayLabel: photoStatus } = parseSourceLabel(label);
  if (!scopeLabelMatchesEntry(photoScope, entry.scopeName)) return false;

  if (!context?.statusLabel && !context?.scopeStage) return false;

  return statusLabelMatchesPhoto(photoStatus, context);
}

export function statusPhotosForUnitEntry(
  rows: StatusUpdatePhotoRow[],
  entry: FieldDailyReportStatusUnitEntry,
  context?: StatusPhotoMatchContext,
): FieldDailyReportPdfMediaRef[] {
  return rows
    .filter((row) => statusPhotoMatchesEntry(row, entry, context))
    .map((row) => toPdfMediaRef(row));
}

/** Prefer hydrated snapshot attachments (UI path), then match export media rows. */
export function statusImagesForPdfEntry(
  rows: StatusUpdatePhotoRow[],
  entry: FieldDailyReportStatusUnitEntry,
  context?: StatusPhotoMatchContext,
): FieldDailyReportPdfMediaRef[] {
  const hydrated = (entry.statusUpdateAttachments ?? [])
    .filter((a) => isImageMimeType(a.mimeType))
    .map((a) => toPdfMediaRef(a));
  if (hydrated.length > 0) return hydrated;
  return statusPhotosForUnitEntry(rows, entry, context);
}

export function issueImagesFromSnapshotItem(item: {
  issueRecord?: { attachments: { storageUrl: string; storageKey?: string | null; mimeType: string; caption?: string | null }[] };
}): FieldDailyReportPdfMediaRef[] {
  if (!item.issueRecord?.attachments?.length) return [];
  return imageAttachmentsFromIssueOrObs(item.issueRecord.attachments);
}

export function observationImagesFromSnapshotItem(item: {
  observationRecord?: { attachments: { storageUrl: string; storageKey?: string | null; mimeType: string; caption?: string | null }[] };
}): FieldDailyReportPdfMediaRef[] {
  if (!item.observationRecord?.attachments?.length) return [];
  return imageAttachmentsFromIssueOrObs(item.observationRecord.attachments);
}
