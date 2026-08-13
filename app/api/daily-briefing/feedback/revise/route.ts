import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { reviseBriefingCard, isAIEnabled } from "@/lib/ai/gemini";

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

const reviseSchema = z.object({
  briefingId: z.string().min(1),
  section: z.enum(["ROI_ITEM", "OPTIMIZATION", "ISSUE", "SPRINT_ITEM", "SHIPPED_ITEM", "INSIGHT"]),
  itemKey: z.string().min(1),
  itemData: z.record(z.string(), z.unknown()),
  challengeReason: z.enum(["WRONG_CONTEXT", "INFLATED_NUMBER", "NOT_APPLICABLE", "OTHER"]),
  userNote: z.string().max(1000).optional(),
  briefingContext: z.object({
    dateFor: z.string(),
    narrative: z.string().optional(),
  }),
});

// ── POST /api/daily-briefing/feedback/revise ──────────────────────────────────
// Asks Gemini to revise a specific card based on a challenge.
// Saves both the challenge feedback and the AI revision to DB.
// The revised card is ephemeral in the UI session — it does NOT overwrite the stored briefing.

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;
  const { session } = guard;

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = reviseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { briefingId, section, itemKey, itemData, challengeReason, userNote, briefingContext } =
    parsed.data;

  let revisedItem: Record<string, unknown>;
  try {
    revisedItem = await reviseBriefingCard({
      section,
      itemData,
      challengeReason,
      userNote,
      briefingContext,
    });
  } catch (err) {
    console.error("[feedback/revise] Gemini call failed:", err);
    return NextResponse.json(
      { error: "AI revision failed. Try again." },
      { status: 502 }
    );
  }

  const revisionJson = JSON.parse(JSON.stringify(revisedItem)) as Parameters<
    typeof db.briefingFeedback.create
  >[0]["data"]["aiRevision"];

  await db.briefingFeedback.create({
    data: {
      briefingId,
      section,
      itemKey,
      feedbackType: "CHALLENGE",
      challengeReason,
      userNote: userNote ?? null,
      aiRevision: revisionJson,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ revisedItem });
}
