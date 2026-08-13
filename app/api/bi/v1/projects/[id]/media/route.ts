/**
 * GET /api/bi/v1/projects/{id}/media
 *
 * Returns every media attachment (photos, videos, audio) for a project in a
 * flat table optimised for Power BI import. Each row is one file.
 *
 * parentType distinguishes where the file was attached:
 *   ISSUE        → join to /issues on parentId = issueId
 *   OBSERVATION  → join to /observations on parentId = observationId
 *   UNIT_ALBUM   → standalone unit photo; parentId is null, unitRef is set
 *
 * storageUrl is a Supabase Storage signed URL (1-year expiry). It is
 * directly openable in a browser or embeddable as an image in a Power BI
 * report without any additional authentication.
 *
 * Requires scope: bi:media
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
  if (!requireScope(keyCtx, "bi:media")) {
    return new Response(
      JSON.stringify({ error: "Forbidden", requiredScope: "bi:media" }),
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

  const attachments = await db.mediaAttachment.findMany({
    where: {
      OR: [
        // Issue attachments for this project
        { issue: { projectId } },
        // Observation attachments for this project
        { observation: { projectId } },
        // Unit album photos for this project
        { unitPhotoProjectId: projectId },
      ],
    },
    select: {
      id: true,
      storageKey: true,
      storageUrl: true,
      mimeType: true,
      fileSizeBytes: true,
      durationSeconds: true,
      caption: true,
      transcriptStatus: true,
      transcriptEnglish: true,
      issueId: true,
      observationId: true,
      unitPhotoProjectId: true,
      unitPhotoUnitRef: true,
      uploadedBy: { select: { name: true, email: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const flat = attachments.map((a) => {
    let parentType: "ISSUE" | "OBSERVATION" | "UNIT_ALBUM";
    let parentId: string | null = null;
    let unitRef: string | null = null;

    if (a.issueId) {
      parentType = "ISSUE";
      parentId = a.issueId;
    } else if (a.observationId) {
      parentType = "OBSERVATION";
      parentId = a.observationId;
    } else {
      parentType = "UNIT_ALBUM";
      unitRef = a.unitPhotoUnitRef ?? null;
    }

    return {
      attachmentId: a.id,
      projectId,
      parentType,
      parentId,
      unitRef,
      storageUrl: a.storageUrl,
      storageKey: a.storageKey,
      mimeType: a.mimeType,
      fileSizeBytes: a.fileSizeBytes ?? null,
      durationSeconds: a.durationSeconds ?? null,
      caption: a.caption ?? null,
      transcriptStatus: a.transcriptStatus,
      transcriptEnglish: a.transcriptEnglish ?? null,
      uploadedByName: a.uploadedBy?.name ?? null,
      uploadedByEmail: a.uploadedBy?.email ?? null,
      createdAt: a.createdAt,
    };
  });

  return new Response(JSON.stringify(flat), {
    status: 200,
    headers: biResponseHeaders(),
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
