import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendFeedbackAssignedEmail, sendFeedbackStatusEmail } from "@/lib/email";
import { isAllowedFeedbackAssigneeRole } from "@/lib/feedback-assignment";
import { z } from "zod";
import { verifyFeedbackBridgeBearer } from "@/lib/feedback-bridge-auth";

const updateFeedbackSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  adminNote: z.string().max(2000).optional().nullable(),
  assigneeId: z.union([z.string().cuid(), z.null()]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
});

const assigneeInclude = {
  assignee: { select: { id: true, name: true, email: true } },
} as const;

function bridgeActorUserId(): string | undefined {
  return process.env.FEEDBACK_BRIDGE_ACTOR_USER_ID?.trim() || undefined;
}

/** GET /api/internal/feedback/[id] */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyFeedbackBridgeBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { _count, ...rest } = report;
  return NextResponse.json({
    ...rest,
    commentsCount: _count.comments,
  });
}

/** PATCH /api/internal/feedback/[id] — bridge actor used for assignment notifications */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyFeedbackBridgeBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorId = bridgeActorUserId();
  if (!actorId) {
    return NextResponse.json(
      { error: "Server misconfigured: FEEDBACK_BRIDGE_ACTOR_USER_ID" },
      { status: 500 }
    );
  }

  const bridgeActor = await db.user.findUnique({
    where: { id: actorId },
    select: { id: true, name: true, email: true },
  });
  if (!bridgeActor) {
    return NextResponse.json(
      { error: "Server misconfigured: FEEDBACK_BRIDGE_ACTOR_USER_ID user not found" },
      { status: 500 }
    );
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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

    db.notification
      .create({
        data: {
          userId: existing.userId,
          feedbackId: id,
          type: notifType,
        },
      })
      .catch((err: unknown) =>
        console.error("[feedback bridge] Failed to create notification:", err)
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
      console.error("[feedback bridge] Failed to send status email:", err)
    );
  }

  if (wantsAssign) {
    const prevId = existing.assigneeId;
    const newId = nextAssigneeId ?? null;
    const assigneeChanged = newId !== prevId;
    const shouldNotify =
      assigneeChanged && newId !== null && newId !== bridgeActor.id;

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
              actorId: bridgeActor.id,
              actorName: bridgeActor.name ?? bridgeActor.email ?? "Field Tracker",
            },
          })
          .catch((err: unknown) =>
            console.error("[feedback bridge] Failed to create assignment notification:", err)
          );

        sendFeedbackAssignedEmail({
          to: assigneeRow.email,
          assigneeName: assigneeRow.name,
          assignerName: bridgeActor.name ?? bridgeActor.email ?? "Field Tracker",
          feedbackTitle: updated.title,
          feedbackType: updated.type,
          feedbackId: id,
        }).catch((err: unknown) =>
          console.error("[feedback bridge] Failed to send assignment email:", err)
        );
      }
    }
  }

  return NextResponse.json(updated);
}

/** DELETE /api/internal/feedback/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyFeedbackBridgeBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.feedbackReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.feedbackReport.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
