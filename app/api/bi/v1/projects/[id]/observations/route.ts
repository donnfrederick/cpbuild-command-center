/**
 * GET /api/bi/v1/projects/{id}/observations
 *
 * Returns all field observations recorded for a project.
 * Requires scope: bi:observations
 *
 * Response: flat JSON array — each row maps directly to a PBI table row.
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:observations")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:observations" }), { status: 403, headers: biResponseHeaders() });
  }

  const { id: projectId } = await params;

  if (!isProjectAllowed(keyCtx, projectId)) {
    return new Response(JSON.stringify({ error: "Forbidden", message: "This API key is not authorized to access this project." }), { status: 403, headers: biResponseHeaders() });
  }

  const project = await db.project.findFirst({
    where: biProjectByIdWhere(projectId, keyCtx.allowedProjectIds),
    select: { id: true },
  });
  if (!project) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: biResponseHeaders() });
  }

  const observations = await db.projectObservation.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      unitRef: true,
      title: true,
      description: true,
      observationTypeCode: true,
      bulkGroupId: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { name: true, email: true } },
      scopeTags: { select: { projectRowId: true } },
      _count: { select: { attachments: true, comments: true } },
    },
  });

  const flat = observations.map((obs) => ({
    observationId: obs.id,
    projectId: obs.projectId,
    unitRef: obs.unitRef ?? null,
    title: obs.title,
    description: obs.description ?? null,
    observationType: obs.observationTypeCode,
    bulkGroupId: obs.bulkGroupId ?? null,
    attachmentCount: obs._count.attachments,
    commentCount: obs._count.comments,
    // comma-separated row IDs — easy to split in Power BI (Transform → Split Column)
    scopeTagRowIds: obs.scopeTags.map((t) => t.projectRowId).join(",") || null,
    authorName: obs.author?.name ?? null,
    authorEmail: obs.author?.email ?? null,
    createdAt: obs.createdAt,
    updatedAt: obs.updatedAt,
  }));

  return new Response(JSON.stringify(flat), { status: 200, headers: biResponseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
