/**
 * GET /api/bi/v1/projects/{id}/inspections
 *
 * Returns every clear inspection record for a project — one row per
 * PASS/FAIL event, ordered oldest first. Multiple rows per unit scope row
 * are possible (each status change creates a new entry to preserve history).
 *
 * Join to /units on rowId = unitRowId to correlate inspections with
 * specific units, buildings, levels, and scope types.
 *
 * Requires scope: bi:inspections
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
  if (!requireScope(keyCtx, "bi:inspections")) {
    return new Response(
      JSON.stringify({ error: "Forbidden", requiredScope: "bi:inspections" }),
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

  const inspections = await db.clearInspection.findMany({
    where: {
      deletedAt: null,
      row: { projectId },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      row: {
        select: {
          id: true,
          building: true,
          level: true,
          unit: true,
          area: true,
          scopeTypeId: true,
        },
      },
    },
  });

  const flat = inspections.map((i) => ({
    inspectionId: i.id,
    projectId,
    result: i.status, // "PASSED" | "FAILED"
    unitRowId: i.row.id,
    building: i.row.building,
    level: i.row.level,
    unit: i.row.unit,
    area: i.row.area ?? null,
    scopeTypeId: i.row.scopeTypeId ?? null,
    createdAt: i.createdAt,
  }));

  return new Response(JSON.stringify(flat), {
    status: 200,
    headers: biResponseHeaders(),
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
