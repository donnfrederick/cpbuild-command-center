import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_MORNING_BRIEFING)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// ── Schema ────────────────────────────────────────────────────────────────────

const feedbackSchema = z.object({
  briefingId: z.string().min(1),
  section: z.enum(["ROI_ITEM", "OPTIMIZATION", "ISSUE", "SPRINT_ITEM", "SHIPPED_ITEM", "INSIGHT"]),
  itemKey: z.string().min(1),
  feedbackType: z.enum(["JUSTIFY", "CHALLENGE", "APPROVE"]),
  challengeReason: z
    .enum(["WRONG_CONTEXT", "INFLATED_NUMBER", "NOT_APPLICABLE", "OTHER"])
    .optional(),
  userNote: z.string().max(1000).optional(),
});

// ── POST /api/daily-briefing/feedback ────────────────────────────────────────
// Saves a feedback signal on a specific briefing card.

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { briefingId, section, itemKey, feedbackType, challengeReason, userNote } = parsed.data;

  const record = await db.briefingFeedback.create({
    data: {
      briefingId,
      section,
      itemKey,
      feedbackType,
      challengeReason: challengeReason ?? null,
      userNote: userNote ?? null,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ id: record.id }, { status: 201 });
}
