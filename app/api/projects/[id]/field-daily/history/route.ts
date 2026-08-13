import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerId } from "@/lib/field-daily-report/auth";
import { parseFieldDailyHistoryQuery } from "@/lib/field-daily-report/hub-history";
import { fetchProjectFieldDailyHistory } from "@/lib/field-daily-report/project-hub-service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { todayReportDateInOrgTz } from "@/lib/field-daily-report/timezone";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/field-daily/history — paginated history with optional date range */
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

  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    todayReportDateInOrgTz(),
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseFieldDailyHistoryQuery(req.nextUrl.searchParams);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );

  const page = await fetchProjectFieldDailyHistory({
    projectId,
    reportOwnerUserId,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    cursor: parsed.cursor,
    limit: parsed.limit,
  });

  return NextResponse.json({
    history: page,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
  });
}
