import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { promoteUploadCaptureContextsForStorageKeys } from "@/lib/field-media/promote-upload-capture-context";

const ResolveSchema = z.object({
  resolutionNote: z.string().max(2000).optional(),
  resolveGroup: z.boolean().default(false),
  attachmentKeys:          z.array(z.string().max(500)).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentUrls:          z.array(z.string().max(2000)).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentMimeTypes:     z.array(z.string().max(100)).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentFileSizeBytes: z.array(z.number().int().positive()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
});

type Params = { params: Promise<{ id: string; issueId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const issue = await db.projectIssue.findFirst({ where: { id: issueId, projectId } });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // INSTALL_MANAGER and INSTALL_DIRECTOR are operational roles — they own field work and
  // must be able to resolve any issue on their project, not just ones they created.
  // ADMIN and DEVELOPER also have full resolve rights. DESIGNER can edit issue content
  // via PATCH but cannot resolve issues they did not create.
  const isPrivileged =
    effective.user.role === "ADMIN" ||
    effective.user.role === "DEVELOPER" ||
    effective.user.role === "INSTALL_MANAGER" ||
    effective.user.role === "INSTALL_DIRECTOR";
  if (issue.createdById !== effective.user.id && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden — only the issue creator, an admin, a developer, an install manager, or an install director can resolve this issue" }, { status: 403 });
  }

  if (issue.status === "RESOLVED") {
    return NextResponse.json({ error: "Issue is already resolved" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { resolutionNote, resolveGroup, attachmentKeys, attachmentUrls, attachmentMimeTypes, attachmentFileSizeBytes } = parsed.data;
  const resolvedAt = new Date();
  const sessionUserId = effective.user.id;

  // The dev-bypass session uses id:"dev-user" which has no DB row.
  // Verify the user exists; if not, set resolvedById to null so FK writes
  // still succeed (nullable field) without attributing the resolution to a
  // random user.
  let resolvedById: string | null = sessionUserId;
  const sessionUserExists = await db.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true },
  });
  if (!sessionUserExists) {
    resolvedById = null;
  }

  // Determine the set of issue IDs to resolve
  let issueIds: string[] = [issueId];
  if (resolveGroup && issue.bulkGroupId) {
    const siblings = await db.projectIssue.findMany({
      where: { bulkGroupId: issue.bulkGroupId, projectId, status: "OPEN" },
      select: { id: true },
    });
    issueIds = siblings.map((s) => s.id);
  }

  try {
    // Array-form transaction — Railway/PgBouncer compatible
    const updates = issueIds.map((id) =>
      db.projectIssue.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedAt,
          resolvedById,
          // Store the resolution note as a first-class field, not a comment,
          // so it can be displayed distinctly from user comments in the UI.
          ...(resolutionNote ? { resolutionNote } : {}),
        },
      })
    );

    // Attach resolution photos to the primary issue (visible in the attachments grid).
    // resolutionNote is stored as a first-class field on ProjectIssue — not as a comment.
    const attachments = resolvedById
      ? attachmentKeys.map((key, i) =>
          db.mediaAttachment.create({
            data: {
              storageKey:    key,
              storageUrl:    attachmentUrls[i] ?? "",
              mimeType:      attachmentMimeTypes[i] ?? "application/octet-stream",
              fileSizeBytes: attachmentFileSizeBytes[i] ?? null,
              issueId:       issueId,
              uploadedById:  resolvedById as string,
            },
          })
        )
      : [];

    await db.$transaction([...updates, ...attachments]);

    if (attachmentKeys.length > 0) {
      const newAttachments = await db.mediaAttachment.findMany({
        where: { issueId, storageKey: { in: attachmentKeys } },
        select: { id: true, storageKey: true },
      });
      await promoteUploadCaptureContextsForStorageKeys(newAttachments);
    }

    // Return the primary issue with full detail including newly uploaded attachments
    const updated = await db.projectIssue.findFirst({
      where: { id: issueId },
      select: {
        id: true, status: true, resolvedAt: true, resolvedById: true, resolutionNote: true,
        resolvedBy: { select: { id: true, name: true, email: true } },
        attachments: true,
        comments: {
          where: { deletedAt: null },
          include: { author: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const requestBody =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    const resolutionAttachmentIds =
      attachmentKeys.length > 0
        ? (
            await db.mediaAttachment.findMany({
              where: { issueId, storageKey: { in: attachmentKeys } },
              select: { id: true },
            })
          ).map((a) => a.id)
        : [];

    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "ISSUE_RESOLVED",
        issueId,
        shortDescription: issue.shortDescription,
        unitRef: issue.unitRef ?? null,
      },
      { requestBody, attachmentIds: resolutionAttachmentIds },
    );

    return NextResponse.json({ ...updated, resolvedCount: issueIds.length });
  } catch (err) {
    console.error("[resolve POST] Prisma error:", err);
    return NextResponse.json({ error: "Failed to resolve issue" }, { status: 500 });
  }
}
