import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { resolveActivityActorName } from "@/lib/activity-logger";
import { resolveSubcontractorDisplayName } from "@/lib/activity-subcontractor-log";

/**
 * POST /api/projects/[id]/units/bulk-installer
 *
 * Assigns or clears the Unifier subcontractor (unifierSubId) on a batch of
 * project rows — the same field that SubcontractorPicker sets individually.
 * Only rows that belong to this project are updated; foreign/invalid IDs are
 * silently skipped and reported back.
 */

const Body = z.object({
  /** Project row IDs to update. Max 500 per call. */
  rowIds: z.array(z.string()).min(1).max(500),
  /** The Unifier UXSUB ID to assign, or null to clear. */
  unifierSubId: z.string().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { rowIds, unifierSubId } = parsed.data;

  const ownedRows = await db.projectRow.findMany({
    where: { id: { in: rowIds }, projectId },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      unifierSubId: true,
      scopeType: { select: { name: true } },
    },
  });

  const ownedIds = new Set(ownedRows.map((r) => r.id));
  const skippedIds = rowIds.filter((id) => !ownedIds.has(id));
  const changedRows = ownedRows.filter(
    (row) => ownedIds.has(row.id) && (row.unifierSubId ?? null) !== unifierSubId,
  );
  const validIds = changedRows.map((row) => row.id);

  if (validIds.length === 0) {
    return NextResponse.json({ updatedIds: [], skippedIds, updatedCount: 0 });
  }

  await db.projectRow.updateMany({
    where: { id: { in: validIds } },
    data: { unifierSubId },
  });

  void (async () => {
    try {
      const { actorId, userName } = await resolveActivityActorName(effective);
      const subcontractorName = await resolveSubcontractorDisplayName(unifierSubId);
      if (changedRows.length === 0) return;
      await db.activityLog.createMany({
        data: changedRows.map((row) => ({
          projectId,
          userId: actorId,
          userName,
          eventType: "SCOPE_SUBCONTRACTOR_UPDATED" as const,
          metadata: {
            rowId: row.id,
            unit: row.unit,
            building: row.building,
            level: row.level,
            scopeName: row.scopeType?.name ?? "",
            fromUnifierSubId: row.unifierSubId ?? null,
            toUnifierSubId: unifierSubId,
            subcontractorName,
          },
        })),
      });
    } catch (err) {
      console.warn("[bulk-installer] failed to write activity logs", err);
    }
  })();

  return NextResponse.json({
    updatedIds: validIds,
    skippedIds,
    updatedCount: validIds.length,
  });
}
