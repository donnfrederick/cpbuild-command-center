import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

/**
 * GET /api/releases/share-link?releaseId=<id>&locale=<en|es>
 *
 * Returns a shareable URL that, when opened by any authenticated user,
 * immediately triggers the release tour via the ?tour= deep-link handler.
 *
 * The URL lands on /[locale]/projects (controls-manager entry point) so recipients
 * who do not use the dashboard home still land on a valid first screen.
 *
 * Authentication: admin session only (MANAGE_ROLES permission).
 *
 * Returns:
 *   200 { url }   — shareable link
 *   400           — missing releaseId
 *   401           — not authenticated
 *   403           — not an admin
 *   404           — release or tour not found
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const releaseId = searchParams.get("releaseId");
  const SUPPORTED_LOCALES = ["en", "es"] as const;
  const requestedLocale = searchParams.get("locale") ?? "en";
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requestedLocale)
    ? requestedLocale
    : "en";

  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: { id: true, tour: { select: { id: true } } },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (!release.tour) {
    return NextResponse.json(
      { error: "No tour exists for this release — generate one first" },
      { status: 404 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.RAILWAY_SERVICE_COMMAND_CENTER_REBOOT_URL ??
    "https://command-center-reboot-production.up.railway.app";

  const url = `${baseUrl}/${locale}/projects?tour=${releaseId}`;

  return NextResponse.json({ url });
}
