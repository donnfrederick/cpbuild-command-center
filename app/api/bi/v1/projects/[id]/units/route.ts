/**
 * GET /api/bi/v1/projects/{id}/units
 *
 * Returns all Field Tracker (UPM) unit rows for a project.
 * Requires scope: bi:units
 *
 * Query params:
 *   ?page=1  (1-based, default 1)
 *   ?limit=500 (default 500, max 2000)
 *
 * Response: JSON envelope `{ data, pagination }` where `data` is a flat array of unit rows
 * and `pagination` contains `{ page, limit, total, totalPages, hasNextPage, nextPage }`.
 */

import { validateBiKey, requireScope, isProjectAllowed, biResponseHeaders } from "@/lib/bi-auth";
import { biProjectByIdWhere } from "@/lib/bi-project-access";
import { db } from "@/lib/db";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:units")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:units" }), { status: 403, headers: biResponseHeaders() });
  }

  const { id: projectId } = await params;

  if (!isProjectAllowed(keyCtx, projectId)) {
    return new Response(JSON.stringify({ error: "Forbidden", message: "This API key is not authorized to access this project." }), { status: 403, headers: biResponseHeaders() });
  }

  // Verify project exists and is accessible (non-test projects + whitelisted test clones).
  const project = await db.project.findFirst({
    where: biProjectByIdWhere(projectId, keyCtx.allowedProjectIds),
    select: { id: true },
  });
  if (!project) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: biResponseHeaders() });
  }

  // Parse pagination params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    db.projectRow.count({ where: { projectId } }),
    db.projectRow.findMany({
      where: { projectId },
      orderBy: { rowIndex: "asc" },
      skip,
      take: limit,
      select: {
        id: true,
        projectId: true,
        rowIndex: true,
        building: true,
        level: true,
        unit: true,
        area: true,
        shipPhase: true,
        buildPhase: true,
        scheme: true,
        unitType: true,
        description: true,
        scopeType: { select: { code: true, name: true } },
        csiPrimeCode: true,
        csiDetailCode: true,
        locationType: { select: { code: true, name: true } },
        costType: { select: { code: true, name: true } },
        installer: { select: { code: true, name: true } },
        qty: true,
        uom: { select: { code: true, name: true } },
        unitRate: true,
        budgetedManHours: true,
        startDate: true,
        finishDate: true,
        percentComplete: true,
        actualManHours: true,
        scopeStage: true,
        scopeStatus: true,
        inspectionStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const flat = rows.map((r) => ({
    rowId: r.id,
    projectId: r.projectId,
    rowIndex: r.rowIndex,
    building: r.building,
    level: r.level,
    unit: r.unit,
    area: r.area,
    shipPhase: r.shipPhase,
    buildPhase: r.buildPhase,
    scheme: r.scheme,
    unitType: r.unitType,
    description: r.description,
    scopeCode: r.scopeType?.code ?? null,
    scopeName: r.scopeType?.name ?? null,
    csiPrimeCode: r.csiPrimeCode,
    csiDetailCode: r.csiDetailCode,
    locationCode: r.locationType?.code ?? null,
    locationName: r.locationType?.name ?? null,
    costTypeCode: r.costType?.code ?? null,
    costTypeName: r.costType?.name ?? null,
    installerCode: r.installer?.code ?? null,
    installerName: r.installer?.name ?? null,
    qty: r.qty !== null ? Number(r.qty) : null,
    uomCode: r.uom?.code ?? null,
    uomName: r.uom?.name ?? null,
    unitRate: r.unitRate !== null ? Number(r.unitRate) : null,
    budgetedManHours: r.budgetedManHours !== null ? Number(r.budgetedManHours) : null,
    startDate: r.startDate ?? null,
    finishDate: r.finishDate ?? null,
    percentComplete: r.percentComplete !== null ? Number(r.percentComplete) : null,
    actualManHours: r.actualManHours !== null ? Number(r.actualManHours) : null,
    scopeStage: r.scopeStage ?? null,
    scopeStatus: r.scopeStatus ?? null,
    inspectionStatus: r.inspectionStatus ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const totalPages = Math.ceil(total / limit);

  return new Response(
    JSON.stringify({
      data: flat,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        nextPage: page < totalPages ? page + 1 : null,
      },
    }),
    { status: 200, headers: biResponseHeaders() }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
