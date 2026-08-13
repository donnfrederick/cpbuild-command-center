import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { extractMentionIds } from "@/lib/mention-utils";
import { sendMentionEmail } from "@/lib/email";
import { userCanViewFeedbackReport } from "@/lib/feedback-access";
import { routing } from "@/i18n/routing";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import {
  capMentionIdsForBroadcast,
  logMentionEmailActorThrottled,
  tryRecordMentionEmailBatch,
} from "@/lib/email-outbound-rate-limit";

const EDIT_WINDOW_MS = 30 * 60 * 1000;

const PatchCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});

type Params = { id: string; cid: string };

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: feedbackId, cid } = await params;

  const report = await db.feedbackReport.findUnique({
    where: { id: feedbackId },
    select: { id: true, userId: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await userCanViewFeedbackReport({
    viewerId: effective.user.id,
    role: effective.user.role,
    report,
    specialPermissions: effective.user.specialPermissions,
  });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comment = await db.feedbackComment.findFirst({
    where: { id: cid, feedbackReportId: feedbackId, deletedAt: null },
  });
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const resolvedUserId = effective.user.id;
  if (comment.authorId !== resolvedUserId) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }

  const ageMs = Date.now() - comment.createdAt.getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    return NextResponse.json(
      { error: "Comments can only be edited within 30 minutes of posting" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const newBody = parsed.data.body;
  const actorDbId =
    (await resolveSessionToDbUserId({ id: effective.user.id, email: effective.user.email })) ?? resolvedUserId;
  const oldMentionIds = new Set(extractMentionIds(comment.body));
  const allMentionIds = capMentionIdsForBroadcast(extractMentionIds(newBody), {
    source: "feedback_comment_patch",
    actorUserId: actorDbId,
    feedbackId,
  });
  // Notify only users newly @mentioned in this edit (includes self-mention).
  const notifyUserIds = allMentionIds.filter((uid) => !oldMentionIds.has(uid));

  const authorUser = await db.user.findUnique({
    where: { id: resolvedUserId },
    select: { id: true, name: true, email: true },
  });
  const actorName = authorUser?.name ?? authorUser?.email ?? "Someone";

  const updated = await db.feedbackComment.update({
    where: { id: cid },
    data: { body: newBody, editedAt: new Date() },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
  });

  if (allMentionIds.length > 0) {
    try {
      await db.$transaction(
        allMentionIds.map((uid) =>
          db.feedbackMention.upsert({
            where: {
              feedbackReportId_mentionedUserId: {
                feedbackReportId: feedbackId,
                mentionedUserId: uid,
              },
            },
            create: {
              feedbackReportId: feedbackId,
              mentionedUserId: uid,
              sourceCommentId: cid,
            },
            update: { sourceCommentId: cid },
          })
        )
      );
    } catch (err) {
      console.warn("[feedback mention upsert on PATCH]", err);
    }
  }

  if (notifyUserIds.length > 0) {
    void (async () => {
      try {
        const mentionedUsers = await db.user.findMany({
          where: { id: { in: notifyUserIds } },
          select: { id: true, name: true, email: true },
        });
        if (mentionedUsers.length === 0) return;

        const mentionRl = tryRecordMentionEmailBatch(actorDbId, mentionedUsers.length);
        if (!mentionRl.ok) {
          logMentionEmailActorThrottled("feedback_comment_patch", {
            actorUserId: actorDbId,
            denied: mentionRl,
            feedbackId,
          });
          return;
        }

        await db.notification.createMany({
          data: mentionedUsers.map((u) => ({
            userId: u.id,
            type: "MENTIONED_IN_COMMENT" as const,
            actorId: resolvedUserId,
            actorName,
            feedbackId: feedbackId,
            mentionCommentId: cid,
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
            contextTitle: newBody.slice(0, 120),
            projectUrl: openUrl,
          }).catch((err) => console.warn("[mention-email feedback edit]", err));
        }
      } catch (err) {
        console.warn("[mention-notify feedback comment PATCH]", err);
      }
    })();
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: feedbackId, cid } = await params;

  const report = await db.feedbackReport.findUnique({
    where: { id: feedbackId },
    select: { id: true, userId: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await userCanViewFeedbackReport({
    viewerId: effective.user.id,
    role: effective.user.role,
    report,
    specialPermissions: effective.user.specialPermissions,
  });
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comment = await db.feedbackComment.findFirst({
    where: { id: cid, feedbackReportId: feedbackId },
  });
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  if (comment.authorId !== effective.user.id) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }
  if (comment.deletedAt) {
    return NextResponse.json({ error: "Already deleted" }, { status: 409 });
  }

  await db.feedbackComment.update({ where: { id: cid }, data: { deletedAt: new Date() } });
  return NextResponse.json({ deleted: true });
}
