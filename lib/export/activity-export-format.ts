// Shared activity export formatting — no Puppeteer or PDF dependencies.

import { buildActivityEventDescription } from "@/lib/activity-event-summary";
import { activityLocationChipParts } from "@/lib/activity-unit-chip";

export interface ActivityEventForExport {
  id: string;
  eventType: string;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  /** Set in multi-project (dashboard) exports; omitted for single-project exports. */
  projectId?: string;
}

/** @deprecated Prefer {@link ActivityEventForExport}. */
export type ActivityEventForPdf = ActivityEventForExport;

export const ACTIVITY_EVENT_META: Record<string, { label: string; dotColor: string; bg: string }> = {
  SCOPE_STATUS_UPDATED:      { label: "Status Updated",       dotColor: "#1d4ed8", bg: "#eff6ff" },
  SCOPE_STATUS_BULK_UPDATED: { label: "Bulk Status Update",   dotColor: "#1d4ed8", bg: "#eff6ff" },
  SCOPE_STATUS_BULK_UNDONE:  { label: "Bulk Status Undo",     dotColor: "#6b7280", bg: "#f9fafb" },
  SCOPE_INSPECTION_BULK_UPDATED: { label: "Bulk Inspection Update", dotColor: "#1d4ed8", bg: "#eff6ff" },
  SCOPE_INSPECTION_UPDATED:  { label: "Inspection Updated",   dotColor: "#1d4ed8", bg: "#eff6ff" },
  ISSUE_CREATED:             { label: "Issue Reported",       dotColor: "#b45309", bg: "#fffbeb" },
  ISSUE_BULK_CREATED:        { label: "Bulk Issues Reported", dotColor: "#b45309", bg: "#fffbeb" },
  ISSUE_UPDATED:             { label: "Issue Updated",        dotColor: "#b45309", bg: "#fffbeb" },
  ISSUE_DELETED:             { label: "Issue Deleted",        dotColor: "#dc2626", bg: "#fef2f2" },
  ISSUE_RESOLVED:            { label: "Issue Resolved",       dotColor: "#15803d", bg: "#f0fdf4" },
  ISSUE_REOPENED:            { label: "Issue Reopened",       dotColor: "#6b7280", bg: "#f9fafb" },
  ISSUE_ANNOTATION_UPDATED:  { label: "Issue Markup",         dotColor: "#7c3aed", bg: "#f5f3ff" },
  CLEAR_INSPECTION_SET:      { label: "Inspection Set",       dotColor: "#0e7490", bg: "#ecfeff" },
  CLEAR_INSPECTION_DELETED:  { label: "Inspection Deleted",   dotColor: "#dc2626", bg: "#fef2f2" },
  INSPECTION_BACKFILL_SET:   { label: "Inspection Backfilled", dotColor: "#15803d", bg: "#f0fdf4" },
  INSPECTION_BACKFILL_DELETED: { label: "Backfill Removed",   dotColor: "#6b7280", bg: "#f9fafb" },
  INSPECTION_SUBMITTED:      { label: "Inspection Submitted", dotColor: "#1d4ed8", bg: "#eff6ff" },
  INSPECTION_SYNC_FAILED:    { label: "Sync Failed",          dotColor: "#dc2626", bg: "#fef2f2" },
  MUTATION_SYNC_FAILED:      { label: "Upload Failed",        dotColor: "#dc2626", bg: "#fef2f2" },
  OBSERVATION_CREATED:       { label: "Observation Added",    dotColor: "#166534", bg: "#f0fdf4" },
  OBSERVATION_BULK_CREATED:  { label: "Bulk Observations",    dotColor: "#166534", bg: "#f0fdf4" },
  OBSERVATION_UPDATED:       { label: "Observation Updated",  dotColor: "#166534", bg: "#f0fdf4" },
  OBSERVATION_IMAGE_VERSION_ADDED: { label: "Image Marked",  dotColor: "#7c3aed", bg: "#f5f3ff" },
  OBSERVATION_ANNOTATION_UPDATED:  { label: "Markup Updated", dotColor: "#7c3aed", bg: "#f5f3ff" },
  UNIT_ROW_CREATED:          { label: "Rows Added",           dotColor: "#1d4ed8", bg: "#eff6ff" },
  UNIT_ROW_DELETED:          { label: "Row Deleted",          dotColor: "#dc2626", bg: "#fef2f2" },
  UNIT_ROWS_BULK_DELETED:    { label: "Rows Deleted",         dotColor: "#dc2626", bg: "#fef2f2" },
  UNIT_INSTALLER_BULK_UPDATED: { label: "Installer Updated",  dotColor: "#1d4ed8", bg: "#eff6ff" },
  SCOPE_SUBCONTRACTOR_UPDATED: { label: "Subcontractor Updated", dotColor: "#1d4ed8", bg: "#eff6ff" },
  UPM_ROW_UPDATED:           { label: "Builder Updated",      dotColor: "#1d4ed8", bg: "#eff6ff" },
  SUB_SCOPE_INSTANCE_UPDATED: { label: "Sub-scope Updated",   dotColor: "#1d4ed8", bg: "#eff6ff" },
  FIELD_MEDIA_UPLOAD_RATE_LIMITED: { label: "Upload Limit",  dotColor: "#dc2626", bg: "#fef2f2" },
  UNIT_PHOTO_UPLOADED:       { label: "Photo Uploaded",     dotColor: "#1d4ed8", bg: "#eff6ff" },
  FIELD_DAILY_DAILY_MANPOWER_SET: { label: "Daily Manpower Set", dotColor: "#1d4ed8", bg: "#eff6ff" },
};

export function buildActivityExportSummary(event: ActivityEventForExport): string {
  const createdAt =
    event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt);
  return buildActivityEventDescription({
    eventType: event.eventType,
    metadata: event.metadata,
    createdAt,
  });
}

export function getActivityEventTypeLabel(eventType: string): string {
  return ACTIVITY_EVENT_META[eventType]?.label ?? eventType;
}

export function getActivityExportLocation(event: ActivityEventForExport): string {
  return getLocation(event);
}

function getLocation(event: ActivityEventForExport): string {
  const m = event.metadata;
  const chip = activityLocationChipParts(m);
  if (chip.length) return chip.join(" › ");
  const parts = [(m.building as string | null), (m.level as string | null), (m.unit as string | null)].filter(Boolean);
  if (parts.length) return parts.join(" › ");
  const unitRef = m.unitRef as string | undefined;
  if (unitRef) return unitRef.replace(/\|/g, " › ");
  return "";
}
