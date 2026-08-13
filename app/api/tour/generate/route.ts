import { NextRequest, NextResponse } from "next/server";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { isAIEnabled, generateTourFromDescription } from "@/lib/ai/gemini";
import { z } from "zod";

/**
 * POST /api/tour/generate
 *
 * Generates a complete tour draft (steps + actions + voiceText) from a
 * plain-language description using Gemini + the app manifest.
 *
 * Auth: admin only (same guard as DevTools routes).
 *
 * Input:  { tourName, tourGoal, targetRole, targetSection? }
 * Output: { steps: GeneratedSimulationStep[] }
 */

const inputSchema = z.object({
  tourName:      z.string().min(1).max(120),
  tourGoal:      z.string().min(1).max(500),
  targetRole:    z.string().min(1).max(50),
  targetSection: z.string().max(120).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const adminCheck = await requireDevToolsAdmin();
  if (adminCheck) return adminCheck;

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "AI not configured. Set GEMINI_API_KEY." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const steps = await generateTourFromDescription(parsed.data);
    return NextResponse.json({ steps });
  } catch (err) {
    console.error("[tour/generate] Gemini error:", err);
    return NextResponse.json(
      { error: "Tour generation failed" },
      { status: 500 }
    );
  }
}
