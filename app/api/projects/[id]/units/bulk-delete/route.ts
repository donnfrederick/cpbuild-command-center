import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
const BulkDeleteSchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1).max(500),
});

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

/**
 * POST /api/projects/[id]/units/bulk-delete
 *
 * Delete multiple rows by ID. Used for undo of add operations.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/bulk-delete", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  // Bulk-deleting unit rows requires EDIT_UPM (CONTROLS_MANAGER) or MANAGE_PROJECTS (INSTALL_MANAGER etc).
  if (!userRole || (!hasPermission(userRole, PERMISSIONS.EDIT_UPM) && !hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS))) {
    logApi("POST", "/api/projects/[id]/units/bulk-delete", 403, `Forbidden — role "${userRole}" lacks EDIT_UPM or MANAGE_PROJECTS`, elapsed());
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { rowIds } = parsed.data;

  const result = await db.projectRow.deleteMany({
    where: { id: { in: rowIds }, projectId },
  });

  logApi("POST", `/api/projects/${projectId}/units/bulk-delete`, 200, `Deleted ${result.count} rows`, elapsed(), { deleted: result.count });

  return NextResponse.json({ deleted: result.count });
}
