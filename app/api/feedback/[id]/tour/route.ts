import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";

const tourStepSchema = z.object({
  order: z.number().int().min(0),
  pageUrl: z.string().min(1),
  elementSelector: z.string().default(""),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  voiceText: z.string().max(1000).default(""),
});

const upsertTourSchema = z.object({
  steps: z.array(tourStepSchema).min(1).max(20),
});

/**
 * GET /api/feedback/[id]/tour
 * Any authenticated user can fetch tour steps for a resolved feedback report.
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

  const report = await db.feedbackReport.findUnique({
    where: { id },
    select: { id: true, status: true, tour: true },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (report.status !== "RESOLVED") {
    return NextResponse.json(
      { error: "Tour is only available for resolved feedback" },
      { status: 403 }
    );
  }

  if (!report.tour) {
    return NextResponse.json({ error: "No tour attached" }, { status: 404 });
  }

  return NextResponse.json(report.tour);
}

/**
 * PUT /api/feedback/[id]/tour
 * Inbox roles — create or fully replace the tour for a feedback report.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = upsertTourSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const report = await db.feedbackReport.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tour = await db.feedbackTour.upsert({
    where: { feedbackId: id },
    create: { feedbackId: id, steps: parsed.data.steps },
    update: { steps: parsed.data.steps },
  });

  return NextResponse.json(tour);
}
