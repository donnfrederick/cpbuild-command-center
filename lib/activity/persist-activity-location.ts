import type { ActivityLocationSource, CaptureGpsStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computeCaptureDistanceToProject } from "@/lib/geo/project-site-geocode";
import { gpsStatusToDb } from "@/lib/media/capture-context-schema";
import type { ActivityClientLocation } from "@/lib/activity/activity-location-schema";

type TransactionClient = Prisma.TransactionClient;

export async function persistActivityLocationContext(
  activityLogId: string,
  projectId: string,
  location: ActivityClientLocation,
  source: ActivityLocationSource,
  tx: TransactionClient = db,
): Promise<void> {
  const gpsStatus = gpsStatusToDb(location.gpsStatus) as CaptureGpsStatus;
  const latitude = location.gpsStatus === "granted" ? location.latitude ?? null : null;
  const longitude = location.gpsStatus === "granted" ? location.longitude ?? null : null;
  const accuracyMeters =
    location.gpsStatus === "granted" ? location.accuracyMeters ?? null : null;

  const distance = await computeCaptureDistanceToProject(projectId, latitude, longitude);

  await tx.activityLocationContext.upsert({
    where: { activityLogId },
    create: {
      activityLogId,
      gpsStatus,
      latitude,
      longitude,
      accuracyMeters,
      distanceFromProjectMeters: distance.distanceFromProjectMeters,
      locationRecordedAt: new Date(location.locationRecordedAt),
      source,
    },
    update: {
      gpsStatus,
      latitude,
      longitude,
      accuracyMeters,
      distanceFromProjectMeters: distance.distanceFromProjectMeters,
      locationRecordedAt: new Date(location.locationRecordedAt),
      source,
    },
  });
}

/** Promote granted GPS from linked media attachments onto the activity log row. */
export async function promoteActivityLocationFromMedia(
  activityLogId: string,
  projectId: string,
  attachmentIds: string[],
  source: ActivityLocationSource = "MEDIA_DERIVED",
): Promise<void> {
  if (attachmentIds.length === 0) return;

  const contexts = await db.mediaCaptureContext.findMany({
    where: { mediaAttachmentId: { in: attachmentIds } },
    select: {
      gpsStatus: true,
      latitude: true,
      longitude: true,
      accuracyMeters: true,
      captureRecordedAt: true,
    },
  });
  if (contexts.length === 0) return;

  const granted = contexts.filter((c) => c.gpsStatus === "GRANTED" && c.latitude != null && c.longitude != null);
  let gpsStatus: CaptureGpsStatus;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let accuracyMeters: number | null = null;
  let locationRecordedAt: Date;

  if (granted.length > 0) {
    latitude = granted.reduce((sum, c) => sum + (c.latitude ?? 0), 0) / granted.length;
    longitude = granted.reduce((sum, c) => sum + (c.longitude ?? 0), 0) / granted.length;
    const acc = granted.map((c) => c.accuracyMeters).filter((v): v is number => v != null);
    accuracyMeters = acc.length > 0 ? acc.reduce((a, b) => a + b, 0) / acc.length : null;
    gpsStatus = "GRANTED";
    locationRecordedAt = granted[0]!.captureRecordedAt;
  } else {
    const best = contexts[0]!;
    gpsStatus = best.gpsStatus;
    locationRecordedAt = best.captureRecordedAt;
  }

  const distance = await computeCaptureDistanceToProject(projectId, latitude, longitude);

  await db.activityLocationContext.upsert({
    where: { activityLogId },
    create: {
      activityLogId,
      gpsStatus,
      latitude,
      longitude,
      accuracyMeters,
      distanceFromProjectMeters: distance.distanceFromProjectMeters,
      locationRecordedAt,
      source,
    },
    update: {
      gpsStatus,
      latitude,
      longitude,
      accuracyMeters,
      distanceFromProjectMeters: distance.distanceFromProjectMeters,
      locationRecordedAt,
      source,
    },
  });
}

/** After logActivity — persist client capture or promote from media when present. */
export async function attachActivityLocationAfterLog(
  activityLogId: string | null,
  projectId: string,
  options: {
    activityLocation?: ActivityClientLocation | null;
    attachmentIds?: string[];
  },
): Promise<void> {
  if (!activityLogId) return;

  if (options.activityLocation) {
    await persistActivityLocationContext(
      activityLogId,
      projectId,
      options.activityLocation,
      "ACTIVITY_CAPTURE",
    );
    return;
  }

  if (options.attachmentIds && options.attachmentIds.length > 0) {
    await promoteActivityLocationFromMedia(activityLogId, projectId, options.attachmentIds);
  }
}
