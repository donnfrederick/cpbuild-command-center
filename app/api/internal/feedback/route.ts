import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyFeedbackBridgeBearer } from "@/lib/feedback-bridge-auth";

/**
 * GET /api/internal/feedback — machine auth; full inbox-equivalent list (all reports).
 * Used by the dev app to merge production feedback into the dev inbox.
 */
export async function GET(req: NextRequest) {
  if (!verifyFeedbackBridgeBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await db.feedbackReport.findMany({
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
    },
  });

  const payload = reports.map((r) => {
    const { _count, ...rest } = r;
    return {
      ...rest,
      commentsCount: _count.comments,
    };
  });

  return NextResponse.json(payload);
}
