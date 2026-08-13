import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT } from "@/lib/tour-demo-data";
import {
  checkProductionTestProjectFlagPatchAllowed,
  enforceProductionProjectMutation,
  enforceProjectReadVisibility,
  normalizeRoleCode,
} from "@/lib/production-project-access";

const UpdateProjectSchema = z.object({
  installManagerId: z.string().optional().nullable(),
  installManagerName: z.string().max(100).optional().nullable(),
  projectManagerId: z.string().optional().nullable(),
  isTestProject: z.boolean().optional(),
});

// ─── GET /api/projects/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/projects/[id]", 401, "Unauthorized — no active session", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (id === TOUR_DEMO_PROJECT_ID) {
    return NextResponse.json(TOUR_DEMO_PROJECT);
  }

  const readBlock = await enforceProjectReadVisibility(id, session);
  if (readBlock) return readBlock;

  const project = await enrichProjectById(id);
  if (!project) {
    logApi("GET", `/api/projects/${id}`, 404, "Project not found or has been deleted", elapsed(), { error: "Not found" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  logApi("GET", `/api/projects/${id}`, 200, `Fetched project "${project.projectName}"`, elapsed(), project);
  return NextResponse.json(project);
}

// ─── PATCH /api/projects/[id] ─────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("PATCH", "/api/projects/[id]", 401, "Unauthorized — no active session", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!userRole || !hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS)) {
    logApi("PATCH", "/api/projects/[id]", 403, `Forbidden — role "${userRole}" lacks MANAGE_PROJECTS permission`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logApi("PATCH", `/api/projects/${id}`, 400, "Invalid JSON in request body", elapsed(), { error: "Invalid JSON" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateProjectSchema.safeParse(body);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const errBody = { error: "Validation failed", issues: parsed.error.issues };
    logApi("PATCH", `/api/projects/${id}`, 422, `Validation failed — ${summary}`, elapsed(), errBody);
    return NextResponse.json(errBody, { status: 422 });
  }

  const data = parsed.data;

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing || !!existing.deletedAt) {
    logApi("PATCH", `/api/projects/${id}`, 404, "Project not found or has been deleted", elapsed(), { error: "Not found" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prodBlock = await enforceProductionProjectMutation(id, session);
  if (prodBlock) return prodBlock;

  if (data.isTestProject !== undefined) {
    const flagGuard = checkProductionTestProjectFlagPatchAllowed(session.user.role, true);
    if (!flagGuard.allowed) {
      logApi(
        "PATCH",
        `/api/projects/${id}`,
        flagGuard.status,
        flagGuard.error,
        elapsed(),
        { error: flagGuard.error }
      );
      return NextResponse.json({ error: flagGuard.error }, { status: flagGuard.status });
    }
  }

  await db.project.update({
    where: { id },
    data: {
      ...(data.installManagerId !== undefined && { installManagerId: data.installManagerId }),
      ...(data.installManagerName !== undefined && { installManagerName: data.installManagerName }),
      ...(data.projectManagerId !== undefined && { projectManagerId: data.projectManagerId }),
      ...(data.isTestProject !== undefined && { isTestProject: data.isTestProject }),
    },
  });

  const payload = await enrichProjectById(id);
  const changedFields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
  logApi("PATCH", `/api/projects/${id}`, 200, `Updated "${payload?.projectName ?? id}" — changed: ${changedFields.join(", ")}`, elapsed(), payload);
  return NextResponse.json(payload);
}

// ─── DELETE /api/projects/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]", 401, "Unauthorized — no active session", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!userRole || !hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS)) {
    logApi("DELETE", "/api/projects/[id]", 403, `Forbidden — role "${userRole}" lacks MANAGE_PROJECTS permission`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing || !!existing.deletedAt) {
    logApi("DELETE", `/api/projects/${id}`, 404, "Project not found or has been deleted", elapsed(), { error: "Not found" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.isTestProject && normalizeRoleCode(userRole) !== "ADMIN") {
    logApi("DELETE", `/api/projects/${id}`, 403, "Forbidden — only Admin may delete test projects", elapsed());
    return NextResponse.json({ error: "Forbidden — only Admin may delete test projects" }, { status: 403 });
  }

  const prodBlock = await enforceProductionProjectMutation(id, session);
  if (prodBlock) return prodBlock;

  await db.project.update({ where: { id }, data: { deletedAt: new Date() } });
  logApi("DELETE", `/api/projects/${id}`, 204, `Soft-deleted project ${id}`, elapsed());
  return new NextResponse(null, { status: 204 });
}
