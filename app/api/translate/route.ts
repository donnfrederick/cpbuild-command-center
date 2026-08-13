import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";

const CONTENT_TYPES = [
  "issue_description",
  "obs_description",
  "issue_comment",
  "obs_comment",
] as const;

type ContentType = (typeof CONTENT_TYPES)[number];

const TranslateSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  contentId: z.string().min(1),
  sourceLang: z.string().min(2).max(10), // BCP 47, e.g. "es", "en"
  targetLang: z.string().min(2).max(10),
});

async function fetchSourceText(contentType: ContentType, contentId: string): Promise<string | null> {
  switch (contentType) {
    case "issue_description": {
      const issue = await db.projectIssue.findUnique({
        where: { id: contentId },
        select: { shortDescription: true },
      });
      return issue?.shortDescription ?? null;
    }
    case "obs_description": {
      const obs = await db.projectObservation.findUnique({
        where: { id: contentId },
        select: { description: true },
      });
      return obs?.description ?? null;
    }
    case "issue_comment": {
      const comment = await db.issueComment.findUnique({
        where: { id: contentId },
        select: { body: true },
      });
      return comment?.body ?? null;
    }
    case "obs_comment": {
      const comment = await db.observationComment.findUnique({
        where: { id: contentId },
        select: { body: true },
      });
      return comment?.body ?? null;
    }
  }
}

// On-demand Gemini text translation with ContentTranslation caching.
// Client sends { contentType, contentId, sourceLang, targetLang }.
// Returns cached result immediately if available; otherwise calls Gemini and caches.
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      { error: "Translation service is not configured (GEMINI_API_KEY missing)" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = TranslateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { contentType, contentId, sourceLang, targetLang } = parsed.data;

  // Cache lookup
  const cached = await db.contentTranslation.findUnique({
    where: { contentType_contentId_targetLang: { contentType, contentId, targetLang } },
  });
  if (cached) {
    return NextResponse.json({ translated: cached.translated, cached: true });
  }

  // Fetch source text
  const sourceText = await fetchSourceText(contentType, contentId);
  if (!sourceText) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Skip translation if source and target are the same language
  if (sourceLang === targetLang) {
    return NextResponse.json({ translated: sourceText, cached: false });
  }

  try {
    const prompt =
      `Translate the following text from ${sourceLang} to ${targetLang}. ` +
      `Return only the translated text, no additional commentary or explanation.\n\n${sourceText}`;

    const generateRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "text/plain" },
        }),
      },
    );

    if (!generateRes.ok) {
      const err = await generateRes.text();
      throw new Error(`Gemini translation failed: ${err}`);
    }

    const data = (await generateRes.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!translated) throw new Error("Gemini returned empty translation");

    // Cache it
    await db.contentTranslation.create({
      data: { contentType, contentId, sourceLang, targetLang, translated },
    });

    return NextResponse.json({ translated, cached: false });
  } catch (err) {
    console.error("[translate] Gemini translation failed:", err);
    return NextResponse.json({ error: "Translation failed. Please try again." }, { status: 502 });
  }
}
