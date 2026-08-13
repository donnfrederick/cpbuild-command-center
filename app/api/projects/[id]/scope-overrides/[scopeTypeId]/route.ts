import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { logApi, apiTimer } from "@/lib/api-logger";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

/**
 * DELETE /api/projects/[id]/scope-overrides/[scopeTypeId]
 *
 * Remove the project-level override for this scope type so it falls back to the
 * global canonical. Permission: EDIT_UPM. Idempotent — 200 even if no row existed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scopeTypeId: string }> },
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]/scope-overrides/[scopeTypeId]", 401, "Unauthorized", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (!hasPermission(role, PERMISSIONS.EDIT_UPM)) {
    logApi("DELETE", "/api/projects/[id]/scope-overrides/[scopeTypeId]", 403, `Forbidden — role "${role}" lacks EDIT_UPM`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, scopeTypeId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  await db.projectScopeOverride.deleteMany({
    where: { projectId, scopeTypeId },
  });

  logApi("DELETE", `/api/projects/${projectId}/scope-overrides/${scopeTypeId}`, 200, "Override deleted (or was already absent)", elapsed(), null);
  return NextResponse.json({ deleted: true });
}
