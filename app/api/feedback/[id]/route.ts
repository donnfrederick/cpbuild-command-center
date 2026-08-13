import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { sendFeedbackAssignedEmail, sendFeedbackStatusEmail } from "@/lib/email";
import { isAllowedFeedbackAssigneeRole } from "@/lib/feedback-assignment";
import { z } from "zod";
import {
  canChangeFeedbackAssignee,
  hasFeedbackInboxAccess,
  userCanViewFeedbackReport,
  viewerContextForReport,
} from "@/lib/feedback-access";
import { parseFeedbackEnvironmentFromRequest } from "@/lib/feedback-environment";
import { proxyProdFeedbackPath } from "@/lib/feedback-prod-proxy";
import { isFeedbackProdMergeEnabled } from "@/lib/feedback-prod-client";

const updateFeedbackSchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_RESPONSE", "NEEDS_INVESTIGATION", "WONT_FIX", "RESOLVED", "DELETED"])
    .optional(),
  adminNote: z.string().max(2000).optional().nullable(),
  assigneeId: z.union([z.string().cuid(), z.null()]).optional(),
  /** Inbox only; `null` clears priority */
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
});

const assigneeInclude = {
  assignee: { select: { id: true, name: true, email: true } },
} as const;

/** GET /api/feedback/[id] — one report if viewer may access (inbox, submitter, or @mentioned) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const envParam = parseFeedbackEnvironmentFromRequest(req);

  try {
    const proxied = await proxyProdFeedbackPath(`/${id}`, envParam, { method: "GET" });
    if (proxied) {
      if (!proxied.ok) {
        const status = proxied.status === 404 ? 404 : 503;
        const body = await proxied.text();
        const contentType = proxied.headers.get("content-type") ?? "application/json";

        if (body) {
          return new NextResponse(body, {
            status,
            headers: { "content-type": contentType },
          });
        }

        return NextResponse.json(
          { error: status === 404 ? "Not found" : "Service unavailable" },
          { status },
        );
      }
      const data = (await proxied.json()) as Record<string, unknown>;
      return NextResponse.json({ ...data, environment: "production" });
    }
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const report = await db.feedbackReport.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      ...assigneeInclude,
      _count: {
        select: {
          comments: { where: { deletedAt: null } },
        },
      },
      duplicateOf: {
        select: {
          canonicalId: true,
          canonical: { select: { id: true, shortId: true, title: true } },
        },
      },
      canonicalDuplicates: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          duplicateId: true,
          duplicate: {
            select: {
              id: true,
              shortId: true,
              title: true,
              description: true,
              screenshot: true,
              screenshots: true,
              pageUrl: true,
              createdAt: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await userCanViewFeedbackReport({
    viewerId: effective.user.id,
    role: effective.user.role,
    report: { id: report.id, userId: report.userId },
    specialPermissions: effective.user.specialPermissions,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canViewAll = hasFeedbackInboxAccess(
    effective.user.role,
    effective.user.specialPermissions
  );
  const mergeEnabled = canViewAll && isFeedbackProdMergeEnabled();
  const { _count, ...rest } = report;
  return NextResponse.json({
    ...rest,
    commentsCount: _count.comments,
    viewerContext: viewerContextForReport(effective.user.id, canViewAll, report),
    ...(mergeEnabled ? { environment: "development" as const } : {}),
  });
}

/** PATCH /api/feedback/[id] — inbox: status, adminNote; inbox or submitter: assigneeId */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const envParam = parseFeedbackEnvironmentFromRequest(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (envParam === "production") {
    const proxied = await proxyProdFeedbackPath(`/${id}`, envParam, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (proxied) {
      const text = await proxied.text();
      return new NextResponse(text, {
        status: proxied.status,
        headers: { "Content-Type": proxied.headers.get("Content-Type") ?? "application/json" },
      });
    }
  }

  const parsed = updateFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const wantsTriage =
    parsed.data.status !== undefined || parsed.data.adminNote !== undefined;
  const wantsAssign = parsed.data.assigneeId !== undefined;
  const wantsPriority = parsed.data.priority !== undefined;

  if (!wantsTriage && !wantsAssign && !wantsPriority) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const existing = await db.feedbackReport.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const viewerId = effective.user.id;
  const role = effective.user.role;

  const canView = await userCanViewFeedbackReport({
    viewerId,
    role,
    report: { id: existing.id, userId: existing.userId },
    specialPermissions: effective.user.specialPermissions,
  });
  if (!canView) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inbox = hasFeedbackInboxAccess(role, effective.user.specialPermissions);

  if ((wantsTriage || wantsPriority) && !inbox) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    wantsAssign &&
    !canChangeFeedbackAssignee({
      viewerId,
      role,
      reportUserId: existing.userId,
      specialPermissions: effective.user.specialPermissions,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let nextAssigneeId: string | null | undefined = undefined;
  if (wantsAssign) {
    const raw = parsed.data.assigneeId;
    if (raw === null) {
      nextAssigneeId = null;
    } else {
      const candidate = await db.user.findUnique({
        where: { id: raw },
        select: {
          id: true,
          email: true,
          name: true,
          role: { select: { code: true } },
        },
      });
      if (!candidate) {
        return NextResponse.json({ error: "Assignee not found" }, { status: 400 });
      }
      if (!isAllowedFeedbackAssigneeRole(candidate.role.code)) {
        return NextResponse.json(
          { error: "That user cannot be assigned to feedback" },
          { status: 400 }
        );
      }
      nextAssigneeId = candidate.id;
    }
  }

  const updated = await db.feedbackReport.update({
    where: { id },
    data: {
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      ...(parsed.data.adminNote !== undefined && {
        adminNote: parsed.data.adminNote,
      }),
      ...(wantsPriority && { priority: parsed.data.priority }),
      ...(wantsAssign && { assigneeId: nextAssigneeId }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      ...assigneeInclude,
    },
  });

  const statusChanged =
    parsed.data.status !== undefined && parsed.data.status !== existing.status;

  if (
    statusChanged &&
    (parsed.data.status === "IN_PROGRESS" || parsed.data.status === "RESOLVED")
  ) {
    const notifType =
      parsed.data.status === "IN_PROGRESS"
        ? "FEEDBACK_IN_PROGRESS"
        : "FEEDBACK_RESOLVED";

    // Notify the primary reporter
    db.notification
      .create({
        data: { userId: existing.userId, feedbackId: id, type: notifType },
      })
      .catch((err: unknown) =>
        console.error("[feedback] Failed to create notification:", err)
      );

    const noteForEmail = parsed.data.adminNote ?? existing.adminNote;
    sendFeedbackStatusEmail({
      to: existing.user.email,
      userName: existing.user.name,
      feedbackTitle: existing.title,
      feedbackType: existing.type,
      newStatus: parsed.data.status as "IN_PROGRESS" | "RESOLVED",
      adminNote: noteForEmail ?? null,
      feedbackId: id,
    }).catch((err: unknown) =>
      console.error("[feedback] Failed to send status email:", err)
    );

    // Fan-out: notify reporters of all duplicate reports linked to this canonical
    if (parsed.data.status === "RESOLVED") {
      void (async () => {
        try {
          const dupes = await db.feedbackDuplicate.findMany({
            where: { canonicalId: id },
            include: {
              duplicate: {
                select: { id: true, userId: true, title: true, type: true, user: { select: { email: true, name: true } } },
              },
            },
          });
          await Promise.all(
            dupes.map(async (link) => {
              const dup = link.duplicate;
              if (dup.userId === existing.userId) return; // skip if same person
              await db.notification
                .create({
                  data: {
                    userId: dup.userId,
                    feedbackId: dup.id,
                    type: "FEEDBACK_DUPLICATE_RESOLVED",
                  },
                })
                .catch((err: unknown) =>
                  console.error("[feedback] Failed to create duplicate notification:", err)
                );
              sendFeedbackStatusEmail({
                to: dup.user.email,
                userName: dup.user.name,
                feedbackTitle: dup.title,
                feedbackType: dup.type,
                newStatus: "RESOLVED",
                adminNote: noteForEmail ?? null,
                feedbackId: dup.id,
              }).catch((err: unknown) =>
                console.error("[feedback] Failed to send duplicate status email:", err)
              );
            })
          );
        } catch (err: unknown) {
          console.error("[feedback] Failed to fan-out duplicate notifications:", err);
        }
      })();
    }
  }

  if (wantsAssign) {
    const prevId = existing.assigneeId;
    const newId = nextAssigneeId ?? null;
    const assigneeChanged = newId !== prevId;
    const shouldNotify =
      assigneeChanged &&
      newId !== null &&
      newId !== viewerId;

    if (shouldNotify) {
      const assigneeRow = await db.user.findUnique({
        where: { id: newId },
        select: { email: true, name: true },
      });
      if (assigneeRow?.email) {
        db.notification
          .create({
            data: {
              userId: newId,
              feedbackId: id,
              type: "FEEDBACK_ASSIGNED",
              actorId: viewerId,
              actorName: effective.user.name ?? effective.user.email ?? null,
            },
          })
          .catch((err: unknown) =>
            console.error("[feedback] Failed to create assignment notification:", err)
          );

        sendFeedbackAssignedEmail({
          to: assigneeRow.email,
          assigneeName: assigneeRow.name,
          assignerName: effective.user.name ?? effective.user.email ?? "Someone",
          feedbackTitle: updated.title,
          feedbackType: updated.type,
          feedbackId: id,
        }).catch((err: unknown) =>
          console.error("[feedback] Failed to send assignment email:", err)
        );
      }
    }
  }

  const mergeEnabled =
    hasFeedbackInboxAccess(effective.user.role, effective.user.specialPermissions) &&
    isFeedbackProdMergeEnabled();
  return NextResponse.json({
    ...updated,
    ...(mergeEnabled ? { environment: "development" as const } : {}),
  });
}

/** DELETE /api/feedback/[id] — inbox roles only */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasFeedbackInboxAccess(effective.user.role, effective.user.specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const envParam = parseFeedbackEnvironmentFromRequest(req);

  if (envParam === "production") {
    const proxied = await proxyProdFeedbackPath(`/${id}`, envParam, { method: "DELETE" });
    if (proxied) {
      return new NextResponse(null, { status: proxied.status });
    }
  }

  const existing = await db.feedbackReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.feedbackReport.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
