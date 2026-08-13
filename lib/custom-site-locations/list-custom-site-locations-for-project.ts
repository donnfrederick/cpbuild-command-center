import type { CustomSitePlacement } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  customSiteUnitRef,
  type CustomSiteLocation,
} from "@/lib/custom-site-locations";

type DbClient = Pick<
  PrismaClient,
  "projectCustomSiteLocation" | "projectObservation" | "projectIssue"
>;

export function serializeCustomSiteLocationRow(
  row: {
    id: string;
    projectId: string;
    name: string;
    building: string;
    level: string;
    placement: CustomSitePlacement;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string | null };
  },
  counts: { observations: number; issues: number },
): CustomSiteLocation {
  const base = {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    building: row.building,
    level: row.level,
    placement: row.placement,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
  const unitRef = customSiteUnitRef(base);
  return {
    ...base,
    unitRef,
    observationCount: counts.observations,
    issueCount: counts.issues,
  };
}

async function countFieldNotes(
  db: DbClient,
  projectId: string,
  unitRefs: string[],
) {
  if (unitRefs.length === 0) {
    return new Map<string, { observations: number; issues: number }>();
  }
  const [obsGroups, issueGroups] = await Promise.all([
    db.projectObservation.groupBy({
      by: ["unitRef"],
      where: { projectId, unitRef: { in: unitRefs } },
      _count: { _all: true },
    }),
    db.projectIssue.groupBy({
      by: ["unitRef"],
      where: { projectId, unitRef: { in: unitRefs } },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<string, { observations: number; issues: number }>();
  for (const ref of unitRefs) {
    map.set(ref, { observations: 0, issues: 0 });
  }
  for (const g of obsGroups) {
    if (!g.unitRef) continue;
    const cur = map.get(g.unitRef) ?? { observations: 0, issues: 0 };
    map.set(g.unitRef, { ...cur, observations: g._count._all });
  }
  for (const g of issueGroups) {
    if (!g.unitRef) continue;
    const cur = map.get(g.unitRef) ?? { observations: 0, issues: 0 };
    map.set(g.unitRef, { ...cur, issues: g._count._all });
  }
  return map;
}

/** List custom site locations with field-note counts — shared by live API and offline snapshot. */
export async function listCustomSiteLocationsForProject(
  db: DbClient,
  projectId: string,
): Promise<CustomSiteLocation[]> {
  const rows = await db.projectCustomSiteLocation.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { id: true, name: true } } },
  });

  const unitRefs = rows.map((r) => customSiteUnitRef(r));
  const counts = await countFieldNotes(db, projectId, unitRefs);

  return rows.map((row) =>
    serializeCustomSiteLocationRow(row, counts.get(customSiteUnitRef(row)) ?? { observations: 0, issues: 0 }),
  );
}
