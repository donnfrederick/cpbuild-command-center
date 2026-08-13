/**
 * Ensures every code in the in-app permission catalog has a row in `permissions`.
 * The catalog in lib/permissions.ts grows faster than legacy migration seeds;
 * Role Manager and bootstrap both depend on these rows existing.
 */

import type { PrismaClient } from "@prisma/client";
import { PERMISSION_METADATA } from "@/lib/permission-metadata";
import type { Permission } from "@/lib/permissions";

export async function ensurePermissionRows(
  db: PrismaClient,
  codes: readonly Permission[],
): Promise<Array<{ id: string; code: string }>> {
  const unique = [...new Set(codes)];
  const metaByCode = new Map(PERMISSION_METADATA.map((m) => [m.code, m]));

  for (const code of unique) {
    const meta = metaByCode.get(code);
    if (!meta) continue;

    await db.permission.upsert({
      where: { code },
      create: {
        code,
        name: meta.label,
        description: meta.description,
      },
      update: {
        name: meta.label,
        description: meta.description,
      },
    });
  }

  return db.permission.findMany({
    where: { code: { in: unique } },
    select: { id: true, code: true },
  });
}
