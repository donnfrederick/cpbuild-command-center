import type { ProjectGeocodeStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

export interface ProjectSiteGeocodeResult {
  siteLocation: string;
  latitude: number | null;
  longitude: number | null;
  available: boolean;
  geocodeStatus: ProjectGeocodeStatus;
}

function googleGeocodingApiKey(): string | null {
  const key = process.env.GOOGLE_GEOCODING_API_KEY?.trim();
  return key || null;
}

async function fetchGoogleGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = googleGeocodingApiKey();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn("[project-site-geocode] Google Geocoding HTTP", res.status);
      return null;
    }
    const body = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    if (body.status !== "OK" || !body.results?.length) {
      console.warn("[project-site-geocode] Google Geocoding status", body.status);
      return null;
    }
    const loc = body.results[0]?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch (err) {
    console.warn("[project-site-geocode] Google Geocoding fetch failed:", err);
    return null;
  }
}

/**
 * Resolve geocoded coordinates for a project's Unifier siteLocation.
 * Caches in project_site_geocodes; re-geocodes when address text changes.
 */
export async function resolveProjectSiteGeocode(projectId: string): Promise<ProjectSiteGeocodeResult> {
  const project = await enrichProjectById(projectId);
  const siteLocation = (project?.siteLocation ?? "").trim();

  if (!siteLocation) {
    return {
      siteLocation: "",
      latitude: null,
      longitude: null,
      available: false,
      geocodeStatus: "FAILED",
    };
  }

  const existing = await db.projectSiteGeocode.findUnique({ where: { projectId } });
  if (
    existing
    && existing.siteLocationText === siteLocation
    && existing.geocodeStatus === "SUCCESS"
    && existing.latitude != null
    && existing.longitude != null
  ) {
    return {
      siteLocation,
      latitude: existing.latitude,
      longitude: existing.longitude,
      available: true,
      geocodeStatus: "SUCCESS",
    };
  }

  if (
    existing
    && existing.siteLocationText === siteLocation
    && existing.geocodeStatus === "FAILED"
    && !googleGeocodingApiKey()
  ) {
    return {
      siteLocation,
      latitude: null,
      longitude: null,
      available: false,
      geocodeStatus: "FAILED",
    };
  }

  const coords = await fetchGoogleGeocode(siteLocation);
  const now = new Date();

  if (coords) {
    await db.projectSiteGeocode.upsert({
      where: { projectId },
      create: {
        projectId,
        siteLocationText: siteLocation,
        latitude: coords.lat,
        longitude: coords.lng,
        geocodedAt: now,
        geocodeStatus: "SUCCESS",
      },
      update: {
        siteLocationText: siteLocation,
        latitude: coords.lat,
        longitude: coords.lng,
        geocodedAt: now,
        geocodeStatus: "SUCCESS",
      },
    });
    return {
      siteLocation,
      latitude: coords.lat,
      longitude: coords.lng,
      available: true,
      geocodeStatus: "SUCCESS",
    };
  }

  await db.projectSiteGeocode.upsert({
    where: { projectId },
    create: {
      projectId,
      siteLocationText: siteLocation,
      latitude: null,
      longitude: null,
      geocodedAt: null,
      geocodeStatus: googleGeocodingApiKey() ? "FAILED" : "PENDING",
    },
    update: {
      siteLocationText: siteLocation,
      latitude: null,
      longitude: null,
      geocodedAt: null,
      geocodeStatus: googleGeocodingApiKey() ? "FAILED" : "PENDING",
    },
  });

  return {
    siteLocation,
    latitude: null,
    longitude: null,
    available: false,
    geocodeStatus: googleGeocodingApiKey() ? "FAILED" : "PENDING",
  };
}

export interface CaptureDistanceResult {
  distanceFromProjectMeters: number | null;
  projectSiteAddressAtCapture: string | null;
  projectGeocodeAvailable: boolean;
}

/** Server-side distance from capture coords to project site (meters). */
export async function computeCaptureDistanceToProject(
  projectId: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Promise<CaptureDistanceResult> {
  if (!projectId?.trim()) {
    return {
      distanceFromProjectMeters: null,
      projectSiteAddressAtCapture: null,
      projectGeocodeAvailable: false,
    };
  }

  const geocode = await resolveProjectSiteGeocode(projectId.trim());
  if (
    latitude == null
    || longitude == null
    || !geocode.available
    || geocode.latitude == null
    || geocode.longitude == null
  ) {
    return {
      distanceFromProjectMeters: null,
      projectSiteAddressAtCapture: geocode.siteLocation || null,
      projectGeocodeAvailable: geocode.available,
    };
  }

  return {
    distanceFromProjectMeters: haversineDistanceMeters(
      latitude,
      longitude,
      geocode.latitude,
      geocode.longitude,
    ),
    projectSiteAddressAtCapture: geocode.siteLocation || null,
    projectGeocodeAvailable: true,
  };
}

/** TTL for orphaned upload staging rows (7 days). */
export const UPLOAD_CAPTURE_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function uploadCaptureContextExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + UPLOAD_CAPTURE_CONTEXT_TTL_MS);
}
