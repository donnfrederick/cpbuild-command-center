import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyFeedbackBridgeBearer } from "@/lib/feedback-bridge-auth";
import { isAllowedFeedbackAssigneeRole } from "@/lib/feedback-assignment";

/**
 * GET /api/internal/feedback/assignees — eligible feedback assignees (prod users).
 */
export async function GET(req: NextRequest) {
  if (!verifyFeedbackBridgeBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { code: true } },
    },
    orderBy: { email: "asc" },
  });

  const assignees = users.filter((u) => isAllowedFeedbackAssigneeRole(u.role.code));

  return NextResponse.json({
    assignees: assignees.map(({ role: _r, ...u }) => ({
      ...u,
      role: _r.code,
    })),
  });
}
