import type { PrismaClient } from "@prisma/client";
import { fullRowKeyFromParts } from "@/lib/project-row-matching";

type DbLike = Pick<PrismaClient, "projectRow">;

/** Status-update album labels use `"CAB · Completed"` — scope is before the middle dot. */
export function parseScopeCodesFromStatusUpdateLabel(label: string | null | undefined): string[] {
  if (!label) return [];
  const sep = label.indexOf(" · ");
  if (sep <= 0) return [];
  const scope = label.slice(0, sep).trim();
  return scope ? [scope] : [];
}

/** Human-readable status segment after `" · "` (e.g. `"In Staging"` from `"Cabinets · In Staging"`). */
export function parseStatusDisplayFromStatusUpdateLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const sep = label.indexOf(" · ");
  if (sep < 0) return null;
  const status = label.slice(sep + 3).trim();
  return status.length > 0 ? status : null;
}

export function scopeCodesFromRefKeys(
  scopeRefKeys: string[],
  refKeyToCode: ReadonlyMap<string, string>,
): string[] {
  const codes = new Set<string>();
  for (const key of scopeRefKeys) {
    const code = refKeyToCode.get(key);
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Build durable scope ref key → scope type code for a project. */
export async function buildScopeRefKeyToCodeMap(
  db: DbLike,
  projectId: string,
  refKeys: string[],
): Promise<Map<string, string>> {
  const uniqueKeys = [...new Set(refKeys.filter(Boolean))];
  const map = new Map<string, string>();
  if (uniqueKeys.length === 0) return map;

  const rows = await db.projectRow.findMany({
    where: { projectId },
    select: {
      building: true,
      level: true,
      unit: true,
      description: true,
      scopeType: { select: { code: true } },
    },
  });

  for (const row of rows) {
    const key = fullRowKeyFromParts({
      building: row.building,
      level: row.level,
      unit: row.unit,
      description: row.description,
    });
    if (!uniqueKeys.includes(key)) continue;
    const code = row.scopeType?.code?.trim();
    if (code) map.set(key, code);
  }

  return map;
}

/** Resolve scope type codes for project row ids (inspection submissions). */
export async function scopeCodesFromRowIds(
  db: DbLike,
  rowIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(rowIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const rows = await db.projectRow.findMany({
    where: { id: { in: uniqueIds } },
    select: { scopeType: { select: { code: true } } },
  });

  const codes = new Set<string>();
  for (const row of rows) {
    const code = row.scopeType?.code?.trim();
    if (code) codes.add(code);
  }
  return [...codes];
}
