"use client";

/**
 * Shared library-picker staging for field observations/issues.
 * Converts HEIC → JPEG for browser preview, then applies timestamp burn when configured.
 */

import { toast } from "sonner";
import { buildGpsWatermark, type GpsWatermarkLabels } from "@/lib/build-gps-watermark";
import { collectCaptureClientMetadata } from "@/lib/capture-client-metadata";
import { prefetchProjectGeocode } from "@/lib/field-media/stamp-field-photo-with-capture";
import type { CaptureClientMetadata, ClientCaptureMethod } from "@/lib/media/capture-context-schema";
import {
  FIELD_IMAGE_AUTO_COMPRESS_BYTES,
  HEIC_LARGE_FILE_WARNING_BYTES,
  isFieldMediaImageFile,
  isHeicOrHeifFile,
  prepareLibraryImageForFieldUpload,
  resolveClientMime,
  type PrepareLibraryImageOptions,
} from "@/lib/image-utils";

export const FIELD_MEDIA_VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;

export interface ProcessLibraryMediaFileOptions {
  stamp?: PrepareLibraryImageOptions;
  onHeicLargeWarning?: (file: File) => void;
  projectId?: string;
  captureMethod?: ClientCaptureMethod;
  watermarkLabels?: GpsWatermarkLabels;
  captureMetadata?: CaptureClientMetadata;
}

export interface ProcessLibraryMediaFileResult {
  file: File;
  mimeType: string;
  wasCompressed?: boolean;
  captureMetadata?: CaptureClientMetadata;
}

/** Toast when library image staging fails — size-aware message for large files. */
export function toastImagePrepareFailure(
  file: File,
  tObsFailed: () => string,
  tTooLarge: (values: { sizeMb: string }) => string,
): void {
  if (file.size > FIELD_IMAGE_AUTO_COMPRESS_BYTES) {
    toast.error(tTooLarge({ sizeMb: (file.size / 1024 / 1024).toFixed(0) }));
  } else {
    toast.error(tObsFailed());
  }
}

/** Prepare a single library file for staging (preview thumbnail + eventual upload). */
export async function processLibraryMediaFile(
  file: File,
  options: ProcessLibraryMediaFileOptions = {},
): Promise<ProcessLibraryMediaFileResult> {
  if (isHeicOrHeifFile(file) && file.size > HEIC_LARGE_FILE_WARNING_BYTES) {
    options.onHeicLargeWarning?.(file);
  }
  if (!isFieldMediaImageFile(file)) {
    return { file, mimeType: resolveClientMime(file) };
  }

  const captureMetadata =
    options.captureMetadata
    ?? await collectCaptureClientMetadata(options.captureMethod ?? "photo_library");

  let gpsWatermark = options.stamp?.gpsWatermark;
  if (!gpsWatermark && options.watermarkLabels) {
    const geocode = options.projectId
      ? await prefetchProjectGeocode(options.projectId)
      : null;
    gpsWatermark = buildGpsWatermark(captureMetadata, geocode, options.watermarkLabels);
  }

  const result = await prepareLibraryImageForFieldUpload(file, {
    ...(options.stamp ?? { uploaded: true }),
    gpsWatermark,
  });
  return { ...result, captureMetadata };
}
