import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { sendFeedbackNotificationEmail } from "@/lib/email";
import { z } from "zod";
import {
  feedbackListWhereClause,
  getMentionedFeedbackReportIds,
  hasFeedbackInboxAccess,
  viewerContextForReport,
} from "@/lib/feedback-access";
import type { FeedbackListApiResponse, FeedbackListProdFeedStatus } from "@/lib/feedback-environment";
import { isFeedbackProdMergeEnabled, fetchProdInternalFeedback } from "@/lib/feedback-prod-client";
import {
  tryRecordEmailOutbound,
  feedbackNotifyActorScopeKey,
  FEEDBACK_NOTIFY_ACTOR_WINDOW_MS,
  FEEDBACK_NOTIFY_ACTOR_MAX,
  logEmailSecurityEvent,
  hashForEmailSecurityLog,
} from "@/lib/email-outbound-rate-limit";
import { feedbackAssistMetadataSchema } from "@/lib/feedback-assist-schema";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { isFeedbackScreenshotStorageUrl } from "@/lib/feedback-screenshot-url";

const feedbackScreenshotUrlSchema = z
  .string()
  .url()
  .refine(isFeedbackScreenshotStorageUrl, {
    message: "Each screenshot must be a signed URL from feedback screenshot storage",
  });

const createFeedbackSchema = z
  .object({
    type: z.enum(["BUG", "FEATURE_REQUEST"]),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(4000),
    /** Legacy single screenshot — kept for backward compat. New submissions use screenshots[]. */
    screenshot: z.string().optional().nullable(),
    /** Supabase Storage URLs for screenshots (up to 10). Replaces the legacy base64 screenshot field. */
    screenshots: z.array(feedbackScreenshotUrlSchema).max(10).optional().default([]),
    videoUrl: z.string().url().optional().nullable(),
    pageUrl: z.string().url().optional().nullable(),
    /** Set to true when the submitter used the Gemini-assisted flow. */
    aiAssisted: z.boolean().optional().default(false),
    /**
     * Full AI conversation metadata captured during the assist flow. Validated
     * against the canonical shape — any divergence is rejected with 400 rather
     * than silently stored. Non-AI submissions must leave this field unset.
     */
    aiAssistMetadata: feedbackAssistMetadataSchema.optional().nullable(),
  })
  .refine(
    (data) => data.aiAssisted || !data.aiAssistMetadata,
    { message: "aiAssistMetadata may only be sent with aiAssisted=true", path: ["aiAssistMetadata"] },
  )
  .refine(
    // Enforce the reverse for auditability: every AI-assisted submission
    // must carry its conversation metadata. Without this guard a caller
    // could flag `aiAssisted=true` while sending no audit payload, leaving
    // rows in the DB marked AI-assisted with nothing to justify the label.
    (data) => !data.aiAssisted || !!data.aiAssistMetadata,
    { message: "aiAssistMetadata is required when aiAssisted=true", path: ["aiAssistMetadata"] },
  );

