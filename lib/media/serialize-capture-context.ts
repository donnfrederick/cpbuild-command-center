import type { MediaCaptureContext } from "@prisma/client";

/** API-facing capture context (detail / lightbox endpoints). */
export interface SerializedCaptureContext {
  captureRecordedAt: string;
  gpsStatus: "granted" | "denied" | "timeout" | "unavailable";
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceFromProjectMeters: number | null;
  projectSiteAddressAtCapture: string | null;
  projectGeocodeAvailable: boolean;
  deviceType: string;
  browser: string;
  appShell: "browser_tab" | "pwa_installed";
  captureMethod: "native_camera" | "webcam" | "photo_library" | "file_drop";
}

function enumToClientGps(status: MediaCaptureContext["gpsStatus"]): SerializedCaptureContext["gpsStatus"] {
  const map = {
    GRANTED: "granted",
    DENIED: "denied",
    TIMEOUT: "timeout",
    UNAVAILABLE: "unavailable",
  } as const;
  return map[status];
}

function enumToClientAppShell(shell: MediaCaptureContext["appShell"]): SerializedCaptureContext["appShell"] {
  return shell === "PWA_INSTALLED" ? "pwa_installed" : "browser_tab";
}

function enumToClientMethod(method: MediaCaptureContext["captureMethod"]): SerializedCaptureContext["captureMethod"] {
  const map = {
    NATIVE_CAMERA: "native_camera",
    WEBCAM: "webcam",
    PHOTO_LIBRARY: "photo_library",
    FILE_DROP: "file_drop",
  } as const;
  return map[method];
}

export function serializeCaptureContext(row: MediaCaptureContext): SerializedCaptureContext {
  return {
    captureRecordedAt: row.captureRecordedAt.toISOString(),
    gpsStatus: enumToClientGps(row.gpsStatus),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracyMeters,
    distanceFromProjectMeters: row.distanceFromProjectMeters,
    projectSiteAddressAtCapture: row.projectSiteAddressAtCapture,
    projectGeocodeAvailable: row.projectGeocodeAvailable,
    deviceType: row.deviceType,
    browser: row.browser,
    appShell: enumToClientAppShell(row.appShell),
    captureMethod: enumToClientMethod(row.captureMethod),
  };
}

export const captureContextInclude = {
  captureContext: true,
} as const;
