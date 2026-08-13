import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { generateReleaseVerification, isAIEnabled } from "@/lib/ai/gemini";

// ── Auth ──────────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.AUTOMATION_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (secret && token === secret) return true;

  const session = await auth();
  return Boolean(
    session?.user?.id && hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

const changeSchema = z.object({
  id: z.string().default(""),
  description: z.string().default(""),
  route: z.string().optional(),
  category: z.string().optional(),
});

const bodySchema = z.object({
  releaseId: z.string().min(1),
  /** Optional free-text feedback for re-generating steps (replaces existing). */
  feedback: z.string().optional(),
});

/**
 * POST /api/automation/release-verification
 *
 * Generates (or regenerates) a Gemini-powered QA verification checklist for a
 * Release. The checklist is stored in Release.verificationSteps as a JSONB
 * column and rendered in the DevTools Release Checklist tab.
 *
 * Authentication: Authorization: Bearer <AUTOMATION_SECRET>  OR  admin session.
 *
 * Idempotent: returns the existing steps (200) if they are already populated,
 * UNLESS a "feedback" string is provided — in that case the steps are regenerated.
 *
 * Returns:
 *   201 { releaseId, steps }  — created / regenerated
 *   200 { releaseId, steps }  — already existed (no feedback → skipped)
 *   400                       — invalid request body
 *   401                       — not authorized
 *   404                       — release not found
 *   503                       — GEMINI_API_KEY not configured
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { releaseId, feedback } = parsed.data;

  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: { id: true, title: true, branch: true, environment: true, changes: true, verificationSteps: true },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  // If steps already exist and no feedback provided, return the existing steps
  const existingSteps = Array.isArray(release.verificationSteps)
    ? release.verificationSteps
    : [];

  if (existingSteps.length > 0 && !feedback) {
    return NextResponse.json({ releaseId, steps: existingSteps }, { status: 200 });
  }

  // Generate (or regenerate) steps with Gemini
  const rawChanges = Array.isArray(release.changes) ? release.changes : [];
  const changes = rawChanges
    .map((c) => changeSchema.safeParse(c))
    .filter((r) => r.success)
    .map((r) => (r as { success: true; data: z.infer<typeof changeSchema> }).data);

  let steps: Awaited<ReturnType<typeof generateReleaseVerification>>;
  try {
    steps = await generateReleaseVerification({
      title: release.title,
      branch: release.branch ?? null,
      environment: release.environment,
      changes,
      feedback,
    });
  } catch (err) {
    console.error("[POST /api/automation/release-verification] Gemini error:", err);
    return NextResponse.json(
      { error: "Verification generation failed", detail: String(err) },
      { status: 502 }
    );
  }

  if (!steps.length) {
    return NextResponse.json({ error: "Gemini returned zero steps" }, { status: 502 });
  }

  // Persist to Release.verificationSteps
  await db.release.update({
    where: { id: releaseId },
    data: { verificationSteps: steps as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ releaseId, steps }, { status: 201 });
}
