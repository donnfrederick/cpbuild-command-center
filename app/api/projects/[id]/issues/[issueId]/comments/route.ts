import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { extractMentionIds } from "@/lib/mention-utils";
import { promoteUploadCaptureContextsFromAttachments } from "@/lib/field-media/promote-upload-capture-context";
import { sendMentionEmail } from "@/lib/email";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import {
  capMentionIdsForBroadcast,
  logMentionEmailActorThrottled,
  tryRecordMentionEmailBatch,
} from "@/lib/email-outbound-rate-limit";

const CreateCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  attachmentKeys: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentUrls: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentMimeTypes: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentFileSizeBytes: z.array(z.number().int().positive()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentCaptions: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
});

type Params = { id: string; issueId: string };

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const issue = await db.projectIssue.findUnique({
    where: { id: issueId, projectId },
    select: { id: true },
  });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const comments = await db.issueComment.findMany({
    where: { issueId, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
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

  const issue = await db.projectIssue.findUnique({
    where: { id: issueId, projectId },
    select: { id: true },
  });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { body: commentBody, attachmentKeys, attachmentUrls, attachmentMimeTypes, attachmentFileSizeBytes, attachmentCaptions } = parsed.data;

  let resolvedUserId = effective.user.id;
  const authorUser = await db.user.findUnique({ where: { id: resolvedUserId }, select: { id: true, name: true, email: true } });
  if (!authorUser) {
    const fallback = await db.user.findFirst({ select: { id: true, name: true, email: true } });
    if (!fallback) return NextResponse.json({ error: "No users found" }, { status: 500 });
    resolvedUserId = fallback.id;
  }
  const actorName = authorUser?.name ?? authorUser?.email ?? "Someone";

  try {
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.issueComment.create({
        data: {
          issueId,
          authorId: resolvedUserId,
          body: commentBody,
          attachments: {
            create: attachmentKeys.map((key, i) => ({
              storageKey: key,
              storageUrl: attachmentUrls[i] ?? "",
              mimeType: attachmentMimeTypes[i] ?? "application/octet-stream",
              fileSizeBytes: attachmentFileSizeBytes[i] ?? null,
              caption: attachmentCaptions[i] ?? null,
              uploadedById: resolvedUserId,
            })),
          },
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
      });
      if (created.attachments.length > 0) {
        await promoteUploadCaptureContextsFromAttachments(tx, created.attachments);
      }
      return created;
    });

    // Fire mention notifications (non-blocking)
    void (async () => {
      try {
        const mentionedIds = capMentionIdsForBroadcast(
          extractMentionIds(commentBody).filter((uid) => uid !== resolvedUserId),
          {
            source: "issue_comment",
            actorUserId: resolvedUserId,
            projectId,
            issueId,
          }
        );
        if (mentionedIds.length === 0) return;

        const mentionedUsers = await db.user.findMany({
          where: { id: { in: mentionedIds } },
          select: { id: true, name: true, email: true },
        });

        if (mentionedUsers.length === 0) return;

        const mentionRl = tryRecordMentionEmailBatch(resolvedUserId, mentionedUsers.length);
        if (!mentionRl.ok) {
          logMentionEmailActorThrottled("issue_comment", {
            actorUserId: resolvedUserId,
            denied: mentionRl,
            projectId,
            issueId,
          });
          return;
        }

        await db.notification.createMany({
          data: mentionedUsers.map((u) => ({
            userId: u.id,
            type: "MENTIONED_IN_COMMENT" as const,
            actorId: resolvedUserId,
            actorName,
            projectId,
            issueId,
            mentionCommentId: comment.id,
          })),
          skipDuplicates: true,
        });

        const APP_URL = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/$/, "");
        for (const u of mentionedUsers) {
          void sendMentionEmail({
            to: u.email,
            actorName,
            contextType: "comment",
            contextTitle: commentBody.slice(0, 120),
            projectUrl: `${APP_URL}/en/projects/${projectId}/issues-log?openIssue=${issueId}`,
          }).catch((err) => console.warn("[mention-email]", err));
        }
      } catch (err) {
        console.warn("[mention-notify issue comment]", err);
      }
    })();

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("[issue comments POST]", err);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
