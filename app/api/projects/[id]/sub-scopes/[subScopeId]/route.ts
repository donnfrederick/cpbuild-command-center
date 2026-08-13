import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";

// ─── Shared auth helper ───────────────────────────────────────────────────────

async function requireManageProjects() {
  const session = await getSession();
  if (!session?.user) return { error: "Unauthorized", status: 401 } as const;
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_PROJECTS))
    return { error: "Forbidden", status: 403 } as const;
  return { session };
}

// ─── PATCH /api/projects/[id]/sub-scopes/[subScopeId] ────────────────────────
//
// Updates name and/or qty on a sub-scope definition.
// When qty changes, all existing instances for this sub-scope are updated to match.
// Setting qty to null switches this sub-scope to "even" mode (instance qty recalculated
// from parentRow.qty / totalSubScopesInGroup at the point of the next sync — for now
// the instances are set to null so the UI reflects the pending recalculation).
// Requires MANAGE_PROJECTS.

const PatchSubScopeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  qty: z.number().positive().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; subScopeId: string }> }
) {
  const auth = await requireManageProjects();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: projectId, subScopeId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, auth.session);
  if (prodBlock) return prodBlock;

  const body: unknown = await req.json().catch(() => null);
  const parsed = PatchSubScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  if (!parsed.data.name && parsed.data.qty === undefined) {
    return NextResponse.json({ error: "Nothing to update — provide name and/or qty" }, { status: 400 });
  }

  const subScope = await db.projectSubScope.findUnique({
    where: { id: subScopeId },
    select: { id: true, projectId: true },
  });
  if (!subScope || subScope.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const dataUpdate: Record<string, unknown> = {};
    if (parsed.data.name) dataUpdate.name = parsed.data.name.trim();
    if (parsed.data.qty !== undefined) dataUpdate.qty = parsed.data.qty;

    const updated = await db.projectSubScope.update({
      where: { id: subScopeId },
      data: dataUpdate,
      select: { id: true, name: true, displayOrder: true, qty: true, unitType: true, scopeTypeId: true },
    });

    // When qty changes, propagate to all instances for this sub-scope
    if (parsed.data.qty !== undefined) {
      await db.projectSubScopeInstance.updateMany({
        where: { subScopeId },
        data: { qty: parsed.data.qty },
      });
    }

    return NextResponse.json({
      subScope: { ...updated, qty: updated.qty != null ? Number(updated.qty) : null },
    });
  } catch (err) {
    console.error("[PATCH /api/projects/[id]/sub-scopes/[subScopeId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/projects/[id]/sub-scopes/[subScopeId] ───────────────────────
//
// Hard-deletes a sub-scope definition. All tracking instances are removed via
// CASCADE — this action is irreversible and loses stage/status history.
// Requires MANAGE_PROJECTS.

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; subScopeId: string }> }
) {
  const auth = await requireManageProjects();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: projectId, subScopeId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, auth.session);
  if (prodBlock) return prodBlock;

  // Verify the sub-scope belongs to this project
  const subScope = await db.projectSubScope.findUnique({
    where: { id: subScopeId },
    select: { id: true, projectId: true, name: true },
  });

  if (!subScope || subScope.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await db.projectSubScope.delete({ where: { id: subScopeId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/projects/[id]/sub-scopes/[subScopeId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
