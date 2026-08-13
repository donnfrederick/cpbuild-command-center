import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { logApi, apiTimer } from "@/lib/api-logger";
import { isAIEnabled } from "@/lib/ai/gemini";
import { uploadImageForFeedback } from "@/lib/ai/gemini-files";
import {
  FEEDBACK_ASSIST_IMAGE_MAX_BYTES,
  FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST,
} from "@/lib/ai/types";
import { assistImageRequestMetadataSchema } from "@/lib/feedback-assist-schema";
import { checkFeedbackAssistRateLimit } from "@/lib/feedback-assist-rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/feedback/assist/image
 *
 * Uploads a screenshot to the Gemini Files API and returns an `imageRef` the
 * client forwards on `/api/feedback/assist` turns for vision grounding.
 */
export async function POST(req: NextRequest) {
  const elapsed = apiTimer();

  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    logApi("POST", "/api/feedback/assist/image", 401, "Unauthorized", elapsed(), null);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIEnabled()) {
    logApi(
      "POST",
      "/api/feedback/assist/image",
      503,
      "AI disabled — GEMINI_API_KEY not set",
      elapsed(),
      null,
    );
    return NextResponse.json({ error: "AI_DISABLED" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid form";
    logApi("POST", "/api/feedback/assist/image", 400, msg.slice(0, 120), elapsed(), null);
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const imageField = form.get("image");
  if (!(imageField instanceof Blob)) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { image: ["required file field"] } },
      { status: 400 },
    );
  }

  if (imageField.size <= 0) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: { image: ["empty blob"] } },
      { status: 400 },
    );
  }

  if (imageField.size > FEEDBACK_ASSIST_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "IMAGE_TOO_LARGE",
        details: {
          maxBytes: FEEDBACK_ASSIST_IMAGE_MAX_BYTES,
          actualBytes: imageField.size,
        },
      },
      { status: 400 },
    );
  }

  const baseMime = (imageField.type.split(";")[0] ?? "").trim().toLowerCase();
  if (!(FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST as readonly string[]).includes(baseMime)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_IMAGE_TYPE",
        details: {
          allowed: FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST,
          actual: imageField.type || null,
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

  const parsedMeta = assistImageRequestMetadataSchema.safeParse(metadataJson);
  if (!parsedMeta.success) {
    return NextResponse.json(
      { error: "INVALID_FORM", details: parsedMeta.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (!checkFeedbackAssistRateLimit(effective.user.id)) {
    logApi("POST", "/api/feedback/assist/image", 429, "Rate limited", elapsed(), null);
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const fileRef = await uploadImageForFeedback(imageField);
    const imageRef = {
      fileUri: fileRef.fileUri,
      mimeType: fileRef.mimeType,
      expiresAt: fileRef.expiresAt,
    };

    logApi(
      "POST",
      "/api/feedback/assist/image",
      200,
      `uploaded ${parsedMeta.data.sessionId}`,
      elapsed(),
      null,
    );

    return NextResponse.json({ imageRef });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[feedback/assist/image] upload failed:", message);
    logApi("POST", "/api/feedback/assist/image", 500, message.slice(0, 200), elapsed(), null);
    return NextResponse.json({ error: "AI_UPSTREAM_FAILED" }, { status: 500 });
  }
}
