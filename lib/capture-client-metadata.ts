import { isInstalledPwa } from "@/lib/client-app-shell";
import { requestClientGeolocation } from "@/lib/geo/client-geolocation";
import type {
  CaptureClientMetadata,
  ClientCaptureAppShell,
  ClientCaptureMethod,
} from "@/lib/media/capture-context-schema";

export type { CaptureClientMetadata, ClientCaptureMethod };

function parseDeviceType(ua: string): string {
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android phone";
  if (/Android/i.test(ua)) return "Android tablet";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown device";
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Firefox/i.test(ua)) return "Firefox";
  return "Browser";
}

function resolveAppShell(): ClientCaptureAppShell {
  return isInstalledPwa() ? "pwa_installed" : "browser_tab";
}

/** Collect client device/browser/GPS context at capture or library-pick time. */
export async function collectCaptureClientMetadata(
  captureMethod: ClientCaptureMethod,
): Promise<CaptureClientMetadata> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const geo = await requestClientGeolocation();

  return {
    gpsStatus: geo.status,
    captureRecordedAt: new Date().toISOString(),
    latitude: geo.status === "granted" ? geo.latitude : undefined,
    longitude: geo.status === "granted" ? geo.longitude : undefined,
    accuracyMeters: geo.status === "granted" ? geo.accuracyMeters : undefined,
    deviceType: parseDeviceType(ua),
    browser: parseBrowser(ua),
    appShell: resolveAppShell(),
    captureMethod,
    userAgent: ua.slice(0, 2048),
  };
}

export interface SiteGeocodePrefetch {
  siteLocation: string;
  latitude: number | null;
  longitude: number | null;
  available: boolean;
}

/** Fetch cached project geocode for watermark distance (optional). */
export async function fetchProjectSiteGeocode(projectId: string): Promise<SiteGeocodePrefetch | null> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/site-geocode`);
    if (!res.ok) return null;
    return (await res.json()) as SiteGeocodePrefetch;
  } catch {
    return null;
  }
}
