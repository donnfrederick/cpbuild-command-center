import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import {
  assertActiveObservationTypeCode,
  observationCatalogValidationStatus,
} from "@/lib/observations/observation-catalog";

const BulkObsUnitSchema = z.object({
  unitRef: z.string().min(1),
  /** IDs of ProjectRow records to tag on the observation for this unit. */
  scopeRowIds: z.array(z.string()).default([]),
});

const BulkObservationSchema = z.object({
  units: z.array(BulkObsUnitSchema).min(1).max(200),
  title: z.string().max(200).default(""),
  description: z.string().max(2000).default(""),
  observationType: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const body = await req.json().catch(() => null);
  const parsed = BulkObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { units, title, description, observationType } = parsed.data;

  let observationTypeCode: string;
  try {
    const row = await assertActiveObservationTypeCode(observationType);
    observationTypeCode = row.code;
  } catch (err) {
    const status = observationCatalogValidationStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid observation type" },
      { status },
    );
  }

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);
  if (!resolvedUserId) {
    return NextResponse.json({ error: "No users found in database" }, { status: 500 });
  }

  // Validate all referenced scope row IDs belong to this project
  const allScopeRowIds = [...new Set(units.flatMap((u) => u.scopeRowIds))];
  if (allScopeRowIds.length > 0) {
    const rows = await db.projectRow.findMany({
      where: { id: { in: allScopeRowIds }, projectId },
      select: { id: true },
    });
    if (rows.length !== allScopeRowIds.length) {
      return NextResponse.json({ error: "One or more scope rows not found in this project" }, { status: 404 });
    }
  }

  const bulkGroupId = randomUUID();

  try {
    const obsCreates = units.map((unit) =>
      db.projectObservation.create({
        data: {
          projectId,
          unitRef: unit.unitRef,
          title,
          description,
          observationTypeCode,
          bulkGroupId,
          authorId: resolvedUserId,
          scopeTags: unit.scopeRowIds.length > 0
            ? { create: unit.scopeRowIds.map((rowId) => ({ projectRowId: rowId })) }
            : undefined,
        },
        select: { id: true },
      })
    );

    const created = await db.$transaction(obsCreates);

    console.log(`[observations/bulk POST] Created ${created.length} observations (bulkGroupId=${bulkGroupId}) in project ${projectId}`);

    void (async () => {
      const userName = await resolveActorName(resolvedUserId);
      void logActivity(projectId, resolvedUserId, userName, {
        eventType: "OBSERVATION_BULK_CREATED",
        bulkGroupId,
        count: created.length,
        title,
        observationType,
        unitRefs: units.map(({ unitRef }) => {
          const [building = "", level = "", unit = unitRef] = unitRef.split("|");
          return { building, level, unit };
        }),
      });
    })();

    return NextResponse.json({ created: created.length, bulkGroupId }, { status: 201 });
  } catch (err) {
    console.error("[observations/bulk POST] Prisma error:", err);
    return NextResponse.json({ error: "Failed to create bulk observations" }, { status: 500 });
  }
}
