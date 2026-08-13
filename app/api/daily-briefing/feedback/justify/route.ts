import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { justifyBriefingCard, isAIEnabled } from "@/lib/ai/gemini";

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

const justifySchema = z.object({
  briefingId: z.string().min(1),
  section: z.enum(["ROI_ITEM", "OPTIMIZATION", "ISSUE", "SPRINT_ITEM", "SHIPPED_ITEM", "INSIGHT"]),
  itemKey: z.string().min(1),
  // The actual card data to justify — passed from the client so we don't need to re-parse the report
  itemData: z.record(z.string(), z.unknown()),
  briefingContext: z.object({
    dateFor: z.string(),
    narrative: z.string().optional(),
  }),
});

// ── POST /api/daily-briefing/feedback/justify ─────────────────────────────────
// Asks Gemini to justify (explain the reasoning behind) a specific card.
// Saves the justification back to the feedback record if feedbackId is provided.

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

  const parsed = justifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { briefingId, section, itemKey, itemData, briefingContext } = parsed.data;

  let justification: string;
  try {
    justification = await justifyBriefingCard({ section, itemData, briefingContext });
  } catch (err) {
    console.error("[feedback/justify] Gemini call failed:", err);
    return NextResponse.json(
      { error: "AI justification failed. Try again." },
      { status: 502 }
    );
  }

  // Save as a JUSTIFY feedback record with the AI response attached
  await db.briefingFeedback.create({
    data: {
      briefingId,
      section,
      itemKey,
      feedbackType: "JUSTIFY",
      aiJustification: justification,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ justification });
}
