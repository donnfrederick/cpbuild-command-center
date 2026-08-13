import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";

/**
 * DELETE /api/releases/[id]/tour
 *
 * Admin only — remove the tour attached to a release.
 * The Release record itself is preserved for DevTools checklist history.
 * ReleaseTourStep rows cascade automatically via DB schema.
 * Safe to call even if no tour exists (deleteMany is a no-op in that case).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const release = await db.release.findUnique({ where: { id }, select: { id: true } });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  await db.releaseTour.deleteMany({ where: { releaseId: id } });

  return new NextResponse(null, { status: 204 });
}

const tourStepSchema = z.object({
  order: z.number().int().min(0),
  pageUrl: z.string().min(1),
  elementSelector: z.string().default(""),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  voiceText: z.string().max(1000).default(""),
});

const upsertTourSchema = z.object({
  steps: z.array(tourStepSchema).min(1).max(30),
});

/**
 * GET /api/releases/[id]/tour
 *
 * Returns the tour steps for a release. Available to any authenticated user.
 * Returns 404 if the release or tour does not exist.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const release = await db.release.findUnique({
    where: { id },
    include: {
      tour: { include: { steps: { orderBy: { order: "asc" } } } },
    },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (!release.tour) {
    return NextResponse.json({ error: "No tour attached to this release" }, { status: 404 });
  }

  return NextResponse.json(release.tour);
}

/**
 * PUT /api/releases/[id]/tour
 *
 * Admin only — create or fully replace the release tour.
 * Replaces all steps atomically using array-form $transaction (PgBouncer-safe).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = upsertTourSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const release = await db.release.findUnique({ where: { id }, select: { id: true } });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const existing = await db.releaseTour.findUnique({
    where: { releaseId: id },
    select: { id: true },
  });

  if (existing) {
    // Replace steps: delete all then recreate — PgBouncer-safe array-form transaction.
    const [, tour] = await db.$transaction([
      db.releaseTourStep.deleteMany({ where: { tourId: existing.id } }),
      db.releaseTour.update({
        where: { id: existing.id },
        data: {
          steps: {
            create: parsed.data.steps.map((s) => ({
              order: s.order,
              pageUrl: s.pageUrl,
              elementSelector: s.elementSelector,
              title: s.title,
              description: s.description,
              voiceText: s.voiceText,
            })),
          },
        },
        include: { steps: { orderBy: { order: "asc" } } },
      }),
    ]);
    return NextResponse.json(tour);
  }

  // Create new tour with steps
  const tour = await db.releaseTour.create({
    data: {
      releaseId: id,
      steps: {
        create: parsed.data.steps.map((s) => ({
          order: s.order,
          pageUrl: s.pageUrl,
          elementSelector: s.elementSelector,
          title: s.title,
          description: s.description,
          voiceText: s.voiceText,
        })),
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(tour, { status: 201 });
}
