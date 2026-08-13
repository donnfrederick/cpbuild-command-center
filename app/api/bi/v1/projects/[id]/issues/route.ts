/**
 * GET /api/bi/v1/projects/{id}/issues
 *
 * Returns all issues logged against a project.
 * Requires scope: bi:issues
 *
 * Response: flat JSON array — each row maps directly to a PBI table row.
 */

import { validateBiKey, requireScope, isProjectAllowed, biResponseHeaders } from "@/lib/bi-auth";
import { biProjectByIdWhere } from "@/lib/bi-project-access";
import { db } from "@/lib/db";
import { serializeIssuesResponsibleParties } from "@/lib/issues/serialize-issue-parties";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:issues")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:issues" }), { status: 403, headers: biResponseHeaders() });
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

  const issues = await db.projectIssue.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      unitRef: true,
      shortDescription: true,
      notes: true,
      issueTypeCode: true,
      responsiblePartyCode: true,
      responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
      isBlockingWork: true,
      status: true,
      resolvedAt: true,
      resolutionNote: true,
      bulkGroupId: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
      resolvedBy: { select: { name: true, email: true } },
      scopeTags: { select: { projectRowId: true } },
      _count: { select: { attachments: true, comments: true } },
    },
  });

  const serialized = serializeIssuesResponsibleParties(issues);
  const flat = serialized.map((issue) => ({
    issueId: issue.id,
    projectId: issue.projectId,
    unitRef: issue.unitRef ?? null,
    shortDescription: issue.shortDescription,
    notes: issue.notes ?? null,
    issueType: issue.issueTypeCode,
    responsibleParty: issue.responsiblePartyCode,
    responsibleParties: issue.responsibleParties,
    isBlockingWork: issue.isBlockingWork,
    status: issue.status,
    resolvedAt: issue.resolvedAt ?? null,
    resolutionNote: issue.resolutionNote ?? null,
    bulkGroupId: issue.bulkGroupId ?? null,
    attachmentCount: issue._count.attachments,
    commentCount: issue._count.comments,
    // comma-separated row IDs — easy to split in Power BI (Transform → Split Column)
    scopeTagRowIds: issue.scopeTags.map((t) => t.projectRowId).join(",") || null,
    createdByName: issue.createdBy?.name ?? null,
    createdByEmail: issue.createdBy?.email ?? null,
    resolvedByName: issue.resolvedBy?.name ?? null,
    resolvedByEmail: issue.resolvedBy?.email ?? null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }));

  return new Response(JSON.stringify(flat), { status: 200, headers: biResponseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
