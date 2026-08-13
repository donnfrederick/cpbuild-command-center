/**
 * Offline create for project custom site locations — queue + optimistic row.
 */

import {
  customSiteLocationNameKey,
  customSiteLocationsShareScope,
  customSiteUnitRef,
  normalizeCustomSiteLocationFields,
  type CustomSiteLocation,
  type CustomSitePlacement,
} from "@/lib/custom-site-locations";
import { readSnapshotCustomSiteLocations } from "@/lib/offline/snapshot-project-reads";
import { enqueueMutation, getPendingMutations } from "@/lib/offline/mutation-queue";

export interface CreateCustomSiteLocationPayload {
  name: string;
  placement: CustomSitePlacement;
  building?: string;
  level?: string;
}

function newOfflineMutationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Exact duplicate-name match within the same scope (snapshot + pending creates). */
export async function isCustomSiteLocationNameTakenOffline(
  projectId: string,
  payload: CreateCustomSiteLocationPayload,
  options?: { excludeMutationId?: string },
): Promise<boolean> {
  const nameKey = customSiteLocationNameKey(payload.name);
  if (!nameKey) return false;

  const scope = {
    placement: payload.placement,
    building: payload.building ?? "",
    level: payload.level ?? "",
  };

  const snapshot = await readSnapshotCustomSiteLocations(projectId);
  if (
    snapshot?.data.some((loc) => {
      if (options?.excludeMutationId && loc.id === options.excludeMutationId) return false;
      if (
        !customSiteLocationsShareScope(scope, {
          placement: loc.placement,
          building: loc.building,
          level: loc.level,
        })
      ) {
        return false;
      }
      return customSiteLocationNameKey(loc.name) === nameKey;
    })
  ) {
    return true;
  }

  const pending = await getPendingMutations();
  return pending.some((m) => {
    if (m.type !== "create-custom-site-location") return false;
    if (options?.excludeMutationId && m.id === options.excludeMutationId) return false;
    if (!m.url.includes(`/projects/${projectId}/`)) return false;
    const body = m.body as {
      name?: string;
      placement?: CustomSitePlacement;
      building?: string;
      level?: string;
    } | null;
    if (
      !customSiteLocationsShareScope(scope, {
        placement: body?.placement ?? "standalone",
        building: body?.building ?? "",
        level: body?.level ?? "",
      })
    ) {
      return false;
    }
    return customSiteLocationNameKey(String(body?.name ?? "")) === nameKey;
  });
}

export function buildOptimisticCustomSiteLocation(
  projectId: string,
  mutationId: string,
  payload: CreateCustomSiteLocationPayload,
  queuedAt: number,
  actorUserId?: string,
): CustomSiteLocation {
  const { building, level } = normalizeCustomSiteLocationFields(
    payload.placement,
    payload.building ?? "",
    payload.level ?? "",
  );
  const name = payload.name.trim();
  return {
    id: mutationId,
    projectId,
    name,
    building,
    level,
    placement: payload.placement,
    sortOrder: 9999,
    createdAt: new Date(queuedAt).toISOString(),
    updatedAt: new Date(queuedAt).toISOString(),
    createdBy: { id: actorUserId ?? "", name: null },
    unitRef: customSiteUnitRef({ id: mutationId, name }),
    observationCount: 0,
    issueCount: 0,
  };
}

export async function enqueueCreateCustomSiteLocationOffline(
  projectId: string,
  payload: CreateCustomSiteLocationPayload,
  actorUserId?: string,
): Promise<CustomSiteLocation> {
  if (await isCustomSiteLocationNameTakenOffline(projectId, payload)) {
    throw new CustomSiteLocationOfflineDuplicateError();
  }

  const mutationId = newOfflineMutationId();
  const queuedAt = Date.now();
  const { building, level } = normalizeCustomSiteLocationFields(
    payload.placement,
    payload.building ?? "",
    payload.level ?? "",
  );

  await enqueueMutation({
    id: mutationId,
    type: "create-custom-site-location",
    url: `/api/projects/${projectId}/custom-site-locations`,
    method: "POST",
    actorUserId,
    body: {
      name: payload.name.trim(),
      placement: payload.placement,
      building,
      level,
    },
  });

  return buildOptimisticCustomSiteLocation(
    projectId,
    mutationId,
    payload,
    queuedAt,
    actorUserId,
  );
}

export class CustomSiteLocationOfflineDuplicateError extends Error {
  constructor() {
    super("duplicate_name");
    this.name = "CustomSiteLocationOfflineDuplicateError";
  }
}
