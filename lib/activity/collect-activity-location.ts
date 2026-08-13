"use client";

import { requestClientGeolocation } from "@/lib/geo/client-geolocation";
import type { ActivityClientLocation } from "@/lib/activity/activity-location-schema";

/** Collect GPS-only context for a field action (no device/browser metadata). */
export async function collectActivityLocation(): Promise<ActivityClientLocation> {
  const geo = await requestClientGeolocation();
  return {
    gpsStatus: geo.status,
    locationRecordedAt: new Date().toISOString(),
    latitude: geo.status === "granted" ? geo.latitude : undefined,
    longitude: geo.status === "granted" ? geo.longitude : undefined,
    accuracyMeters: geo.status === "granted" ? geo.accuracyMeters : undefined,
  };
}
