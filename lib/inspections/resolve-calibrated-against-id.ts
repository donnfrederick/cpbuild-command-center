/**
 * Offline calibrations reference the clear inspection's client id (UUID localId).
 * The API expects a server CUID — resolve or defer until the clear row syncs.
 */

/** Prisma / Zod cuid — offline queue ids are UUIDs and must be remapped. */
export function isLikelyServerCuid(id: string): boolean {
  return /^c[a-z0-9]{24}$/i.test(id);
}

export type CalibratedTargetResolution =
  | { status: "resolved"; serverId: string }
  | { status: "deferred"; reason: "clear_not_synced_yet" }
  | { status: "missing" };

export interface PendingInspectionLookup {
  synced: boolean;
  serverId?: string;
}

/**
 * Map an offline/local clear id to the server submission id when available.
 * Returns deferred when the referenced clear is still in the upload queue.
 */
export function resolveCalibratedAgainstSubmissionId(
  calibratedAgainstSubmissionId: string | undefined,
  lookup: (localOrServerId: string) => PendingInspectionLookup | undefined,
): CalibratedTargetResolution {
  if (!calibratedAgainstSubmissionId) {
    return { status: "missing" };
  }

  if (isLikelyServerCuid(calibratedAgainstSubmissionId)) {
    return { status: "resolved", serverId: calibratedAgainstSubmissionId };
  }

  const record = lookup(calibratedAgainstSubmissionId);
  if (!record) {
    return { status: "missing" };
  }

  if (!record.synced || !record.serverId) {
    return { status: "deferred", reason: "clear_not_synced_yet" };
  }

  return { status: "resolved", serverId: record.serverId };
}

/** Sort pending inspections so clears sync before calibrations that depend on them. */
export function sortPendingInspectionsForFlush<T extends {
  categoryOverride?: "CALIBRATION_INSPECTION";
  submittedAt: string;
}>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const aCal = a.categoryOverride === "CALIBRATION_INSPECTION" ? 1 : 0;
    const bCal = b.categoryOverride === "CALIBRATION_INSPECTION" ? 1 : 0;
    if (aCal !== bCal) return aCal - bCal;
    return a.submittedAt.localeCompare(b.submittedAt);
  });
}
