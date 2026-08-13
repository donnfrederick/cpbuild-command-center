import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getOverwriteBlockStatus } from "@/lib/units-overwrite-guard";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

/**
 * GET /api/projects/[id]/units/overwrite-eligibility
 *
 * Returns whether overwrite mode is allowed for this project (no field data exists).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/projects/[id]/units/overwrite-eligibility", 401, "Unauthorized", elapsed(), {
      error: "Unauthorized",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (
    !role ||
    (!hasPermission(role, PERMISSIONS.EDIT_UPM) && !hasPermission(role, PERMISSIONS.MANAGE_PROJECTS))
  ) {
    logApi("GET", "/api/projects/[id]/units/overwrite-eligibility", 403, "Forbidden", elapsed(), {
      error: "Forbidden",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = await getOverwriteBlockStatus(db, projectId);

  return NextResponse.json({
    overwriteAllowed: !status.blocked,
    canUseOverwriteMode: hasPermission(role, PERMISSIONS.EDIT_UPM),
    ...status,
  });
}
