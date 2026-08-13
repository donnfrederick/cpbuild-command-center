import type { CustomSiteLocation, CustomSitePlacement } from "@/lib/custom-site-locations";
import { readSnapshotCustomSiteLocations } from "@/lib/offline/snapshot-project-reads";
import {
  CustomSiteLocationOfflineDuplicateError,
  enqueueCreateCustomSiteLocationOffline,
} from "@/lib/offline/custom-site-location-offline";

export type CustomSiteLocationErrorCode =
  | "duplicate_name"
  | "invalid_scope"
  | "has_field_notes";

export class CustomSiteLocationApiError extends Error {
  readonly code: CustomSiteLocationErrorCode | undefined;

  constructor(message: string, code?: CustomSiteLocationErrorCode) {
    super(message);
    this.name = "CustomSiteLocationApiError";
    this.code = code;
  }
}

async function parseApiError(res: Response, fallback: string): Promise<never> {
  const err = (await res.json().catch(() => null)) as {
    error?: string;
    code?: CustomSiteLocationErrorCode;
  } | null;
  throw new CustomSiteLocationApiError(err?.error ?? fallback, err?.code);
}

export async function fetchCustomSiteLocations(
  projectId: string,
): Promise<CustomSiteLocation[]> {
  try {
    const res = await fetch(`/api/projects/${projectId}/custom-site-locations`);
    if (!res.ok) {
      const fromSnapshot = await readSnapshotCustomSiteLocations(projectId);
      if (fromSnapshot) return fromSnapshot.data;
      await parseApiError(res, "Failed to load custom site locations");
    }
    const data = (await res.json()) as { locations: CustomSiteLocation[] };
    return data.locations ?? [];
  } catch {
    const fromSnapshot = await readSnapshotCustomSiteLocations(projectId);
    if (fromSnapshot) return fromSnapshot.data;
    throw new CustomSiteLocationApiError("Failed to load custom site locations");
  }
}

export interface CreateCustomSiteLocationOptions {
  /** Session user id — used for offline optimistic createdBy display. */
  actorUserId?: string;
}

export async function createCustomSiteLocation(
  projectId: string,
  body: {
    name: string;
    placement: CustomSitePlacement;
    building?: string;
    level?: string;
  },
  options?: CreateCustomSiteLocationOptions,
): Promise<CustomSiteLocation> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    try {
      return await enqueueCreateCustomSiteLocationOffline(
        projectId,
        body,
        options?.actorUserId,
      );
    } catch (err) {
      if (err instanceof CustomSiteLocationOfflineDuplicateError) {
        throw new CustomSiteLocationApiError(
          "A custom location with this name already exists in this area",
          "duplicate_name",
        );
      }
      throw err;
    }
  }

  const res = await fetch(`/api/projects/${projectId}/custom-site-locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await parseApiError(res, "Failed to create custom site location");
  }
  const data = (await res.json()) as { location: CustomSiteLocation };
  return data.location;
}

export async function updateCustomSiteLocation(
  projectId: string,
  locationId: string,
  body: {
    name: string;
    placement: CustomSitePlacement;
    building?: string;
    level?: string;
  },
): Promise<CustomSiteLocation> {
  const res = await fetch(
    `/api/projects/${projectId}/custom-site-locations/${locationId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    await parseApiError(res, "Failed to update custom site location");
  }
  const data = (await res.json()) as { location: CustomSiteLocation };
  return data.location;
}

export async function deleteCustomSiteLocation(
  projectId: string,
  locationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${projectId}/custom-site-locations/${locationId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    await parseApiError(res, "Failed to delete custom site location");
  }
}
