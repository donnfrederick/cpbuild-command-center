import { ActivityEventType } from "@prisma/client";
import type { ActivityLogRow } from "@/lib/field-daily-report/build-project-snapshot";

function scopeRowIdFromMetadata(metadata: Record<string, unknown>): string | null {
  const rowId = metadata.rowId;
  if (typeof rowId === "string" && rowId.trim()) return rowId.trim();
  const scopeRowId = metadata.scopeRowId;
  if (typeof scopeRowId === "string" && scopeRowId.trim()) return scopeRowId.trim();
  return null;
}

/**
 * Collapse duplicate inspection activity for field daily rollups:
 * - One INSPECTION_SUBMITTED row per submissionId (latest wins — edits/resubmits)
 * - Drop SCOPE_INSPECTION_UPDATED when a form submission already logged for that scope row
 */
export function dedupeInspectionEventsForFieldDaily(events: ActivityLogRow[]): ActivityLogRow[] {
  const submittedScopeRowIds = new Set<string>();
  const latestSubmittedBySubmissionId = new Map<string, ActivityLogRow>();

  for (const event of events) {
    if (event.eventType !== ActivityEventType.INSPECTION_SUBMITTED) continue;

    const submissionId = event.metadata.submissionId;
    if (typeof submissionId === "string" && submissionId.trim()) {
      const existing = latestSubmittedBySubmissionId.get(submissionId);
      if (!existing || event.createdAt >= existing.createdAt) {
        latestSubmittedBySubmissionId.set(submissionId, event);
      }
    }

    const scopeRowId = scopeRowIdFromMetadata(event.metadata);
    if (scopeRowId) submittedScopeRowIds.add(scopeRowId);
  }

  const latestSubmittedByScopeRowId = new Map<string, ActivityLogRow>();
  for (const event of events) {
    if (event.eventType !== ActivityEventType.INSPECTION_SUBMITTED) continue;
    const scopeRowId = scopeRowIdFromMetadata(event.metadata);
    if (!scopeRowId) continue;
    const existing = latestSubmittedByScopeRowId.get(scopeRowId);
    if (!existing || event.createdAt >= existing.createdAt) {
      latestSubmittedByScopeRowId.set(scopeRowId, event);
    }
  }

  return events.filter((event) => {
    if (event.eventType === ActivityEventType.INSPECTION_SUBMITTED) {
      const submissionId = event.metadata.submissionId;
      if (typeof submissionId === "string" && latestSubmittedBySubmissionId.has(submissionId)) {
        if (latestSubmittedBySubmissionId.get(submissionId)?.id !== event.id) return false;
      }
      const scopeRowId = scopeRowIdFromMetadata(event.metadata);
      if (scopeRowId && latestSubmittedByScopeRowId.has(scopeRowId)) {
        if (latestSubmittedByScopeRowId.get(scopeRowId)?.id !== event.id) return false;
      }
      return true;
    }

    if (event.eventType === ActivityEventType.SCOPE_INSPECTION_UPDATED) {
      const scopeRowId = scopeRowIdFromMetadata(event.metadata);
      if (scopeRowId && submittedScopeRowIds.has(scopeRowId)) return false;
    }

    return true;
  });
}
