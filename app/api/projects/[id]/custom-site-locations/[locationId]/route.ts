import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import {
  customSiteLocationNameTaken,
  validateCustomSiteLocationScope,
} from "@/lib/custom-site-location-validation";
import {
  customSiteUnitRef,
  CUSTOM_SITE_PLACEMENT_VALUES,
} from "@/lib/custom-site-locations";
import { serializeCustomSiteLocationRow } from "@/lib/custom-site-locations/list-custom-site-locations-for-project";

const PlacementSchema = z.enum(CUSTOM_SITE_PLACEMENT_VALUES);

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  placement: PlacementSchema,
  building: z.string().default(""),
  level: z.string().default(""),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, locationId } = await params;
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const existing = await db.projectCustomSiteLocation.findFirst({
    where: { id: locationId, projectId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { name, placement, building, level } = parsed.data;
  const trimmedName = name.trim();
  const normalizedBuilding = placement === "standalone" ? "" : building.trim();
  const normalizedLevel = placement === "building_level" ? level.trim() : "";

  const scopeCheck = await validateCustomSiteLocationScope(
    projectId,
    placement,
    normalizedBuilding,
    normalizedLevel,
  );
  if (!scopeCheck.ok) {
    return NextResponse.json({ error: scopeCheck.error, code: "invalid_scope" }, { status: 422 });
  }

  if (
    await customSiteLocationNameTaken(
      projectId,
      trimmedName,
      {
        placement,
        building: normalizedBuilding,
        level: normalizedLevel,
      },
      locationId,
    )
  ) {
    return NextResponse.json(
      { error: "A custom location with this name already exists in this area", code: "duplicate_name" },
      { status: 409 },
    );
  }

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);

  const oldUnitRef = customSiteUnitRef(existing);
  const newUnitRef = customSiteUnitRef({ id: locationId, name: trimmedName });
  const unitRefChanged = oldUnitRef !== newUnitRef;

  const updateData = {
    name: trimmedName,
    placement,
    building: normalizedBuilding,
    level: normalizedLevel,
  };
  const updateArgs = {
    where: { id: locationId },
    data: updateData,
    include: { createdBy: { select: { id: true, name: true } } },
  } as const;

  let updated;
  try {
    if (unitRefChanged) {
      [updated] = await db.$transaction([
        db.projectCustomSiteLocation.update(updateArgs),
        db.projectObservation.updateMany({
          where: { projectId, unitRef: oldUnitRef },
          data: { unitRef: newUnitRef },
        }),
        db.projectIssue.updateMany({
          where: { projectId, unitRef: oldUnitRef },
          data: { unitRef: newUnitRef },
        }),
      ]);
    } else {
      updated = await db.projectCustomSiteLocation.update(updateArgs);
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A custom location with this name already exists in this area", code: "duplicate_name" },
        { status: 409 },
      );
    }
    throw err;
  }

  const actorName = resolvedUserId ? await resolveActorName(resolvedUserId) : null;
  void logActivity(projectId, resolvedUserId, actorName, {
    eventType: "CUSTOM_SITE_LOCATION_UPDATED",
    locationId: updated.id,
    name: updated.name,
    placement: updated.placement,
    building: updated.building,
    level: updated.level,
    previousName: existing.name,
    previousPlacement: existing.placement,
  });

  const [obsCount, issueCount] = await Promise.all([
    db.projectObservation.count({ where: { projectId, unitRef: newUnitRef } }),
    db.projectIssue.count({ where: { projectId, unitRef: newUnitRef } }),
  ]);

  return NextResponse.json({
    location: serializeCustomSiteLocationRow(updated, {
      observations: obsCount,
      issues: issueCount,
    }),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, locationId } = await params;
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const existing = await db.projectCustomSiteLocation.findFirst({
    where: { id: locationId, projectId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const unitRef = customSiteUnitRef(existing);
  const [obsCount, issueCount] = await Promise.all([
    db.projectObservation.count({ where: { projectId, unitRef } }),
    db.projectIssue.count({ where: { projectId, unitRef } }),
  ]);
  if (obsCount > 0 || issueCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a site location that has observations or issues", code: "has_field_notes" },
      { status: 409 },
    );
  }

  await db.projectCustomSiteLocation.delete({ where: { id: locationId } });

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);
  const actorName = resolvedUserId ? await resolveActorName(resolvedUserId) : null;
  void logActivity(projectId, resolvedUserId, actorName, {
    eventType: "CUSTOM_SITE_LOCATION_DELETED",
    locationId: existing.id,
    name: existing.name,
    placement: existing.placement,
    building: existing.building,
    level: existing.level,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, locationId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const row = await db.projectCustomSiteLocation.findFirst({
    where: { id: locationId, projectId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ location: row });
}
