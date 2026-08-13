import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import type { CanonicalShape } from "@/lib/project-units-serialize";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

/**
 * GET /api/projects/[id]/units/lookup?building=South&level=2&unit=S200
 *
 * Finds any scope row for the given building/level/unit, then returns the
 * same unit-preview payload as GET /api/projects/[id]/units/[rowId].
 * Used by the activity log to open the unit modal for bulk-update entries
 * that have structured location data but no specific rowId.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const { searchParams } = req.nextUrl;
  const building = searchParams.get("building") ?? "";
  const level = searchParams.get("level") ?? "";
  const unit = searchParams.get("unit") ?? "";

  if (!unit) return NextResponse.json({ error: "unit is required" }, { status: 400 });

  const anchor = await db.projectRow.findFirst({
    where: {
      projectId,
      unit,
      ...(building ? { building } : {}),
      ...(level ? { level } : {}),
    },
    select: { building: true, level: true, unit: true, unitType: true, area: true, buildPhase: true },
  });
  if (!anchor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [scopes, overrideRows] = await Promise.all([
    db.projectRow.findMany({
      where: { projectId, building: anchor.building, level: anchor.level, unit: anchor.unit },
      orderBy: { rowIndex: "asc" },
      include: {
        scopeType: {
          select: {
            id: true, code: true, name: true,
            canonicalScopeType: { select: { id: true, code: true, displayName: true } },
          },
        },
        uom: { select: { code: true, name: true } },
        installer: { select: { name: true } },
        subScopeInstances: {
          include: {
            subScope: {
              select: { id: true, name: true, displayOrder: true, unitType: true, scopeTypeId: true },
            },
          },
          orderBy: { subScope: { displayOrder: "asc" } },
        },
        clearInspections: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, createdAt: true },
        },
      },
    }),
    db.projectScopeOverride.findMany({
      where: { projectId },
      select: {
        scopeTypeId: true,
        canonicalScopeType: { select: { id: true, code: true, displayName: true } },
      },
    }),
  ]);

  const overrideMap = new Map<string, CanonicalShape>(
    overrideRows.map((ov) => [ov.scopeTypeId, ov.canonicalScopeType]),
  );

  return NextResponse.json({
    building: anchor.building,
    level: anchor.level,
    unit: anchor.unit,
    area: anchor.area ?? "",
    buildPhase: anchor.buildPhase ?? "",
    unitType: anchor.unitType ?? "",
    scopes: scopes.map((s) => ({
      id: s.id,
      scopeType: s.scopeType
        ? {
            id: s.scopeType.id,
            code: s.scopeType.code,
            name: s.scopeType.name,
            canonicalScopeType:
              (s.scopeType ? overrideMap.get(s.scopeType.id) : undefined) ??
              s.scopeType.canonicalScopeType ??
              null,
          }
        : null,
      description: "",
      qty: s.qty != null ? Number(s.qty) : null,
      uom: s.uom ? { code: s.uom.code, name: s.uom.name } : null,
      percentComplete: s.percentComplete != null ? Number(s.percentComplete) : null,
      installer: s.installer ? { name: s.installer.name } : null,
      shipPhase: s.shipPhase ?? "",
      buildPhase: s.buildPhase ?? "",
      scopeStage: s.scopeStage ?? null,
      scopeStatus: s.scopeStatus ?? null,
      inspectionStatus: s.inspectionStatus ?? null,
      subScopeInstances: s.subScopeInstances.map((inst) => ({
        id: inst.id,
        subScopeId: inst.subScopeId,
        subScope: inst.subScope,
        qty: inst.qty != null ? Number(inst.qty) : null,
        scopeStage: inst.scopeStage ?? null,
        scopeStatus: inst.scopeStatus ?? null,
        inspectionStatus: inst.inspectionStatus ?? null,
      })),
      clearInspection: s.clearInspections[0]
        ? {
            id: s.clearInspections[0].id,
            status: s.clearInspections[0].status,
            createdAt: s.clearInspections[0].createdAt.toISOString(),
          }
        : null,
    })),
  });
}
