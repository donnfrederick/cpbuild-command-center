import type { PrismaClient } from "@prisma/client";
import { fullRowKeyFromParts } from "@/lib/project-row-matching";

type DbLike = Pick<PrismaClient, "projectRow">;

/** Resolve project row IDs to durable scope ref keys for issue/observation storage. */
export async function scopeRefKeysFromRowIds(
  db: DbLike,
  projectId: string,
  rowIds: string[],
): Promise<string[]> {
  if (rowIds.length === 0) return [];

  const uniqueIds = [...new Set(rowIds)];
  const rows = await db.projectRow.findMany({
    where: { projectId, id: { in: uniqueIds } },
    select: { id: true, building: true, level: true, unit: true, description: true },
  });

  if (rows.length !== uniqueIds.length) {
    throw new Error("SCOPE_ROWS_NOT_FOUND");
  }

  const keys = rows.map((row) =>
    fullRowKeyFromParts({
      building: row.building,
      level: row.level,
      unit: row.unit,
      description: row.description,
    }),
  );

  return [...new Set(keys)];
}
