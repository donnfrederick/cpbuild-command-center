"use client";

import { buildGpsWatermark, type GpsWatermarkLabels } from "@/lib/build-gps-watermark";
import {
  collectCaptureClientMetadata,
  fetchProjectSiteGeocode,
  type SiteGeocodePrefetch,
} from "@/lib/capture-client-metadata";
import { burnTimestamp, type BurnLocation } from "@/lib/image-utils";
import type {
  CaptureClientMetadata,
  ClientCaptureMethod,
} from "@/lib/media/capture-context-schema";

export interface StampFieldPhotoOptions {
  projectId?: string;
  captureMethod: ClientCaptureMethod;
  location?: BurnLocation;
  uploaded?: boolean;
  scopeName?: string;
  statusLabel?: string;
  watermarkLabels: GpsWatermarkLabels;
  /** Pre-fetched geocode; when omitted and projectId set, fetches once per projectId. */
  geocode?: SiteGeocodePrefetch | null;
}

export interface StampFieldPhotoResult {
  blob: Blob;
  captureMetadata: CaptureClientMetadata;
}

const geocodeCache = new Map<string, SiteGeocodePrefetch | null>();

/** Prefetch project site geocode for watermark distance (cached in-memory per session). */
export async function prefetchProjectGeocode(projectId: string): Promise<SiteGeocodePrefetch | null> {
  if (geocodeCache.has(projectId)) {
    return geocodeCache.get(projectId) ?? null;
  }
  const data = await fetchProjectSiteGeocode(projectId);
  geocodeCache.set(projectId, data);
  return data;
}

/** Stamp a field photo with timestamp/location watermark plus GPS lines; collect client metadata. */
export async function stampFieldPhotoWithCapture(
  file: Blob,
  options: StampFieldPhotoOptions,
): Promise<StampFieldPhotoResult> {
  const captureMetadata = await collectCaptureClientMetadata(options.captureMethod);
  const geocode =
    options.geocode !== undefined
      ? options.geocode
      : options.projectId
        ? await prefetchProjectGeocode(options.projectId)
        : null;
  const gpsWatermark = buildGpsWatermark(captureMetadata, geocode, options.watermarkLabels);
  const blob = await burnTimestamp(file, new Date(), {
    location: options.location,
    uploaded: options.uploaded,
    scopeName: options.scopeName,
    statusLabel: options.statusLabel,
    gpsWatermark,
  });
  return { blob, captureMetadata };
}
