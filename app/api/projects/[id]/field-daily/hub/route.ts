import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerId } from "@/lib/field-daily-report/auth";
import { fetchProjectFieldDailyHub } from "@/lib/field-daily-report/project-hub-service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { todayReportDateInOrgTz } from "@/lib/field-daily-report/timezone";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/field-daily/hub — preview + history for project hub card */
export async function GET(
  _req: NextRequest,
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

  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    todayReportDateInOrgTz(),
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );

  const hub = await fetchProjectFieldDailyHub({
    projectId,
    sessionRole: effective.user.role,
    reportOwnerUserId,
  });
  if (!hub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ hub });
}
