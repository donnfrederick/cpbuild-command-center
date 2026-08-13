import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { parseGlobalProgressQuery } from "@/lib/reports/portfolio-progress-query";
import { computePortfolioProgressDetail } from "@/lib/reports/portfolio-progress-service";

export const runtime = "nodejs";

/**
 * GET /api/reports/global-progress/[projectId]
 * Full building/level grid + unit drill-down for one expanded project card.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.VIEW_DASHBOARD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, effective);
  if (readBlock) return readBlock;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseGlobalProgressQuery(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await computePortfolioProgressDetail(
    effective.user.role ?? "MEMBER",
    projectId,
    parsed.value,
  );

  if (!result) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
