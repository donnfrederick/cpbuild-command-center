import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import { loadBackfillProjects } from "@/lib/field-daily-report/project-scope";
import { resolveReportDateParam } from "@/lib/field-daily-report/service";

export const dynamic = "force-dynamic";

/** GET /api/reports/field-daily/projects?date=YYYY-MM-DD — active portfolio for backfill picker */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reportDate = resolveReportDateParam(req.nextUrl.searchParams.get("date"));
  const projects = await loadBackfillProjects(
    effective.user.id,
    effective.user.role,
  );

  return NextResponse.json({
    reportDate,
    projects: projects.map((p) => ({ id: p.id, projectName: p.projectName })),
  });
}
