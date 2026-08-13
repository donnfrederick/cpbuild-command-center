import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import { fetchManageIssueCatalog } from "@/lib/issues/issue-catalog";

/** GET /api/issue-catalog/manage — full catalog including inactive rows. */
export async function GET() {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const catalog = await fetchManageIssueCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[issue-catalog/manage GET]", err);
    return NextResponse.json({ error: "Failed to load issue catalog" }, { status: 500 });
  }
}
