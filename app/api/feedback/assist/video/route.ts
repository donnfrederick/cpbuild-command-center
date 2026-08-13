import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  isAIEnabled,
  generateFeedbackAssistVideoTurn,
} from "@/lib/ai/gemini";
import { uploadVideoForFeedback } from "@/lib/ai/gemini-files";
import {
  FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
  FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST,
} from "@/lib/ai/types";
import { assistVideoRequestMetadataSchema } from "@/lib/feedback-assist-schema";
import { checkFeedbackAssistVideoRateLimit } from "@/lib/feedback-assist-rate-limit";

// Next.js App Router — opt this handler into the Node runtime. The Gemini
// Files API SDK uses Node networking primitives; the Edge runtime rejects
// large multipart uploads anyway.
export const runtime = "nodejs";

/**
 * POST /api/feedback/assist/video
 *
 * Seeds the AI-assisted feedback chat with a screen recording. Accepts a
 * multipart body containing the blob plus a small JSON `metadata` field,
 * uploads the file to the Gemini Files API, runs the video-seeded turn, and
 * returns the same shape as `/api/feedback/assist` plus a `videoRef` the
 * client forwards on subsequent text turns.
 */
export async function POST(req: NextRequest) {
  const elapsed = apiTimer();

  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    logApi("POST", "/api/feedback/assist/video", 401, "Unauthorized", elapsed(), null);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIEnabled()) {
    logApi(
      "POST",
      "/api/feedback/assist/video",
      503,
      "AI disabled — GEMINI_API_KEY not set",
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "AI_DISABLED" }, { status: 503 });
  }

  // Parse the multipart body. A malformed body (e.g. no content-type, wrong
  // encoding) throws synchronously — wrap to keep the 400 path clean.
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid form";
    logApi("POST", "/api/feedback/assist/video", 400, msg.slice(0, 120), elapsed(), null);
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const recordingField = form.get("recording");
  if (!(recordingField instanceof Blob)) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { recording: ["required file field"] } },
      { status: 400 },
    );
  }

  if (recordingField.size <= 0) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { recording: ["empty blob"] } },
      { status: 400 },
    );
  }
  if (recordingField.size > FEEDBACK_ASSIST_VIDEO_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "VIDEO_TOO_LARGE",
        details: {
          maxBytes: FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
          actualBytes: recordingField.size,
        },
      },
      { status: 400 },
    );
  }
  // Browsers commonly produce MIME types with codec parameters
  // (e.g. `video/webm;codecs=vp9,opus`). Compare the base type only so we
  // don't 400 valid recordings from Chrome/Firefox's MediaRecorder.
  const baseMime = (recordingField.type.split(";")[0] ?? "").trim().toLowerCase();
  if (!(FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST as readonly string[]).includes(baseMime)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_VIDEO_TYPE",
        details: {
          allowed: FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST,
          actual: recordingField.type || null,
        },
      },
      { status: 400 },
    );
  }

  const metadataRaw = form.get("metadata");
  if (typeof metadataRaw !== "string") {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { metadata: ["required JSON field"] } },
      { status: 400 },
    );
  }

  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(metadataRaw);
  } catch {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { metadata: ["not valid JSON"] } },
      { status: 400 },
    );
  }

  const parsedMeta = assistVideoRequestMetadataSchema.safeParse(metadataJson);
  if (!parsedMeta.success) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: parsedMeta.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Cost cap is hourly per user — hit after the blob has been fully parsed
  // so a rate-limited user can't sidestep the validation error they should
  // have seen first (e.g. accidentally sending a huge blob repeatedly).
  if (!checkFeedbackAssistVideoRateLimit(effective.user.id)) {
    logApi("POST", "/api/feedback/assist/video", 429, "Rate limited", elapsed(), null);
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Upload to Gemini Files API, then run the first video-seeded turn.
  try {
    const fileRef = await uploadVideoForFeedback(recordingField);
    const result = await generateFeedbackAssistVideoTurn({
      feedbackType: parsedMeta.data.feedbackType,
      initialTitle: parsedMeta.data.initialTitle,
      initialUserText: parsedMeta.data.initialUserText,
      pageUrl: parsedMeta.data.pageUrl,
      videoRef: {
        fileUri: fileRef.fileUri,
        mimeType: fileRef.mimeType,
        expiresAt: fileRef.expiresAt,
        durationSec: parsedMeta.data.durationSec,
      },
    });

    logApi(
      "POST",
      "/api/feedback/assist/video",
      200,
      result.kind === "question" ? "Video → question" : "Video → final report",
      elapsed(),
      null,
    );
    return NextResponse.json(result);
  } catch (err) {
    // Log the full error shape server-side so we can diagnose Gemini 4xx
    // responses that bury the real reason in non-enumerable properties. The
    // client response stays a terse 500 — matching the text-based
    // `/api/feedback/assist` route so the UI can branch on a single code.
    const message = err instanceof Error ? err.message : "unknown";
    // Grab any custom properties the SDK attaches to its error
    // (GoogleGenerativeAIFetchError: { status, statusText, errorDetails }).
    const errAny = err as Record<string, unknown>;
    console.error("[feedback/assist/video] upstream failure:", {
      message,
      status: errAny?.status,
      statusText: errAny?.statusText,
      errorDetails: errAny?.errorDetails,
      cause: errAny?.cause,
      name: errAny?.name,
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
    });
    logApi("POST", "/api/feedback/assist/video", 500, message.slice(0, 300), elapsed(), null);
    return NextResponse.json({ error: "AI_UPSTREAM_FAILED" }, { status: 500 });
  }
}
