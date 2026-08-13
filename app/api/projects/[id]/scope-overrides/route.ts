import { NextResponse } from "next/server";
import { z } from "zod";
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

const UpsertOverrideSchema = z.object({
  scopeTypeId: z.string().min(1),
  canonicalScopeTypeId: z.string().min(1),
});

/**
 * GET /api/projects/[id]/scope-overrides
 *
 * Returns all distinct scope types used in this project, with their global canonical
 * and any project-level override. Permission: VIEW_UPM.
 *
 * Response:
 * {
 *   scopes: [{
 *     scopeTypeId, code, name,
 *     globalCanonical: { id, code, displayName } | null,
 *     projectOverride: { id, code, displayName } | null
 *   }]
 * }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/projects/[id]/scope-overrides", 401, "Unauthorized", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (!hasPermission(role, PERMISSIONS.VIEW_UPM)) {
    logApi("GET", "/api/projects/[id]/scope-overrides", 403, `Forbidden — role "${role}" lacks VIEW_UPM`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  // Load distinct scope types used in this project with their global canonical
  const [projectRows, overrides] = await Promise.all([
    db.projectRow.findMany({
      where: { projectId },
      select: {
        scopeTypeId: true,
        scopeType: {
          select: {
            id: true,
            code: true,
            name: true,
            canonicalScopeType: { select: { id: true, code: true, displayName: true } },
          },
        },
      },
      distinct: ["scopeTypeId"],
      orderBy: { rowIndex: "asc" },
    }),
    db.projectScopeOverride.findMany({
      where: { projectId },
      select: {
        scopeTypeId: true,
        canonicalScopeType: { select: { id: true, code: true, displayName: true } },
      },
    }),
  ]);

  const overrideMap = new Map(overrides.map((ov) => [ov.scopeTypeId, ov.canonicalScopeType]));

  const scopes = projectRows
    .filter((r) => r.scopeType !== null)
    .map((r) => ({
      scopeTypeId: r.scopeType!.id,
      code: r.scopeType!.code,
      name: r.scopeType!.name,
      globalCanonical: r.scopeType!.canonicalScopeType ?? null,
      projectOverride: overrideMap.get(r.scopeType!.id) ?? null,
    }));

  logApi("GET", `/api/projects/${projectId}/scope-overrides`, 200, `Returned ${scopes.length} scope types`, elapsed(), null);
  return NextResponse.json({ scopes });
}

/**
 * POST /api/projects/[id]/scope-overrides
 *
 * Upsert a project-level scope override for one scope type. Permission: EDIT_UPM.
 * Body: { scopeTypeId: string, canonicalScopeTypeId: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/scope-overrides", 401, "Unauthorized", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (!hasPermission(role, PERMISSIONS.EDIT_UPM)) {
    logApi("POST", "/api/projects/[id]/scope-overrides", 403, `Forbidden — role "${role}" lacks EDIT_UPM`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpsertOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const { scopeTypeId, canonicalScopeTypeId } = parsed.data;

  // Verify project and scope type both exist and the scope type is actually used in this project
  const [scopeTypeExists, canonicalExists, rowExists] = await Promise.all([
    db.scopeType.findUnique({ where: { id: scopeTypeId }, select: { id: true } }),
    db.canonicalScopeType.findUnique({ where: { id: canonicalScopeTypeId }, select: { id: true } }),
    db.projectRow.findFirst({ where: { projectId, scopeTypeId }, select: { id: true } }),
  ]);

  if (!scopeTypeExists) {
    return NextResponse.json({ error: "Scope type not found" }, { status: 404 });
  }
  if (!canonicalExists) {
    return NextResponse.json({ error: "Canonical scope type not found" }, { status: 404 });
  }
  if (!rowExists) {
    return NextResponse.json({ error: "Scope type is not used in this project" }, { status: 422 });
  }

  const override = await db.projectScopeOverride.upsert({
    where: { projectId_scopeTypeId: { projectId, scopeTypeId } },
    create: { projectId, scopeTypeId, canonicalScopeTypeId },
    update: { canonicalScopeTypeId },
    select: {
      id: true,
      scopeTypeId: true,
      canonicalScopeType: { select: { id: true, code: true, displayName: true } },
    },
  });

  logApi("POST", `/api/projects/${projectId}/scope-overrides`, 200, `Upserted override for scope ${scopeTypeId}`, elapsed(), null);
  return NextResponse.json({ override });
}
