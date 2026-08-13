import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import {
  fetchFieldDailyReport,
  resolveReportDateParam,
} from "@/lib/field-daily-report/service";

export const dynamic = "force-dynamic";

/** GET /api/reports/field-daily?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const date = resolveReportDateParam(new URL(req.url).searchParams.get("date"));
  const report = await fetchFieldDailyReport({
    installManagerUserId: effective.user.id,
    sessionRole: effective.user.role,
    reportDate: date,
  });

  return NextResponse.json({ report, reportDate: date });
}
