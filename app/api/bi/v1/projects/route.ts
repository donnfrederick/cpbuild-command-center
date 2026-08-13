/**
 * GET /api/bi/v1/projects
 *
 * Returns all active, non-test projects enriched with Unifier metadata.
 * Requires scope: bi:projects
 *
 * Response: flat JSON array — each row maps directly to a PBI table row.
 */

import { validateBiKey, requireScope, biResponseHeaders } from "@/lib/bi-auth";
import { biProjectListWhere } from "@/lib/bi-project-access";
import { db } from "@/lib/db";
import { enrichProjectList } from "@/lib/project-unifier-merge";

export async function GET(request: Request) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:projects")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:projects" }), { status: 403, headers: biResponseHeaders() });
  }

  const rows = await db.project.findMany({
    where: biProjectListWhere(keyCtx.allowedProjectIds),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      installManagerId: true,
      installManagerName: true,
      projectManagerId: true,
      unifierPid: true,
      deletedAt: true,
      isTestProject: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const enriched = await enrichProjectList(
    rows.map((r) => Object.assign(r, { scopeTypes: [] as string[] }))
  );

  // Build a lookup map for DB dates (not on the enriched Project type)
  const dateMap = new Map(rows.map((r) => [r.id, { createdAt: r.createdAt, updatedAt: r.updatedAt }]));

  // All rows already filtered by allowedProjectIds in the DB query above
  const allowed = enriched;

  const flat = allowed.map((p) => ({
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
    createdAt: dateMap.get(p.id)?.createdAt ?? null,
    updatedAt: dateMap.get(p.id)?.updatedAt ?? null,
  }));

  return new Response(JSON.stringify(flat), { status: 200, headers: biResponseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
