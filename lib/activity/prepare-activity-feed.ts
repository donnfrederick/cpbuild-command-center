import {
  filterPendingInspectionEventsDeduped,
  filterPendingSemanticDuplicatesAgainstServer,
} from "@/lib/activity/activity-sync-failure";
import {
  dedupeActivityEventsForDisplay,
  type ActivityFeedEvent,
} from "@/lib/activity/display-dedup";

/**
 * Merge pending offline overlays with server rows, then shape the list for display.
 * Database activity_logs are not modified — only the feed the user sees.
 */
export function prepareActivityFeedForDisplay<T extends ActivityFeedEvent>(
  pending: T[],
  server: T[],
  options?: { displayDedupWindowMs?: number },
): T[] {
  const semanticPending = filterPendingSemanticDuplicatesAgainstServer(pending, server);
  const dedupedPending = filterPendingInspectionEventsDeduped(semanticPending, server);
  const merged = [...dedupedPending, ...server];
  return dedupeActivityEventsForDisplay(merged, {
    windowMs: options?.displayDedupWindowMs,
  });
}
