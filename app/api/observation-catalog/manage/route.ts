import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import { fetchManageObservationCatalog } from "@/lib/observations/observation-catalog";

/** GET /api/observation-catalog/manage — full catalog for Project Settings. */
export async function GET() {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const catalog = await fetchManageObservationCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[observation-catalog/manage GET]", err);
    return NextResponse.json({ error: "Failed to load observation catalog" }, { status: 500 });
  }
}
