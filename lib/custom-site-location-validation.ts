import { db } from "@/lib/db";
import {
  customSiteLocationNameKey,
  normalizeCustomSiteLocationFields,
  type CustomSiteLocationNameScope,
} from "@/lib/custom-site-locations";
import type { CustomSitePlacement } from "@prisma/client";

export type { CustomSiteLocationNameScope };

export async function validateCustomSiteLocationScope(
  projectId: string,
  placement: CustomSitePlacement,
  building: string,
  level: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const buildingTrimmed = building.trim();
  const levelTrimmed = level.trim();

  if (placement === "standalone") {
    if (buildingTrimmed || levelTrimmed) {
      return { ok: false, error: "Standalone locations cannot have building or level" };
    }
    return { ok: true };
  }

  if (!buildingTrimmed) {
    return { ok: false, error: "Building is required" };
  }

  const buildingExists = await db.projectRow.findFirst({
    where: { projectId, building: buildingTrimmed },
    select: { id: true },
  });
  if (!buildingExists) {
    return { ok: false, error: "Building not found in Location Builder data" };
  }

  if (placement === "building") {
    if (levelTrimmed) {
      return { ok: false, error: "Building-scoped locations cannot have a level" };
    }
    return { ok: true };
  }

  if (!levelTrimmed) {
    return { ok: false, error: "Level is required" };
  }

  const levelExists = await db.projectRow.findFirst({
    where: { projectId, building: buildingTrimmed, level: levelTrimmed },
    select: { id: true },
  });
  if (!levelExists) {
    return { ok: false, error: "Level not found for this building" };
  }

  return { ok: true };
}

/**
 * Exact duplicate-name check within the same placement/building/level bucket
 * (case- and whitespace-insensitive on the name). The same name may exist under
 * different buildings, levels, or standalone vs building-scoped areas.
 * Pass `excludeId` when editing so the row does not conflict with itself.
 */
export async function customSiteLocationNameTaken(
  projectId: string,
  name: string,
  scope: CustomSiteLocationNameScope,
  excludeId?: string,
): Promise<boolean> {
  const nameKey = customSiteLocationNameKey(name);
  if (!nameKey) return false;

  const { building, level } = normalizeCustomSiteLocationFields(
    scope.placement,
    scope.building,
    scope.level,
  );

  const existing = await db.projectCustomSiteLocation.findMany({
    where: {
      projectId,
      placement: scope.placement,
      building,
      level,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { name: true },
  });

  return existing.some((row) => customSiteLocationNameKey(row.name) === nameKey);
}
