/**
 * GET /api/bi/v1/feedback
 *
 * Returns all feedback reports (bugs + feature requests) submitted through
 * the app or via Marker.io, with comment count and comment threads available
 * in a separate flat table via the ?include=comments query param.
 *
 * Not project-scoped — feedback is app-wide. allowedProjectIds is ignored.
 * Requires scope: bi:feedback
 *
 * Response: flat JSON array.
 * Optional: ?include=comments — returns { reports: [...], comments: [...] }
 */

import { validateBiKey, requireScope, biResponseHeaders } from "@/lib/bi-auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: biResponseHeaders(),
    });
  }
  if (!requireScope(keyCtx, "bi:feedback")) {
    return new Response(
      JSON.stringify({ error: "Forbidden", requiredScope: "bi:feedback" }),
      { status: 403, headers: biResponseHeaders() }
    );
  }

  const url = new URL(request.url);
  const includeComments = url.searchParams.get("include") === "comments";

  const reports = await db.feedbackReport.findMany({
    where: {
      // Exclude DELETED status — these are soft-deleted
      status: { not: "DELETED" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      shortId: true,
      type: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      source: true,
      pageUrl: true,
      videoUrl: true,
      adminNote: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      assignee: { select: { name: true, email: true } },
      _count: { select: { comments: true } },
    },
  });

  const flatReports = reports.map((r) => ({
    feedbackId: r.id,
    shortRef: `FB-${String(r.shortId).padStart(4, "0")}`,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority ?? null,
    source: r.source,
    pageUrl: r.pageUrl ?? null,
    videoUrl: r.videoUrl ?? null,
    adminNote: r.adminNote ?? null,
    commentCount: r._count.comments,
    submittedByName: r.user?.name ?? null,
    submittedByEmail: r.user?.email ?? null,
    assignedToName: r.assignee?.name ?? null,
    assignedToEmail: r.assignee?.email ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  if (!includeComments) {
    return new Response(JSON.stringify(flatReports), {
      status: 200,
      headers: biResponseHeaders(),
    });
  }

  // Also fetch all non-deleted comments
  const comments = await db.feedbackComment.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      feedbackReportId: true,
      body: true,
      editedAt: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  const flatComments = comments.map((c) => ({
    commentId: c.id,
    feedbackId: c.feedbackReportId,
    authorName: c.author?.name ?? null,
    authorEmail: c.author?.email ?? null,
    body: c.body,
    editedAt: c.editedAt ?? null,
    createdAt: c.createdAt,
  }));

  return new Response(
    JSON.stringify({ reports: flatReports, comments: flatComments }),
    { status: 200, headers: biResponseHeaders() }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
