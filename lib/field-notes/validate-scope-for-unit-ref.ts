import type { PrismaClient } from "@prisma/client";
import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";
import { parseFieldNotesLocation } from "@/lib/field-notes-location-ref";

type DbLike = Pick<PrismaClient, "projectRow">;

/** Scope tags are only valid when unitRef resolves to a concrete UPM unit. */
export async function scopeRowsMatchUnitRef(
  db: DbLike,
  projectId: string,
  unitRef: string | null | undefined,
  scopeTagIds: string[],
): Promise<boolean> {
  if (scopeTagIds.length === 0) return true;

  if (isCustomSiteUnitRef(unitRef)) return false;

  const parsed = parseFieldNotesLocation(unitRef);
  if (parsed.level !== "unit") return false;

  const uniqueIds = [...new Set(scopeTagIds)];
  const rows = await db.projectRow.findMany({
    where: { projectId, id: { in: uniqueIds } },
    select: { id: true, building: true, level: true, unit: true },
  });

  if (rows.length !== uniqueIds.length) return false;

  return rows.every(
    (row) =>
      row.building === parsed.building &&
      row.level === parsed.floorLevel &&
      row.unit === parsed.unit,
  );
}
