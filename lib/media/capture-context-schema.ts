import { z } from "zod";

export const CAPTURE_GPS_STATUS_VALUES = ["granted", "denied", "timeout", "unavailable"] as const;
export const CAPTURE_APP_SHELL_VALUES = ["browser_tab", "pwa_installed"] as const;
export const CAPTURE_METHOD_VALUES = [
  "native_camera",
  "webcam",
  "photo_library",
  "file_drop",
] as const;

export type ClientCaptureGpsStatus = (typeof CAPTURE_GPS_STATUS_VALUES)[number];
export type ClientCaptureAppShell = (typeof CAPTURE_APP_SHELL_VALUES)[number];
export type ClientCaptureMethod = (typeof CAPTURE_METHOD_VALUES)[number];

/** Client-submitted capture metadata (POST /api/upload/field-media form field). */
export const CaptureClientMetadataSchema = z.object({
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  accuracyMeters: z.number().finite().nonnegative().optional(),
  gpsStatus: z.enum(CAPTURE_GPS_STATUS_VALUES),
  captureRecordedAt: z.string().datetime(),
  deviceType: z.string().min(1).max(120),
  browser: z.string().min(1).max(120),
  appShell: z.enum(CAPTURE_APP_SHELL_VALUES),
  captureMethod: z.enum(CAPTURE_METHOD_VALUES),
  userAgent: z.string().min(1).max(2048),
});

export type CaptureClientMetadata = z.infer<typeof CaptureClientMetadataSchema>;

export function parseCaptureClientMetadata(raw: unknown): CaptureClientMetadata | null {
  const parsed = CaptureClientMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Map client snake/lowercase enums to Prisma enum values. */
export function gpsStatusToDb(status: ClientCaptureGpsStatus): "GRANTED" | "DENIED" | "TIMEOUT" | "UNAVAILABLE" {
  const map = {
    granted: "GRANTED",
    denied: "DENIED",
    timeout: "TIMEOUT",
    unavailable: "UNAVAILABLE",
  } as const;
  return map[status];
}

export function appShellToDb(shell: ClientCaptureAppShell): "BROWSER_TAB" | "PWA_INSTALLED" {
  return shell === "pwa_installed" ? "PWA_INSTALLED" : "BROWSER_TAB";
}

export function captureMethodToDb(
  method: ClientCaptureMethod,
): "NATIVE_CAMERA" | "WEBCAM" | "PHOTO_LIBRARY" | "FILE_DROP" {
  const map = {
    native_camera: "NATIVE_CAMERA",
    webcam: "WEBCAM",
    photo_library: "PHOTO_LIBRARY",
    file_drop: "FILE_DROP",
  } as const;
  return map[method];
}
