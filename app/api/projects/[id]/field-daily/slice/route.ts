import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  canUseFieldDailyReport,
  resolveFieldDailyReportOwnerId,
} from "@/lib/field-daily-report/auth";
import { fetchProjectFieldDailySliceByDate } from "@/lib/field-daily-report/project-hub-service";
import { resolveReportDateParam } from "@/lib/field-daily-report/service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/field-daily/slice?date=YYYY-MM-DD — fresh slice + saved notes */
export async function GET(
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

  const reportDate = resolveReportDateParam(req.nextUrl.searchParams.get("date"));
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );

  const slice = await fetchProjectFieldDailySliceByDate({
    projectId,
    reportDate,
    reportOwnerUserId,
    sessionRole: effective.user.role,
  });
  if (!slice) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ slice, reportDate });
}
