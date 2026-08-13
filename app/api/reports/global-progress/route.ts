import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { parseGlobalProgressQuery } from "@/lib/reports/portfolio-progress-query";
import { computePortfolioProgressList } from "@/lib/reports/portfolio-progress-service";

export const runtime = "nodejs";

/**
 * GET /api/reports/global-progress
 * Portfolio-level scope progress summaries for collapsed project cards.
 */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.VIEW_DASHBOARD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseGlobalProgressQuery(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await computePortfolioProgressList(effective.user.role ?? "MEMBER", parsed.value);
  return NextResponse.json(result);
}
