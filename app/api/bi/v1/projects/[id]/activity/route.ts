/**
 * GET /api/bi/v1/projects/{id}/activity
 *
 * Returns the activity log for a project (most recent first).
 * Requires scope: bi:activity
 *
 * Query params:
 *   ?page=1  (1-based, default 1)
 *   ?limit=500 (default 500, max 2000)
 *
 * Response: JSON envelope `{ data, pagination }` where `data` is a flat array of activity events
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
  if (!requireScope(keyCtx, "bi:activity")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:activity" }), { status: 403, headers: biResponseHeaders() });
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

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const [total, events] = await Promise.all([
    db.activityLog.count({ where: { projectId } }),
    db.activityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        projectId: true,
        userId: true,
        userName: true,
        eventType: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  const flat = events.map((e) => ({
    eventId: e.id,
    projectId: e.projectId,
    userId: e.userId ?? null,
    userName: e.userName ?? null,
    eventType: e.eventType,
    metadata: e.metadata,
    createdAt: e.createdAt,
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
