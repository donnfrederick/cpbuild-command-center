import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";
import {
  appShellToDb,
  captureMethodToDb,
  gpsStatusToDb,
} from "@/lib/media/capture-context-schema";
import {
  computeCaptureDistanceToProject,
  uploadCaptureContextExpiresAt,
} from "@/lib/geo/project-site-geocode";

export type StagingCaptureContextInput = {
  storageKey: string;
  projectId: string | null | undefined;
  metadata: CaptureClientMetadata;
};

/** Persist capture metadata at upload time (before MediaAttachment exists). */
export async function upsertFieldMediaUploadContext(
  input: StagingCaptureContextInput,
): Promise<void> {
  const { storageKey, projectId, metadata } = input;
  const captureProjectId = projectId?.trim() || null;

  const distance = await computeCaptureDistanceToProject(
    captureProjectId,
    metadata.gpsStatus === "granted" ? metadata.latitude : undefined,
    metadata.gpsStatus === "granted" ? metadata.longitude : undefined,
  );

  const data: Prisma.FieldMediaUploadContextUncheckedCreateInput = {
    storageKey,
    captureRecordedAt: new Date(metadata.captureRecordedAt),
    gpsStatus: gpsStatusToDb(metadata.gpsStatus),
    latitude: metadata.gpsStatus === "granted" ? metadata.latitude ?? null : null,
    longitude: metadata.gpsStatus === "granted" ? metadata.longitude ?? null : null,
    accuracyMeters: metadata.accuracyMeters ?? null,
    distanceFromProjectMeters: distance.distanceFromProjectMeters,
    projectSiteAddressAtCapture: distance.projectSiteAddressAtCapture,
    projectGeocodeAvailable: distance.projectGeocodeAvailable,
    deviceType: metadata.deviceType,
    browser: metadata.browser,
    appShell: appShellToDb(metadata.appShell),
    captureMethod: captureMethodToDb(metadata.captureMethod),
    userAgent: metadata.userAgent,
    expiresAt: uploadCaptureContextExpiresAt(),
    captureProjectId,
  };

  await db.fieldMediaUploadContext.upsert({
    where: { storageKey },
    create: data,
    update: {
      captureRecordedAt: data.captureRecordedAt,
      gpsStatus: data.gpsStatus,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyMeters: data.accuracyMeters,
      distanceFromProjectMeters: data.distanceFromProjectMeters,
      projectSiteAddressAtCapture: data.projectSiteAddressAtCapture,
      projectGeocodeAvailable: data.projectGeocodeAvailable,
      deviceType: data.deviceType,
      browser: data.browser,
      appShell: data.appShell,
      captureMethod: data.captureMethod,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      captureProjectId,
    },
  });
}
