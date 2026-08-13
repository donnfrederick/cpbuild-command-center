import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  canUseFieldDailyReport,
  resolveFieldDailyReportOwnerId,
} from "@/lib/field-daily-report/auth";
import {
  fetchProjectFieldDailySlice,
  resolveReportDateParam,
} from "@/lib/field-daily-report/service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/field-daily?date=YYYY-MM-DD */
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

  const date = resolveReportDateParam(new URL(req.url).searchParams.get("date"));
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    date,
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );
  const slice = await fetchProjectFieldDailySlice({
    installManagerUserId: reportOwnerUserId,
    sessionRole: effective.user.role,
    projectId,
    reportDate: date,
  });

  return NextResponse.json({ slice, reportDate: date });
}
