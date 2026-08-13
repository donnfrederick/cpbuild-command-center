import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { SITE_TOUR_STEPS } from "@/lib/site-tour-steps";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { TOUR_DEMO_PROJECT_ID } from "@/lib/tour-demo-data";

/**
 * GET /api/site-tour
 *
 * Returns the site walkthrough tour steps for the authenticated user.
 *
 * Steps that navigate to /users are omitted for roles without VIEW_DASHBOARD.
 * Uses the effective session so role-preview is respected: previewing as a
 * role without VIEW_DASHBOARD will see the filtered step set.
 *
 * Steps containing "{{PROJECT_ID}}" in their pageUrl always resolve to
 * TOUR_DEMO_PROJECT_ID — an in-memory fake project with no DB record.
 * This means the tour always has a project to navigate into, regardless of
 * whether any real projects exist.
 *
 * Auth: any authenticated session.
 */
export async function GET() {
  const session = await getEffectiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canViewUsers = hasPermission(session.user.role, PERMISSIONS.VIEW_DASHBOARD);

  let steps = canViewUsers
    ? SITE_TOUR_STEPS
    : SITE_TOUR_STEPS.filter((s) => !s.pageUrl.includes("/users"));

  steps = steps.map((s) =>
    s.pageUrl.includes("{{PROJECT_ID}}")
      ? { ...s, pageUrl: s.pageUrl.replace("{{PROJECT_ID}}", TOUR_DEMO_PROJECT_ID) }
      : s
  );

  return NextResponse.json({ steps });
}
