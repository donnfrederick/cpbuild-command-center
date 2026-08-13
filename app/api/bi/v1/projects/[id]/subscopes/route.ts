/**
 * GET /api/bi/v1/projects/{id}/subscopes
 *
 * Returns sub-scope definitions and their per-row instances for a project.
 * Sub-scopes represent a granular breakdown of a scope type into named
 * sub-categories (e.g. "Kitchen Cabinetry" within the TILE scope).
 *
 * Response shape: { definitions: [...], instances: [...] }
 *   definitions — one row per sub-scope definition (name, scope type, unit type)
 *   instances   — one row per (sub-scope × unit row) pairing, with stage/status/qty
 *
 * If a project has no sub-scopes, both arrays will be empty.
 *
 * Requires scope: bi:subscopes
 */

import { validateBiKey, requireScope, isProjectAllowed, biResponseHeaders } from "@/lib/bi-auth";
import { biProjectByIdWhere } from "@/lib/bi-project-access";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: biResponseHeaders(),
    });
  }
  if (!requireScope(keyCtx, "bi:subscopes")) {
    return new Response(
      JSON.stringify({ error: "Forbidden", requiredScope: "bi:subscopes" }),
      { status: 403, headers: biResponseHeaders() }
    );
  }

  const { id: projectId } = await params;

  if (!isProjectAllowed(keyCtx, projectId)) {
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        message: "This API key is not authorized to access this project.",
      }),
      { status: 403, headers: biResponseHeaders() }
    );
  }

  const project = await db.project.findFirst({
    where: biProjectByIdWhere(projectId, keyCtx.allowedProjectIds),
    select: { id: true },
  });
  if (!project) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: biResponseHeaders(),
    });
  }

  const [defs, instances] = await Promise.all([
    db.projectSubScope.findMany({
      where: { projectId },
      orderBy: [{ scopeTypeId: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        name: true,
        unitType: true,
        displayOrder: true,
        qty: true,
        createdAt: true,
        scopeType: { select: { code: true, name: true } },
      },
    }),
    db.projectSubScopeInstance.findMany({
      where: { subScope: { projectId } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        subScopeId: true,
        rowId: true,
        scopeStage: true,
        scopeStatus: true,
        inspectionStatus: true,
        qty: true,
        createdAt: true,
        updatedAt: true,
        row: {
          select: {
            building: true,
            level: true,
            unit: true,
            area: true,
          },
        },
      },
    }),
  ]);

  const flatDefs = defs.map((d) => ({
    subScopeId: d.id,
    projectId,
    name: d.name,
    unitType: d.unitType,
    displayOrder: d.displayOrder,
    qty: d.qty ? Number(d.qty) : null,
    scopeTypeCode: d.scopeType.code,
    scopeTypeName: d.scopeType.name,
    createdAt: d.createdAt,
  }));

  const flatInstances = instances.map((i) => ({
    instanceId: i.id,
    projectId,
    subScopeId: i.subScopeId,
    unitRowId: i.rowId,
    building: i.row.building,
    level: i.row.level,
    unit: i.row.unit,
    area: i.row.area ?? null,
    scopeStage: i.scopeStage ?? null,
    scopeStatus: i.scopeStatus ?? null,
    inspectionStatus: i.inspectionStatus ?? null,
    qty: i.qty ? Number(i.qty) : null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }));

  return new Response(
    JSON.stringify({ definitions: flatDefs, instances: flatInstances }),
    { status: 200, headers: biResponseHeaders() }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
