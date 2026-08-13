"use client";

import type { GpsWatermark } from "@/lib/image-utils";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import { formatDistanceFromProjectMeters } from "@/lib/geo/format-capture-proximity";
import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";
import type { SiteGeocodePrefetch } from "@/lib/capture-client-metadata";


export type { GpsWatermark };

export interface GpsWatermarkLabels {
  denied: string;
  timeout: string;
  unavailable: string;
  /** GPS fix ok but project site could not be geocoded for distance. */
  noDistance: string;
}

/** Build burned-in GPS watermark lines from capture-time client metadata. */
export function buildGpsWatermark(
  meta: CaptureClientMetadata,
  geocode: SiteGeocodePrefetch | null | undefined,
  labels: GpsWatermarkLabels,
): GpsWatermark {
  if (meta.gpsStatus !== "granted" || meta.latitude == null || meta.longitude == null) {
    const reason =
      meta.gpsStatus === "denied"
        ? "denied"
        : meta.gpsStatus === "timeout"
          ? "timeout"
          : "unavailable";
    const line =
      reason === "denied"
        ? labels.denied
        : reason === "timeout"
          ? labels.timeout
          : labels.unavailable;
    return { kind: "failure", reason, line };
  }

  let distanceMeters: number | null = null;
  if (
    geocode?.available &&
    geocode.latitude != null &&
    geocode.longitude != null
  ) {
    distanceMeters = haversineDistanceMeters(
      meta.latitude,
      meta.longitude,
      geocode.latitude,
      geocode.longitude,
    );
  }

  if (distanceMeters != null) {
    const distanceLabel = formatDistanceFromProjectMeters(distanceMeters);
    const address = geocode?.siteLocation?.trim();
    return {
      kind: "success",
      distanceLabel: address ? `${distanceLabel} · ${address}` : distanceLabel,
      coordLabel: "",
    };
  }

  return {
    kind: "success",
    distanceLabel: labels.noDistance,
    coordLabel: "",
  };
}
