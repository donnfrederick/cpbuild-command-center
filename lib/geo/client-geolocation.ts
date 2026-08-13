"use client";

import type { ClientCaptureGpsStatus } from "@/lib/media/capture-context-schema";

export const CLIENT_GEOLOCATION_TIMEOUT_MS = 5000;

type GeolocationResult =
  | { status: "granted"; latitude: number; longitude: number; accuracyMeters?: number }
  | { status: Exclude<ClientCaptureGpsStatus, "granted"> };

/** Browser geolocation with 5s timeout — shared by capture metadata and activity location. */
export function requestClientGeolocation(): Promise<GeolocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "unavailable" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: GeolocationResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = window.setTimeout(
      () => finish({ status: "timeout" }),
      CLIENT_GEOLOCATION_TIMEOUT_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({
          status: "granted",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
        });
      },
      (err) => {
        window.clearTimeout(timer);
        if (err.code === err.PERMISSION_DENIED) finish({ status: "denied" });
        else if (err.code === err.TIMEOUT) finish({ status: "timeout" });
        else finish({ status: "unavailable" });
      },
      {
        enableHighAccuracy: false,
        timeout: CLIENT_GEOLOCATION_TIMEOUT_MS,
        maximumAge: 60_000,
      },
    );
  });
}
