/**
 * Collapse burst-duplicate activity rows for display only.
 * Raw activity_logs in the database are unchanged — this shapes what users see in feeds.
 */

export interface ActivityFeedEvent {
  id: string;
  eventType: string;
  userId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Event types where repeated identical transitions in a short window are usually one user action. */
const DISPLAY_DEDUP_EVENT_TYPES = new Set([
  "SCOPE_STATUS_UPDATED",
  "SCOPE_SUBCONTRACTOR_UPDATED",
  "SCOPE_INSPECTION_UPDATED",
]);

const DEFAULT_DISPLAY_DEDUP_WINDOW_MS = 3 * 60 * 1000;

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function stableKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Fingerprint for "same user-visible change" — intentionally ignores `from*` on status
 * so pending overlays (from null) collapse against server rows with correct prior state.
 */
export function activityDisplayDedupFingerprint(event: ActivityFeedEvent): string | null {
  if (!DISPLAY_DEDUP_EVENT_TYPES.has(event.eventType)) return null;

  const m = metadataRecord(event.metadata);
  const rowId = stableKey(m.rowId);
  if (!rowId) return null;

  switch (event.eventType) {
    case "SCOPE_STATUS_UPDATED":
      return [
        "status",
        rowId,
        stableKey(m.toStage),
        stableKey(m.toStatus),
      ].join("|");
    case "SCOPE_SUBCONTRACTOR_UPDATED":
      return ["sub", rowId, stableKey(m.toUnifierSubId)].join("|");
    case "SCOPE_INSPECTION_UPDATED":
      return ["insp", rowId, stableKey(m.toInspectionStatus)].join("|");
    default:
      return null;
  }
}

function eventTimestampMs(event: ActivityFeedEvent): number {
  const parsed = Date.parse(event.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPendingOverlayEvent(event: ActivityFeedEvent): boolean {
  const m = metadataRecord(event.metadata);
  return event.id.startsWith("pending:")
    || m.pendingSync === true
    || m.replayedFromOfflineQueue === true;
}

/**
 * Newest-first list: keep the first row per fingerprint within `windowMs`; drop later
 * duplicates in the same burst. When a pending overlay and a server row share a
 * fingerprint, prefer the server row (accurate from-state and timestamps).
 */
export function dedupeActivityEventsForDisplay<T extends ActivityFeedEvent>(
  events: T[],
  options?: { windowMs?: number },
): T[] {
  const windowMs = options?.windowMs ?? DEFAULT_DISPLAY_DEDUP_WINDOW_MS;
  const sorted = [...events].sort(
    (a, b) => eventTimestampMs(b) - eventTimestampMs(a),
  );

  const kept: T[] = [];
  const anchorByFingerprint = new Map<string, { atMs: number; index: number }>();

  for (const event of sorted) {
    const fingerprint = activityDisplayDedupFingerprint(event);
    if (!fingerprint) {
      kept.push(event);
      continue;
    }

    const atMs = eventTimestampMs(event);
    const anchor = anchorByFingerprint.get(fingerprint);

    if (anchor !== undefined && Math.abs(anchor.atMs - atMs) <= windowMs) {
      const existing = kept[anchor.index];
      if (isPendingOverlayEvent(existing) && !isPendingOverlayEvent(event)) {
        kept[anchor.index] = event;
        anchorByFingerprint.set(fingerprint, { atMs, index: anchor.index });
      }
      continue;
    }

    kept.push(event);
    anchorByFingerprint.set(fingerprint, { atMs, index: kept.length - 1 });
  }

  return kept;
}

/** Normalize Prisma/JSON metadata for display dedup fingerprints. */
export function normalizeActivityFeedMetadata(metadata: unknown): Record<string, unknown> {
  return metadataRecord(metadata);
}

/**
 * Shape stored activity_log rows for export (PDF/XLSX) to match the on-screen feed.
 * Raw rows remain in the database — only the exported list is collapsed.
 */
export function dedupeActivityLogsForExport<T extends {
  id: string;
  eventType: string;
  metadata: unknown;
  createdAt: Date | string;
}>(events: T[]): T[] {
  if (events.length <= 1) return events;

  const forDedup = events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    metadata: normalizeActivityFeedMetadata(event.metadata),
    createdAt: event.createdAt instanceof Date
      ? event.createdAt.toISOString()
      : String(event.createdAt),
  }));

  const keptIds = new Set(
    dedupeActivityEventsForDisplay(forDedup).map((event) => event.id),
  );
  return events.filter((event) => keptIds.has(event.id));
}
