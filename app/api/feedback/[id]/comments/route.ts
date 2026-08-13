import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { extractMentionIds } from "@/lib/mention-utils";
import { promoteUploadCaptureContextsFromAttachments } from "@/lib/field-media/promote-upload-capture-context";
import { sendMentionEmail } from "@/lib/email";
import { userCanViewFeedbackReport } from "@/lib/feedback-access";
import { assertFeedbackCommentAttachmentKeys } from "@/lib/feedback-comment-attachments";
import { routing } from "@/i18n/routing";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import {
  capMentionIdsForBroadcast,
  logMentionEmailActorThrottled,
  tryRecordMentionEmailBatch,
} from "@/lib/email-outbound-rate-limit";
import { parseFeedbackEnvironmentFromRequest } from "@/lib/feedback-environment";
import { proxyProdFeedbackPath } from "@/lib/feedback-prod-proxy";

const CreateCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  attachmentKeys: z.array(z.string()).max(10).default([]),
  attachmentUrls: z.array(z.string()).max(10).default([]),
  attachmentMimeTypes: z.array(z.string()).max(10).default([]),
  attachmentFileSizeBytes: z.array(z.number().int().positive()).max(10).default([]),
  attachmentCaptions: z.array(z.string()).max(10).default([]),
});

type Params = { id: string };

async function loadReportForAccess(feedbackId: string) {
  return db.feedbackReport.findUnique({
    where: { id: feedbackId },
    select: { id: true, userId: true },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: feedbackId } = await params;
  const envParam = parseFeedbackEnvironmentFromRequest(req);

  const proxied = await proxyProdFeedbackPath(`/${feedbackId}/comments`, envParam, {
    method: "GET",
  });
  if (proxied) {
    const text = await proxied.text();
    return new NextResponse(text, {
      status: proxied.status,
      headers: { "Content-Type": proxied.headers.get("Content-Type") ?? "application/json" },
    });
  }

  const report = await loadReportForAccess(feedbackId);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await userCanViewFeedbackReport({
    viewerId: effective.user.id,
    role: effective.user.role,
    report,
    specialPermissions: effective.user.specialPermissions,
  });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comments = await db.feedbackComment.findMany({
    where: { feedbackReportId: feedbackId, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: feedbackId } = await params;
  const envParam = parseFeedbackEnvironmentFromRequest(req);

  const body = await req.json().catch(() => null);
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    body: commentBody,
    attachmentKeys,
    attachmentUrls,
    attachmentMimeTypes,
    attachmentFileSizeBytes,
    attachmentCaptions,
  } = parsed.data;

  const keyErr = assertFeedbackCommentAttachmentKeys(attachmentKeys);
  if (keyErr) {
    return NextResponse.json({ error: keyErr }, { status: 400 });
  }

  if (envParam === "production") {
    const label = (
      effective.user.name?.trim() ||
      effective.user.email?.trim() ||
      "Dev user"
    ).slice(0, 120);
    const proxied = await proxyProdFeedbackPath(`/${feedbackId}/comments`, envParam, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Feedback-Bridge-Body-Prefix": `[Via dev: ${label}]`.slice(0, 200),
      },
      body: JSON.stringify(parsed.data),
    });
    if (proxied) {
      const text = await proxied.text();
      return new NextResponse(text, {
        status: proxied.status,
        headers: { "Content-Type": proxied.headers.get("Content-Type") ?? "application/json" },
      });
    }
  }

  const report = await loadReportForAccess(feedbackId);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await userCanViewFeedbackReport({
    viewerId: effective.user.id,
    role: effective.user.role,
    report,
    specialPermissions: effective.user.specialPermissions,
  });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolvedUserId = await resolveSessionToDbUserId({
    id: effective.user.id,
    email: effective.user.email,
  });
  if (!resolvedUserId) {
    return NextResponse.json({ error: "No users found" }, { status: 500 });
  }
  const authorUser = await db.user.findUnique({
    where: { id: resolvedUserId },
    select: { id: true, name: true, email: true },
  });
  if (!authorUser) {
    return NextResponse.json({ error: "No users found" }, { status: 500 });
  }
  const actorName = authorUser.name ?? authorUser.email ?? "Someone";

  try {
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.feedbackComment.create({
        data: {
          feedbackReportId: feedbackId,
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

    // Include the author when they @mention themselves — they still get in-app + email notification.
    const mentionedIds = capMentionIdsForBroadcast(extractMentionIds(commentBody), {
      source: "feedback_comment",
      actorUserId: resolvedUserId,
      feedbackId,
    });
    if (mentionedIds.length > 0) {
      const mentionedUsers = await db.user.findMany({
        where: { id: { in: mentionedIds } },
        select: { id: true, name: true, email: true },
      });
      if (mentionedUsers.length > 0) {
        const mentionRl = tryRecordMentionEmailBatch(resolvedUserId, mentionedUsers.length);
        if (mentionRl.ok) {
          await db.$transaction(
            mentionedUsers.map((u) =>
              db.feedbackMention.upsert({
                where: {
                  feedbackReportId_mentionedUserId: {
                    feedbackReportId: feedbackId,
                    mentionedUserId: u.id,
                  },
                },
                create: {
                  feedbackReportId: feedbackId,
                  mentionedUserId: u.id,
                  sourceCommentId: comment.id,
                },
                update: { sourceCommentId: comment.id },
              })
            )
          );

          void (async () => {
            try {
              await db.notification.createMany({
                data: mentionedUsers.map((u) => ({
                  userId: u.id,
                  type: "MENTIONED_IN_COMMENT" as const,
                  actorId: resolvedUserId,
                  actorName,
                  feedbackId: feedbackId,
                  mentionCommentId: comment.id,
                })),
              });

              const APP_URL = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(
                /\/$/,
                ""
              );
              const openUrl = `${APP_URL}/${routing.defaultLocale}/feedback/${feedbackId}`;
              for (const u of mentionedUsers) {
                void sendMentionEmail({
                  to: u.email,
                  actorName,
                  contextType: "comment",
                  contextTitle: commentBody.slice(0, 120),
                  projectUrl: openUrl,
                }).catch((err) => console.warn("[mention-email feedback]", err));
              }
            } catch (err) {
              console.warn("[mention-notify feedback comment]", err);
            }
          })();
        } else {
          logMentionEmailActorThrottled("feedback_comment", {
            actorUserId: resolvedUserId,
            denied: mentionRl,
            feedbackId,
          });
        }
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    console.error("[feedback comments POST]", err);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
