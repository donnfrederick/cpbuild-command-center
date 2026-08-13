import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import {
  fetchGlobalInspectionsReport,
  parseInspectionReportDateParam,
} from "@/lib/inspections/fetch-global-inspections-report";

export const runtime = "nodejs";

/**
 * GET /api/reports/global-inspections
 * Cross-project clear inspection submissions for the global inspections report.
 */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.VIEW_DASHBOARD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let fromDate: Date | null = null;
  if (fromParam) {
    fromDate = parseInspectionReportDateParam(fromParam, false);
    if (!fromDate) {
      return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    }
  }

  let toDate: Date | null = null;
  if (toParam) {
    toDate = parseInspectionReportDateParam(toParam, true);
    if (!toDate) {
      return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
    }
  }

  const report = await fetchGlobalInspectionsReport({
    role: effective.user.role ?? "MEMBER",
    fromDate,
    toDate,
  });

  return NextResponse.json(report);
}