/** POST /api/feedback — any authenticated user can submit feedback */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `req.json()` throws on malformed bodies (non-JSON, truncated, wrong
  // Content-Type). Surface a clean 400 instead of letting Next.js bubble a
  // generic 500, matching the shape used by our other feedback endpoints.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createFeedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 400 },
    );
  }

  const {
    type,
    title,
    description,
    screenshot,
    screenshots,
    videoUrl,
    pageUrl,
    aiAssisted,
    aiAssistMetadata,
  } = parsed.data;

  const dbUserId = await resolveSessionToDbUserId({
    id: effective.user.id,
    email: effective.user.email,
  });
  if (!dbUserId) {
    return NextResponse.json({ error: "No users found" }, { status: 500 });
  }

  const report = await db.feedbackReport.create({
    data: {
      userId: dbUserId,
      type,
      title: title.trim(),
      description: description.trim(),
      screenshot: screenshot ?? null,
      screenshots: screenshots ?? [],
      videoUrl: videoUrl ?? null,
      pageUrl: pageUrl ?? null,
      aiAssisted,
      // Prisma distinguishes two "null" sentinels for nullable Json columns:
      //   • `Prisma.JsonNull` stores the JSON value `null` (the column holds
      //     a JSON document that is the literal null).
      //   • `Prisma.DbNull` stores SQL NULL — the column has no value at all.
      // `aiAssistMetadata` is `Json?` in the schema, so the absence of audit
      // payload must mean SQL NULL. Using `JsonNull` here would leave every
      // non-AI submission with a JSON `null` in the column, which indexes,
      // joins, and `IS NULL` filters treat differently from true SQL NULL.
      aiAssistMetadata: aiAssisted && aiAssistMetadata
        ? (aiAssistMetadata as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
    include: { user: { select: { name: true, email: true } } },
  });

  const notifyRl = tryRecordEmailOutbound(feedbackNotifyActorScopeKey(dbUserId), {
    windowMs: FEEDBACK_NOTIFY_ACTOR_WINDOW_MS,
    max: FEEDBACK_NOTIFY_ACTOR_MAX,
  });
  if (notifyRl.ok) {
    sendFeedbackNotificationEmail({
      submitterName: report.user.name,
      submitterEmail: report.user.email,
      type,
      title: report.title,
      description: report.description,
      pageUrl: report.pageUrl,
      feedbackId: report.id,
    }).catch((err) => {
      console.error("[feedback] Notification email failed (non-fatal):", err);
    });
  } else {
    logEmailSecurityEvent({
      event: "feedback_notify_actor_throttled",
      actorUserIdHash: hashForEmailSecurityLog(dbUserId),
    });
  }

  const { user: _user, ...reportPayload } = report;
  return NextResponse.json(reportPayload, { status: 201 });
}

/** GET /api/feedback — inbox roles list all; others see own submissions + @mentioned reports.
 *
 * Query params:
 *   deleted=true  — admin-only; returns only DELETED reports (for the Deleted inbox tab)
 */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = effective.user.id;
  const role = effective.user.role;
  const canViewAll = hasFeedbackInboxAccess(role, effective.user.specialPermissions);

  const showDeleted =
    new URL(req.url).searchParams.get("deleted") === "true" && canViewAll;

  const mentionedIds = canViewAll ? [] : await getMentionedFeedbackReportIds(userId);
  const baseWhere = feedbackListWhereClause(
    userId,
    role,
    mentionedIds,
    effective.user.specialPermissions
  );

  // Normal list: exclude DELETED items and reports that are linked as duplicates of another.
  // Deleted tab: show only DELETED items (admin-only).
  const where = showDeleted
    ? { ...(baseWhere ?? {}), status: "DELETED" as const }
    : {
        ...(baseWhere ?? {}),
        status: { not: "DELETED" as const },
        duplicateOf: { is: null },
      };

  const reports = await db.feedbackReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      assignee: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          comments: { where: { deletedAt: null } },
        },
      },
      canonicalDuplicates: {
        select: { id: true, duplicateId: true },
      },
    },
  });

  const mergeEnabled = canViewAll && isFeedbackProdMergeEnabled();

  const localPayload = reports.map((r) => {
    const { _count, canonicalDuplicates, ...rest } = r;
    const row = {
      ...rest,
      commentsCount: _count.comments,
      duplicatesCount: canonicalDuplicates?.length ?? 0,
      viewerContext: viewerContextForReport(userId, canViewAll, r),
    };
    return mergeEnabled ? { ...row, environment: "development" as const } : row;
  });

  let prodFeed: FeedbackListProdFeedStatus = "off";
  const merged: unknown[] = [...localPayload];

  if (mergeEnabled) {
    prodFeed = "error";
    try {
      const res = await fetchProdInternalFeedback("", { method: "GET" });
      if (res.ok) {
        const remote = (await res.json()) as Array<Record<string, unknown>>;
        for (const row of remote) {
          merged.push({
            ...row,
            environment: "production" as const,
            viewerContext: undefined,
          });
        }
        merged.sort(
          (a, b) =>
            new Date((b as { createdAt: string }).createdAt).getTime() -
            new Date((a as { createdAt: string }).createdAt).getTime()
        );
        prodFeed = "ok";
      }
    } catch {
      prodFeed = "error";
    }
  }

  const body: FeedbackListApiResponse = { reports: merged, prodFeed };
  return NextResponse.json(body);
}
