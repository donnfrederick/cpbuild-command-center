import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { generateReleaseTour, isAIEnabled } from "@/lib/ai/gemini";

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Returns true if the request is authenticated via either:
 *   (a) Authorization: Bearer <AUTOMATION_SECRET>  — GitHub Actions CI pipeline
 *   (b) A valid admin session                       — DevTools browser calls
 */
async function isAuthorized(req: NextRequest): Promise<{ ok: boolean; isBearerAuth: boolean }> {
  const secret = process.env.AUTOMATION_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (secret && token === secret) {
    return { ok: true, isBearerAuth: true };
  }

  // Fall back to session auth — allows DevTools admin to use this endpoint
  const session = await auth();
  if (
    session?.user?.id &&
    hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)
  ) {
    return { ok: true, isBearerAuth: false };
  }

  return { ok: false, isBearerAuth: false };
}

// ── Validation ────────────────────────────────────────────────────────────────

const changeSchema = z.object({
  id: z.string().default(""),
  description: z.string().default(""),
  route: z.string().optional(),
  category: z.string().optional(),
});

const bodySchema = z.object({
  /** If provided, the endpoint uses this existing release instead of creating one. */
  releaseId: z.string().optional(),
  prNumber: z.number().int().nullable().default(null),
  title: z.string().min(1),
  branch: z.string().nullable().default(null),
  environment: z
    .enum(["development", "staging", "production", "all"])
    .default("development"),
  mergedAt: z.string().datetime().optional(),
  changes: z.array(changeSchema).default([]),
});

/**
 * POST /api/automation/release-tour
 *
 * Called by the GitHub Actions deploy workflow after each successful Railway
 * deploy. Creates a Release record (if one doesn't already exist for this PR)
 * and uses Gemini to generate a guided ReleaseTour automatically.
 *
 * Authentication: Authorization: Bearer <AUTOMATION_SECRET>
 * Idempotent: returns 200 { status: "skipped" } if a tour already exists.
 *
 * Returns:
 *   201 { release, tour }   — created successfully
 *   200 { status: "skipped", releaseId }  — tour already existed
 *   400                     — invalid request body
 *   401                     — missing or wrong AUTOMATION_SECRET
 *   503                     — GEMINI_API_KEY not configured
 */
export async function POST(req: NextRequest) {
  const authResult = await isAuthorized(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /** CI deploy no longer calls this route; bearer-only access is disabled. Admin session may still generate tours from DevTools. */
  if (authResult.isBearerAuth) {
    return NextResponse.json(
      { error: "Automatic release tour generation via CI is disabled." },
      { status: 410 }
    );
  }

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured — cannot generate tour" },
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

  const { releaseId, prNumber, title, branch, environment, mergedAt, changes } = parsed.data;

  // ── 1. Resolve or create the Release record ───────────────────────────────

  let release = releaseId
    ? await db.release.findUnique({ where: { id: releaseId } })
    : prNumber
      ? await db.release.findFirst({ where: { prNumber } })
      : null;

  if (!release) {
    release = await db.release.create({
      data: {
        title,
        prNumber,
        branch,
        environment,
        mergedAt: mergedAt ? new Date(mergedAt) : new Date(),
        changes: changes as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // ── 2. Skip if a tour already exists ─────────────────────────────────────

  const existingTour = await db.releaseTour.findUnique({
    where: { releaseId: release.id },
    select: { id: true },
  });

  if (existingTour) {
    return NextResponse.json(
      { status: "skipped", releaseId: release.id },
      { status: 200 }
    );
  }

  // ── 3. Generate tour steps with Gemini ────────────────────────────────────

  let steps;
  try {
    steps = await generateReleaseTour({ title, branch, environment, changes });
  } catch (err) {
    console.error("[POST /api/automation/release-tour] Gemini error:", err);
    return NextResponse.json(
      { error: "Tour generation failed", detail: String(err) },
      { status: 502 }
    );
  }

  if (!steps.length) {
    return NextResponse.json(
      { error: "Gemini returned zero steps" },
      { status: 502 }
    );
  }

  // ── 4. Persist tour + steps (array-form $transaction — PgBouncer-safe) ────

  const tour = await db.$transaction([
    db.releaseTour.create({
      data: {
        releaseId: release.id,
        steps: {
          create: steps.map((s) => ({
            order: s.order,
            pageUrl: s.pageUrl,
            elementSelector: s.elementSelector ?? "",
            title: s.title,
            description: s.description,
            voiceText: s.voiceText ?? "",
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
  ]);

  return NextResponse.json({ release, tour: tour[0] }, { status: 201 });
}
