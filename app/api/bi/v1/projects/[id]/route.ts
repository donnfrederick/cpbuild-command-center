/**
 * GET /api/bi/v1/projects/{id}
 *
 * Returns a single project row enriched with Unifier metadata.
 * Requires scope: bi:projects
 *
 * Returns 403 if the key's allowedProjectIds does not include this project.
 * Returns 404 if the project does not exist or is soft-deleted / test.
 */

import { validateBiKey, requireScope, isProjectAllowed, biResponseHeaders } from "@/lib/bi-auth";
import { biProjectByIdWhere } from "@/lib/bi-project-access";
import { db } from "@/lib/db";
import { enrichProjectById } from "@/lib/project-unifier-merge";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:projects")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:projects" }), { status: 403, headers: biResponseHeaders() });
  }

  const { id } = await params;

  if (!isProjectAllowed(keyCtx, id)) {
    return new Response(JSON.stringify({ error: "Forbidden", message: "This API key is not authorized to access this project." }), { status: 403, headers: biResponseHeaders() });
  }

  const dbRow = await db.project.findFirst({
    where: biProjectByIdWhere(id, keyCtx.allowedProjectIds),
    select: { id: true, createdAt: true, updatedAt: true, isTestProject: true },
  });

  if (!dbRow) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: biResponseHeaders() });
  }

  const p = await enrichProjectById(id);

  if (!p) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: biResponseHeaders() });
  }

  const flat = {
    projectId: p.id,
    projectName: p.projectName,
    unifierPid: p.unifierPid ?? null,
    unifierProjectNumber: p.unifierProjectNumber ?? null,
    siteLocation: p.siteLocation ?? null,
    lifecycleStatus: p.lifecycleStatus ?? null,
    phaseDisplay: p.status ?? null,
    startDate: p.startDate ?? null,
    installManagerId: p.installManagerId ?? null,
    installManagerName: p.installManagerName ?? null,
    projectManagerId: p.projectManagerId ?? null,
    projectManagerName: p.projectManagerName ?? null,
    createdAt: dbRow.createdAt,
    updatedAt: dbRow.updatedAt,
  };

  return new Response(JSON.stringify(flat), { status: 200, headers: biResponseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
