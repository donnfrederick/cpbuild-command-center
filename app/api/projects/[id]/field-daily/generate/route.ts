import { NextRequest, NextResponse } from "next/server";
import { FieldDailyReportTrigger } from "@prisma/client";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  canGenerateProjectFieldDailyReport,
  canUseFieldDailyReport,
  resolveFieldDailyReportOwnerId,
} from "@/lib/field-daily-report/auth";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { generateProjectFieldDailySlice } from "@/lib/field-daily-report/project-hub-service";
import { resolveReportDateParam } from "@/lib/field-daily-report/service";
import { todayReportDateInOrgTz } from "@/lib/field-daily-report/timezone";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/field-daily/generate — body: { date?: "YYYY-MM-DD" } */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await context.params;
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, installManagerId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !canGenerateProjectFieldDailyReport(
      effective.user.role,
      effective.user.id,
      project.installManagerId,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { date?: string; bumpGeneratedAt?: boolean } = {};
  try {
    body = (await req.json()) as { date?: string; bumpGeneratedAt?: boolean };
  } catch {
    body = {};
  }

  const reportDate = resolveReportDateParam(body.date ?? null);
  const isToday = reportDate === todayReportDateInOrgTz();
  const bumpGeneratedAt = body.bumpGeneratedAt ?? isToday;
  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );

  const result = await generateProjectFieldDailySlice({
    reportOwnerUserId,
    sessionRole: effective.user.role,
    projectId,
    reportDate,
    trigger: FieldDailyReportTrigger.MANUAL,
    generatedByUserId: effective.user.id,
    activityThrough: activityThroughForReportDate(reportDate),
    bumpGeneratedAt,
  });

  if (!result) {
    return NextResponse.json({ error: "Could not generate report" }, { status: 500 });
  }

  return NextResponse.json({
    slice: result.slice,
    reportDate,
    contentChanged: result.contentChanged,
    hadExisting: result.hadExisting,
  });
}
