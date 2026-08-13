import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { logApi, apiTimer } from "@/lib/api-logger";
import { isAIEnabled, generateFeedbackAssistCalibrate } from "@/lib/ai/gemini";
import { assistCalibrateRequestSchema } from "@/lib/feedback-assist-schema";
import { checkFeedbackAssistRateLimit } from "@/lib/feedback-assist-rate-limit";

/**
 * POST /api/feedback/assist/calibrate
 *
 * Revises an AI-produced feedback report from natural-language user instructions.
 * Body matches `assistCalibrateRequestSchema` (`instruction` or `calibrationInstructions`).
 */

export async function POST(req: NextRequest) {
  const elapsed = apiTimer();

  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    logApi(
      "POST",
      "/api/feedback/assist/calibrate",
      401,
      "Unauthorized",
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIEnabled()) {
    logApi(
      "POST",
      "/api/feedback/assist/calibrate",
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

  const parsed = assistCalibrateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.currentReport.kind !== parsed.data.feedbackType) {
    return NextResponse.json(
      {
        error: "Invalid input",
        details: { feedbackType: ["Must match currentReport.kind"] },
      },
      { status: 400 },
    );
  }

  if (!checkFeedbackAssistRateLimit(effective.user.id)) {
    logApi(
      "POST",
      "/api/feedback/assist/calibrate",
      429,
      "Rate limited",
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const calibrationText =
    parsed.data.instruction?.trim() ||
    parsed.data.calibrationInstructions?.trim() ||
    "";

  const initial = parsed.data.initial;
  const initialTitle = initial?.title ?? "";
  const initialDescription = initial?.description ?? "";

  try {
    const report = await generateFeedbackAssistCalibrate({
      feedbackType: parsed.data.feedbackType,
      initialTitle,
      initialDescription,
      pageUrl: parsed.data.pageUrl,
      transcript: parsed.data.transcript,
      currentReport: parsed.data.currentReport,
      calibrationInstructions: calibrationText,
      videoRef: parsed.data.videoRef ?? null,
      imageRef: parsed.data.imageRef ?? null,
    });

    logApi("POST", "/api/feedback/assist/calibrate", 200, "OK", elapsed(), null);
    return NextResponse.json({ kind: "final_report" as const, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[feedback/assist/calibrate] Gemini call failed:", message);
    logApi(
      "POST",
      "/api/feedback/assist/calibrate",
      500,
      message.slice(0, 200),
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "AI_UPSTREAM_FAILED" }, { status: 500 });
  }
}
