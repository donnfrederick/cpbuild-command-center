import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { logApi, apiTimer } from "@/lib/api-logger";
import { isAIEnabled, generateFeedbackAssistTurn } from "@/lib/ai/gemini";
import {
  assistTurnRequestSchema,
  ASSIST_MAX_TURNS,
} from "@/lib/feedback-assist-schema";
import { checkFeedbackAssistRateLimit } from "@/lib/feedback-assist-rate-limit";

// ── GET /api/feedback/assist ─────────────────────────────────────────────────
// Lets the client check whether the AI flow should be offered at all without
// paying for a Gemini round-trip. The UI toggles between "enabled" and a
// disabled state with an explanatory tooltip.

export async function GET() {
  const elapsed = apiTimer();
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    logApi("GET", "/api/feedback/assist", 401, "Unauthorized", elapsed(), null);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = isAIEnabled();
  logApi("GET", "/api/feedback/assist", 200, "OK", elapsed(), null);
  return NextResponse.json({
    enabled,
    maxTurns: ASSIST_MAX_TURNS,
  });
}

// ── POST /api/feedback/assist ────────────────────────────────────────────────
// One turn of the assist conversation. Returns either the next AI question
// (with predefined options) or the final structured report that the client
// can use to pre-fill the submission form.

export async function POST(req: NextRequest) {
  const elapsed = apiTimer();

  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    logApi("POST", "/api/feedback/assist", 401, "Unauthorized", elapsed(), null);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIEnabled()) {
    logApi(
      "POST",
      "/api/feedback/assist",
      503,
      "AI disabled — GEMINI_API_KEY not set",
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "AI_DISABLED" }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = assistTurnRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (!checkFeedbackAssistRateLimit(effective.user.id)) {
    logApi("POST", "/api/feedback/assist", 429, "Rate limited", elapsed(), null);
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await generateFeedbackAssistTurn({
      feedbackType: parsed.data.initial.feedbackType,
      initialTitle: parsed.data.initial.title,
      initialDescription: parsed.data.initial.description,
      pageUrl: parsed.data.initial.pageUrl,
      transcript: parsed.data.transcript,
      forceFinalize: parsed.data.finalize,
      videoRef: parsed.data.videoRef,
    });

    logApi(
      "POST",
      "/api/feedback/assist",
      200,
      result.kind === "question" ? "Question" : "Final report",
      elapsed(),
      null,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[feedback/assist] Gemini call failed:", message);
    logApi("POST", "/api/feedback/assist", 500, message.slice(0, 200), elapsed(), null);
    return NextResponse.json(
      { error: "AI_UPSTREAM_FAILED" },
      { status: 500 },
    );
  }
}
