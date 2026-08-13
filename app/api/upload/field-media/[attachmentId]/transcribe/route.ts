import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { readLocalFieldMediaFile } from "@/lib/field-media-local";
import { getEffectiveSession } from "@/lib/masquerade";

const TranscribeSchema = z.object({
  sourceLang: z.string().min(2).max(10), // BCP 47, e.g. "es", "en", "es-MX"
});

type Params = { params: Promise<{ attachmentId: string }> };

// User-triggered: called when user explicitly taps "Transcribe" on an audio/video attachment.
// Sets transcriptStatus → PENDING, calls Gemini, then updates to COMPLETE or FAILED.
export async function POST(req: NextRequest, { params }: Params) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;

  const attachment = await db.mediaAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const isAudioOrVideo =
    attachment.mimeType.startsWith("audio/") || attachment.mimeType.startsWith("video/");
  if (!isAudioOrVideo) {
    return NextResponse.json(
      { error: "Transcription is only available for audio and video attachments." },
      { status: 422 },
    );
  }

  if (attachment.transcriptStatus === "PROCESSING") {
    return NextResponse.json({ error: "Transcription is already in progress." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = TranscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "sourceLang is required", details: parsed.error.flatten() }, { status: 422 });
  }

  const { sourceLang } = parsed.data;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      { error: "Transcription service is not configured (GEMINI_API_KEY missing)" },
      { status: 503 },
    );
  }

  // Mark as PENDING immediately so callers can show a loading state
  await db.mediaAttachment.update({
    where: { id: attachmentId },
    data: { transcriptStatus: "PENDING", transcriptLanguage: sourceLang },
  });

  try {
    await db.mediaAttachment.update({
      where: { id: attachmentId },
      data: { transcriptStatus: "PROCESSING" },
    });

    // Use the Gemini Files API to upload from URL, then transcribe
    const prompt =
      sourceLang === "en"
        ? `Please transcribe the speech in this audio/video recording. The speaker is speaking in English. Return only the transcript text, no additional commentary.`
        : `Please transcribe the speech in this audio/video recording. The speaker is speaking in ${sourceLang}. ` +
          `Return a JSON object with two fields: "original" (the transcript in ${sourceLang}) and "english" (the English translation).`;

    // Local disk (empty service role uploads) or Supabase signed URL
    const localBuf = await readLocalFieldMediaFile(attachment.storageKey);
    let fileBuffer: ArrayBuffer;
    if (localBuf) {
      const sliced = localBuf.buffer.slice(
        localBuf.byteOffset,
        localBuf.byteOffset + localBuf.byteLength,
      );
      fileBuffer = sliced as ArrayBuffer;
    } else {
      const fileRes = await fetch(attachment.storageUrl);
      if (!fileRes.ok) {
        throw new Error(`Failed to fetch attachment from storage: ${fileRes.status}`);
      }
      fileBuffer = await fileRes.arrayBuffer();
    }

    // Upload file to Gemini Files API
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": attachment.mimeType,
          "X-Goog-Upload-Command": "start, upload, finalize",
          "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
          "X-Goog-Upload-Header-Content-Type": attachment.mimeType,
        },
        body: fileBuffer,
      },
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Gemini file upload failed: ${err}`);
    }

    const uploadData = (await uploadRes.json()) as { file: { uri: string; name: string } };
    const fileUri = uploadData.file.uri;

    // Transcribe with Gemini
    const generateRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { fileData: { mimeType: attachment.mimeType, fileUri } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: sourceLang === "en" ? "text/plain" : "application/json" },
        }),
      },
    );

    if (!generateRes.ok) {
      const err = await generateRes.text();
      throw new Error(`Gemini generation failed: ${err}`);
    }

    const generateData = (await generateRes.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const rawText = generateData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let transcriptOriginal: string;
    let transcriptEnglish: string;

    if (sourceLang === "en") {
      transcriptOriginal = rawText.trim();
      transcriptEnglish = rawText.trim();
    } else {
      let parsed: { original?: string; english?: string };
      try {
        parsed = JSON.parse(rawText) as { original?: string; english?: string };
      } catch {
        // Gemini sometimes wraps JSON in markdown code blocks
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        parsed = jsonMatch ? (JSON.parse(jsonMatch[1]) as { original?: string; english?: string }) : {};
      }
      transcriptOriginal = parsed.original ?? rawText.trim();
      transcriptEnglish = parsed.english ?? rawText.trim();
    }

    await db.mediaAttachment.update({
      where: { id: attachmentId },
      data: {
        transcriptStatus: "COMPLETE",
        transcriptOriginal,
        transcriptEnglish,
      },
    });

    return NextResponse.json({
      transcriptStatus: "COMPLETE",
      transcriptLanguage: sourceLang,
      transcriptOriginal,
      transcriptEnglish,
    });
  } catch (err) {
    console.error("[transcribe] Gemini transcription failed:", err);
    await db.mediaAttachment.update({
      where: { id: attachmentId },
      data: { transcriptStatus: "FAILED" },
    });
    return NextResponse.json({ error: "Transcription failed. Please try again." }, { status: 502 });
  }
}
