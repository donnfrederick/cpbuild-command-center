import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type TransactionClient = Prisma.TransactionClient;

/**
 * Promote staging capture metadata to a permanent MediaCaptureContext row.
 * Call inside the same transaction as MediaAttachment create.
 */
export async function promoteUploadCaptureContext(
  tx: TransactionClient,
  storageKey: string,
  mediaAttachmentId: string,
): Promise<void> {
  const staging = await tx.fieldMediaUploadContext.findUnique({
    where: { storageKey },
  });
  if (!staging) return;

  await tx.mediaCaptureContext.create({
    data: {
      mediaAttachmentId,
      captureProjectId: staging.captureProjectId,
      captureRecordedAt: staging.captureRecordedAt,
      gpsStatus: staging.gpsStatus,
      latitude: staging.latitude,
      longitude: staging.longitude,
      accuracyMeters: staging.accuracyMeters,
      distanceFromProjectMeters: staging.distanceFromProjectMeters,
      projectSiteAddressAtCapture: staging.projectSiteAddressAtCapture,
      projectGeocodeAvailable: staging.projectGeocodeAvailable,
      deviceType: staging.deviceType,
      browser: staging.browser,
      appShell: staging.appShell,
      captureMethod: staging.captureMethod,
      userAgent: staging.userAgent,
    } satisfies Prisma.MediaCaptureContextUncheckedCreateInput,
  });

  await tx.fieldMediaUploadContext.delete({ where: { storageKey } });
}

/** Promote staging rows for newly created attachments (same transaction). */
export async function promoteUploadCaptureContextsFromAttachments(
  tx: TransactionClient,
  attachments: Array<{ id: string; storageKey: string }>,
): Promise<void> {
  for (const attachment of attachments) {
    await promoteUploadCaptureContext(tx, attachment.storageKey, attachment.id);
  }
}

/** Promote staging rows outside an existing transaction (wraps its own). */
export async function promoteUploadCaptureContextsForStorageKeys(
  attachments: Array<{ id: string; storageKey: string }>,
): Promise<void> {
  if (attachments.length === 0) return;
  await db.$transaction(async (tx) => {
    await promoteUploadCaptureContextsFromAttachments(tx, attachments);
  });
}
