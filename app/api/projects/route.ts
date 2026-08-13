import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { insertProjectRows } from "@/lib/project-rows";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enrichProjectById, enrichProjectListResilient } from "@/lib/project-unifier-merge";
import { enrichProjectsWithFavorites, favoriteOwnerFromEffectiveSession } from "@/lib/project-favorites";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { UNIFIER_AVAILABLE_HEADER } from "@/lib/unifier/availability-header";
import { getProjectByPid } from "@/lib/unifier/service";
import {
  checkProductionProjectCreateAllowed,
  checkProductionTestProjectFlagPatchAllowed,
  isTestProjectSquadRole,
} from "@/lib/production-project-access";

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateProjectSchema = z.object({
  unifierPid: z.string().min(1),
  installManagerId: z.string().optional(),
  installManagerName: z.string().max(100).optional(),
  projectManagerId: z.string().optional(),
  /** Unit Plan Matrix rows — parsed from Field Tracker spreadsheet. */
  upmData: z.array(z.record(z.string(), z.unknown())).optional(),
  /** When true, project is a production sandbox (squad-only visibility in strict prod). */
  isTestProject: z.boolean().optional(),
});

// ─── GET /api/projects ────────────────────────────────────────────────────────

export async function GET() {
  const elapsed = apiTimer();
  // Use the effective session so that role-preview is respected — an ADMIN
  // previewing as INSTALL_MANAGER should see the same project list as that role.
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    logApi("GET", "/api/projects", 401, "Unauthorized — no active session", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const squad = isTestProjectSquadRole(effective.user.role);
  const [rows, scopeRows] = await Promise.all([
    db.project.findMany({
      where: {
        deletedAt: null,
        ...(squad ? {} : { isTestProject: false }),
      },
      orderBy: { createdAt: "asc" },
    }),
    db.projectRow.findMany({
      where: { scopeTypeId: { not: null } },
      select: { projectId: true, scopeType: { select: { name: true } } },
      distinct: ["projectId", "scopeTypeId"],
    }),
  ]);
  const scopeMap = new Map<string, Set<string>>();
  for (const r of scopeRows) {
    if (!r.scopeType) continue;
    if (!scopeMap.has(r.projectId)) scopeMap.set(r.projectId, new Set());
    scopeMap.get(r.projectId)!.add(r.scopeType.name);
  }

  const { projects, unifierAvailable } = await enrichProjectListResilient(
    rows.map((r) => Object.assign(r, { scopeTypes: [...(scopeMap.get(r.id) ?? [])].sort() }))
  );

  const dbUserId = await resolveSessionToDbUserId(favoriteOwnerFromEffectiveSession(effective));
  const projectsWithFavorites = await enrichProjectsWithFavorites(projects, dbUserId);

  logApi(
    "GET",
    "/api/projects",
    200,
    `Returned ${projectsWithFavorites.length} active project${projectsWithFavorites.length !== 1 ? "s" : ""}${unifierAvailable ? "" : " (Unifier unavailable — DB-only)"}`,
    elapsed(),
    projectsWithFavorites
  );
  return NextResponse.json(projectsWithFavorites, {
    headers: { [UNIFIER_AVAILABLE_HEADER]: unifierAvailable ? "true" : "false" },
  });
}

// ─── POST /api/projects ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects", 401, "Unauthorized — no active session", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  const canCreate = hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS)
    || hasPermission(userRole, PERMISSIONS.CREATE_PROJECT);
  if (!userRole || !canCreate) {
    logApi("POST", "/api/projects", 403, `Forbidden — role "${userRole}" lacks MANAGE_PROJECTS or CREATE_PROJECT permission`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logApi("POST", "/api/projects", 400, "Invalid JSON in request body", elapsed(), { error: "Invalid JSON" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const errBody = { error: "Validation failed", issues: parsed.error.issues };
    logApi("POST", "/api/projects", 422, `Validation failed — ${summary}`, elapsed(), errBody);
    return NextResponse.json(errBody, { status: 422 });
  }

  const data = parsed.data;

  const unitsRows: Record<string, string>[] = (data.upmData ?? [])
    .map((row) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof k === "string" && k.trim()) {
          clean[k] = v == null || v === "" ? "" : String(v);
        }
      }
      return clean;
    })
    .filter(
      (clean) =>
        (clean["Building"] ?? "").trim() !== "" ||
        (clean["Level"] ?? "").trim() !== "" ||
        (clean["Unit"] ?? "").trim() !== ""
    );

  const baseProjectFields = {
    installManagerId: data.installManagerId ?? null,
    installManagerName: data.installManagerName ?? null,
    projectManagerId: data.projectManagerId ?? null,
    unifierPid: data.unifierPid,
  };

  const existing = await db.project.findUnique({
    where: { unifierPid: data.unifierPid },
  });

  try {
    if (existing) {
      if (existing.deletedAt !== null) {
        const effectiveIsTest =
          data.isTestProject !== undefined ? data.isTestProject : existing.isTestProject;
        const restoreGuard = checkProductionProjectCreateAllowed(
          userRole,
          effectiveIsTest ? true : false
        );
        if (!restoreGuard.allowed) {
          logApi(
            "POST",
            "/api/projects",
            restoreGuard.status,
            restoreGuard.error,
            elapsed(),
            { error: restoreGuard.error }
          );
          return NextResponse.json({ error: restoreGuard.error }, { status: restoreGuard.status });
        }
        if (data.isTestProject !== undefined) {
          const flagGuard = checkProductionTestProjectFlagPatchAllowed(userRole, true);
          if (!flagGuard.allowed) {
            logApi(
              "POST",
              "/api/projects",
              flagGuard.status,
              flagGuard.error,
              elapsed(),
              { error: flagGuard.error }
            );
            return NextResponse.json({ error: flagGuard.error }, { status: flagGuard.status });
          }
        }
        await db.project.update({
          where: { id: existing.id },
          data: {
            ...baseProjectFields,
            deletedAt: null,
            ...(data.isTestProject !== undefined ? { isTestProject: data.isTestProject } : {}),
          },
        });
        await db.$executeRawUnsafe(`DELETE FROM project_rows WHERE "projectId" = $1`, existing.id);
        let restoredUnlinked: import("@/lib/project-rows").UnlinkedScopeType[] = [];
        if (unitsRows.length > 0) {
          const result = await insertProjectRows(db, existing.id, unitsRows, 0);
          restoredUnlinked = result.unlinkedScopeTypes;
        }
        const api = await enrichProjectById(existing.id);
        const shell = await getProjectByPid(data.unifierPid);
        const label = shell?.projectName?.trim() || data.unifierPid;
        const restoredPayload = { ...api!, restored: true, unitsCount: unitsRows.length, unlinkedScopeTypes: restoredUnlinked };
        logApi("POST", "/api/projects", 200, `Restored previously deleted project "${label}" (Unifier PID: ${data.unifierPid})`, elapsed(), restoredPayload);
        return NextResponse.json(restoredPayload, { status: 200 });
      }
      const conflictBody = { error: "A project linked to this Unifier project already exists." };
      logApi("POST", "/api/projects", 409, `Duplicate — project already linked to Unifier PID ${data.unifierPid}`, elapsed(), conflictBody);
      return NextResponse.json(conflictBody, { status: 409 });
    }

    const createGuard = checkProductionProjectCreateAllowed(userRole, data.isTestProject);
    if (!createGuard.allowed) {
      logApi(
        "POST",
        "/api/projects",
        createGuard.status,
        createGuard.error,
        elapsed(),
        { error: createGuard.error }
      );
      return NextResponse.json({ error: createGuard.error }, { status: createGuard.status });
    }

    const project = await db.project.create({
      data: { ...baseProjectFields, isTestProject: data.isTestProject ?? false },
    });
    let createdUnlinked: import("@/lib/project-rows").UnlinkedScopeType[] = [];
    if (unitsRows.length > 0) {
      try {
        const result = await insertProjectRows(db, project.id, unitsRows, 0);
        createdUnlinked = result.unlinkedScopeTypes;
      } catch (rowErr) {
        await db.project.delete({ where: { id: project.id } }).catch(() => {});
        throw rowErr;
      }
    }
    const api = await enrichProjectById(project.id);
    const shell = await getProjectByPid(data.unifierPid);
    const label = shell?.projectName?.trim() || data.unifierPid;
    const createdPayload = { ...api!, restored: false, unitsCount: unitsRows.length, unlinkedScopeTypes: createdUnlinked };

    logApi("POST", "/api/projects", 201, `Created project "${label}" (Unifier PID: ${data.unifierPid})${unitsRows.length > 0 ? ` with ${unitsRows.length} units` : ""}`, elapsed(), createdPayload);
    return NextResponse.json(createdPayload, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    const isDev = process.env.NODE_ENV !== "production" || isDevToolsAllowed();
    logApi("POST", "/api/projects", 500, `Database error: ${message}`, elapsed(), { error: message, stack: isDev ? stack : undefined });
    return NextResponse.json(
      { error: "Failed to create project", detail: isDev ? message : undefined },
      { status: 500 }
    );
  }
}
