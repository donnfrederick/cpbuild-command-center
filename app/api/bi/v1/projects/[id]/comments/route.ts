/**
 * GET /api/bi/v1/projects/{id}/comments
 *
 * Returns all non-deleted comments for issues and observations in a project,
 * combined into a single flat table. parentType distinguishes the source:
 *   ISSUE       → join to /issues on parentId = issueId
 *   OBSERVATION → join to /observations on parentId = observationId
 *
 * Requires scope: bi:comments
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
  if (!requireScope(keyCtx, "bi:comments")) {
    return new Response(
      JSON.stringify({ error: "Forbidden", requiredScope: "bi:comments" }),
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

  const [issueComments, observationComments] = await Promise.all([
    db.issueComment.findMany({
      where: {
        deletedAt: null,
        issue: { projectId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        issueId: true,
        body: true,
        editedAt: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
    db.observationComment.findMany({
      where: {
        deletedAt: null,
        observation: { projectId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        observationId: true,
        body: true,
        editedAt: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
  ]);

  const flat = [
    ...issueComments.map((c) => ({
      commentId: c.id,
      projectId,
      parentType: "ISSUE" as const,
      parentId: c.issueId,
      authorName: c.author?.name ?? null,
      authorEmail: c.author?.email ?? null,
      body: c.body,
      editedAt: c.editedAt ?? null,
      createdAt: c.createdAt,
    })),
    ...observationComments.map((c) => ({
      commentId: c.id,
      projectId,
      parentType: "OBSERVATION" as const,
      parentId: c.observationId,
      authorName: c.author?.name ?? null,
      authorEmail: c.author?.email ?? null,
      body: c.body,
      editedAt: c.editedAt ?? null,
      createdAt: c.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return new Response(JSON.stringify(flat), {
    status: 200,
    headers: biResponseHeaders(),
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
