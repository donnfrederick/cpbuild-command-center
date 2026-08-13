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
  CUSTOM_SITE_PLACEMENT_VALUES,
} from "@/lib/custom-site-locations";
import {
  listCustomSiteLocationsForProject,
  serializeCustomSiteLocationRow,
} from "@/lib/custom-site-locations/list-custom-site-locations-for-project";

const PlacementSchema = z.enum(CUSTOM_SITE_PLACEMENT_VALUES);

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  placement: PlacementSchema,
  building: z.string().default(""),
  level: z.string().default(""),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const locations = await listCustomSiteLocationsForProject(db, projectId);
  return NextResponse.json({ locations });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const parsed = CreateSchema.safeParse(body);
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
    await customSiteLocationNameTaken(projectId, trimmedName, {
      placement,
      building: normalizedBuilding,
      level: normalizedLevel,
    })
  ) {
    return NextResponse.json(
      { error: "A custom location with this name already exists in this area", code: "duplicate_name" },
      { status: 409 },
    );
  }

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);
  if (!resolvedUserId) {
    return NextResponse.json({ error: "No users found in database" }, { status: 500 });
  }

  const maxSort = await db.projectCustomSiteLocation.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  let row;
  try {
    row = await db.projectCustomSiteLocation.create({
      data: {
        projectId,
        name: trimmedName,
        placement,
        building: normalizedBuilding,
        level: normalizedLevel,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        createdById: resolvedUserId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A custom location with this name already exists in this area", code: "duplicate_name" },
        { status: 409 },
      );
    }
    throw err;
  }

  const actorName = await resolveActorName(resolvedUserId);
  void logActivity(projectId, resolvedUserId, actorName, {
    eventType: "CUSTOM_SITE_LOCATION_CREATED",
    locationId: row.id,
    name: row.name,
    placement: row.placement,
    building: row.building,
    level: row.level,
  });

  return NextResponse.json(
    { location: serializeCustomSiteLocationRow(row, { observations: 0, issues: 0 }) },
    { status: 201 },
  );
}
