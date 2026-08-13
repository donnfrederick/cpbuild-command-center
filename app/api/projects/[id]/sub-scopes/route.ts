import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import {
  createSubScopesWithInstances,
  getSubScopesForProject,
  addSubScopeToGroup,
} from "@/lib/sub-scopes";
import {
  enforceProductionProjectMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateSubScopesSchema = z
  .object({
    unitType: z.string().min(1).max(100),
    scopeTypeId: z.string().min(1),
    distributionMode: z.enum(["even", "manual"]),
    subScopes: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          displayOrder: z.number().int().optional(),
          /**
           * Required when distributionMode = "manual". Must be a positive number.
           * Ignored (and may be omitted) when distributionMode = "even".
           */
          qty: z.number().positive().optional(),
        })
      )
      .min(2, "At least 2 sub-scopes are required to split a scope"),
  })
  .superRefine((val, ctx) => {
    if (val.distributionMode === "manual") {
      val.subScopes.forEach((s, i) => {
        if (s.qty == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["subScopes", i, "qty"],
            message: "qty is required for each sub-scope when distributionMode is 'manual'",
          });
        }
      });
    }
  });

// ─── GET /api/projects/[id]/sub-scopes ───────────────────────────────────────
//
// Returns all sub-scope definitions for the project, grouped by (unitType, scopeType).
// Any role that can read units can call this.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const canRead =
    hasPermission(role, PERMISSIONS.VIEW_UPM) ||
    hasPermission(role, PERMISSIONS.MANAGE_PROJECTS) ||
    hasPermission(role, PERMISSIONS.MANAGE_UNIT_STATUS);
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const readBlock = await enforceProjectReadVisibility(id, session);
  if (readBlock) return readBlock;

  try {
    const groups = await getSubScopesForProject(db, id);
    return NextResponse.json({ subScopes: groups });
  } catch (err) {
    console.error("[GET /api/projects/[id]/sub-scopes]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/projects/[id]/sub-scopes ──────────────────────────────────────
//
// Two modes (discriminated by addToGroup):
//
//   addToGroup: false (default) — creates a full new group (min 2 sub-scopes)
//     Body: { unitType, scopeTypeId, distributionMode, subScopes: [{name,…},…] }
//
//   addToGroup: true — appends a single sub-scope to an existing group
//     Body: { addToGroup: true, unitType, scopeTypeId, name, qty? }
//
// Requires MANAGE_PROJECTS.

const AddToGroupSchema = z.object({
  addToGroup: z.literal(true),
  unitType: z.string().min(1).max(100),
  scopeTypeId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  qty: z.number().positive().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_PROJECTS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const body: unknown = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Branch: add single sub-scope to existing group ──────────────────────────
  if (typeof body === "object" && body !== null && "addToGroup" in body && (body as Record<string, unknown>).addToGroup === true) {
    const parsed = AddToGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { unitType, scopeTypeId, name, qty } = parsed.data;

    // Verify group exists (must have at least 1 existing sub-scope)
    const groupCount = await db.projectSubScope.count({
      where: { projectId, unitType, scopeTypeId },
    });
    if (groupCount === 0) {
      return NextResponse.json(
        { error: "No existing sub-scope group found for this unitType + scopeType. Use the standard create flow instead." },
        { status: 400 }
      );
    }

    // Check for name conflict
    const nameConflict = await db.projectSubScope.findFirst({
      where: { projectId, unitType, scopeTypeId, name: { equals: name.trim() } },
      select: { id: true },
    });
    if (nameConflict) {
      return NextResponse.json(
        { error: `A sub-scope named "${name.trim()}" already exists in this group` },
        { status: 409 }
      );
    }

    try {
      const added = await addSubScopeToGroup(db, {
        projectId, unitType, scopeTypeId, name, qty,
        createdById: session.user.id,
      });

      // Enrich scopeTypeName
      const scopeType = await db.scopeType.findUnique({
        where: { id: scopeTypeId },
        select: { name: true },
      });
      return NextResponse.json(
        { subScope: { ...added, scopeTypeName: scopeType?.name ?? "" } },
        { status: 201 }
      );
    } catch (err) {
      console.error("[POST /api/projects/[id]/sub-scopes addToGroup]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // ── Branch: create full new group ───────────────────────────────────────────
  const parsed = CreateSubScopesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { unitType, scopeTypeId, distributionMode, subScopes } = parsed.data;

  // Verify the scopeType exists
  const scopeType = await db.scopeType.findUnique({
    where: { id: scopeTypeId },
    select: { id: true, name: true },
  });
  if (!scopeType) {
    return NextResponse.json(
      { error: "scopeTypeId does not match a known scope type" },
      { status: 400 }
    );
  }

  // Verify at least one ProjectRow matches (project, unitType, scopeType)
  const matchingRowCount = await db.projectRow.count({
    where: { projectId, unitType, scopeTypeId },
  });
  if (matchingRowCount === 0) {
    return NextResponse.json(
      {
        error: `No rows found for unitType "${unitType}" with scope "${scopeType.name}" in this project`,
      },
      { status: 400 }
    );
  }

  // Check for name conflicts with existing sub-scopes on this combination
  const names = subScopes.map((s) => s.name);
  const existing = await db.projectSubScope.findFirst({
    where: {
      projectId,
      unitType,
      scopeTypeId,
      name: { in: names },
    },
    select: { name: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `A sub-scope named "${existing.name}" already exists for this unit type and scope`,
      },
      { status: 409 }
    );
  }

  try {
    const created = await createSubScopesWithInstances(db, {
      projectId,
      unitType,
      scopeTypeId,
      distributionMode,
      subScopes,
      createdById: session.user.id,
    });

    // Enrich with scopeTypeName
    const result = created.map((d) => ({ ...d, scopeTypeName: scopeType.name }));

    return NextResponse.json(
      {
        subScopes: result,
        instancesCreated: result[0]?.instanceCount ?? 0,
        rowCount: matchingRowCount,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/projects/[id]/sub-scopes]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/projects/[id]/sub-scopes ─────────────────────────────────────
//
// Changes the distribution mode for an entire (unitType, scopeType) group.
//
//   even → manual: caller must supply defaultQty for each sub-scope. Each
//     definition's qty is set to that value, and all existing instances are
//     updated to match.
//
//   manual → even: clears qty from all definitions in the group. Recalculates
//     instance qty from parentRow.qty ÷ groupSize. Rows with null qty get null.
//
// Body: { unitType, scopeTypeId, distributionMode: "even" | "manual", defaultQty?: number }
// Requires MANAGE_PROJECTS.

const PatchGroupDistributionSchema = z.object({
  unitType: z.string().min(1).max(100),
  scopeTypeId: z.string().min(1),
  distributionMode: z.enum(["even", "manual"]),
  /** Required when distributionMode = "manual". Applied to every sub-scope in the group. */
  defaultQty: z.number().positive().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_PROJECTS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const body: unknown = await req.json().catch(() => null);
  const parsed = PatchGroupDistributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { unitType, scopeTypeId, distributionMode, defaultQty } = parsed.data;

  if (distributionMode === "manual" && (defaultQty == null || defaultQty <= 0)) {
    return NextResponse.json(
      { error: "defaultQty is required and must be positive when switching to manual mode" },
      { status: 400 }
    );
  }

  const definitions = await db.projectSubScope.findMany({
    where: { projectId, unitType, scopeTypeId },
    select: { id: true },
  });

  if (definitions.length === 0) {
    return NextResponse.json({ error: "No sub-scopes found for this group" }, { status: 404 });
  }

  const defIds = definitions.map((d) => d.id);

  try {
    if (distributionMode === "manual") {
      // Set qty on every definition in the group
      await db.projectSubScope.updateMany({
        where: { id: { in: defIds } },
        data: { qty: defaultQty },
      });
      // Propagate to all instances for this group
      await db.projectSubScopeInstance.updateMany({
        where: { subScopeId: { in: defIds } },
        data: { qty: defaultQty! },
      });
    } else {
      // even mode: clear definition qtys
      await db.projectSubScope.updateMany({
        where: { id: { in: defIds } },
        data: { qty: null },
      });
      // Recalculate instance qty from parentRow.qty / groupSize
      const groupSize = definitions.length;
      const instances = await db.projectSubScopeInstance.findMany({
        where: { subScopeId: { in: defIds } },
        select: { id: true, row: { select: { qty: true } } },
      });
      const instanceUpdates = instances.map((inst) => {
        const rowQty = inst.row?.qty;
        const newQty =
          rowQty != null ? Math.round((Number(rowQty) / groupSize) * 10000) / 10000 : null;
        return db.projectSubScopeInstance.update({
          where: { id: inst.id },
          data: { qty: newQty },
        });
      });
      await db.$transaction(instanceUpdates);
    }

    return NextResponse.json({ distributionMode });
  } catch (err) {
    console.error("[PATCH /api/projects/[id]/sub-scopes]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
