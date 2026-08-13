import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import type { MasqueradeContext } from "@/lib/masquerade";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { isStrictProductionDeployment } from "@/lib/production-deployment";

export type ProjectAccessRow = {
  id: string;
  deletedAt: Date | null;
  isTestProject: boolean;
};

export async function getProjectAccessRow(projectId: string): Promise<ProjectAccessRow | null> {
  return db.project.findFirst({
    where: { id: projectId },
    select: { id: true, deletedAt: true, isTestProject: true },
  });
}

export function normalizeRoleCode(roleCode: string): string {
  return roleCode === "SUPER_ADMIN" ? "ADMIN" : roleCode;
}

/**
 * Roles that may see test projects in any environment and edit them in
 * strict production. Visibility is not gated behind isStrictProductionDeployment()
 * — test projects are hidden from non-squad roles everywhere (local, dev, prod)
 * so that real operational roles always get an accurate view of the project list.
 */
export function isTestProjectSquadRole(roleCode: string): boolean {
  const n = normalizeRoleCode(roleCode);
  return n === "ADMIN" || n === "DEVELOPER" || n === "DESIGNER";
}

export function isDesignerOrDeveloperRole(roleCode: string): boolean {
  const n = normalizeRoleCode(roleCode);
  return n === "DESIGNER" || n === "DEVELOPER";
}

export function masqueradeTargetCanEditProductionProjectData(targetRole: string): boolean {
  if (isDesignerOrDeveloperRole(targetRole)) return false;
  return (
    hasPermission(targetRole, PERMISSIONS.MANAGE_PROJECTS) ||
    hasPermission(targetRole, PERMISSIONS.EDIT_UPM) ||
    hasPermission(targetRole, PERMISSIONS.MANAGE_UNIT_STATUS)
  );
}

export type AccessDenied = {
  allowed: false;
  status: number;
  error: string;
};

export type AccessOk = { allowed: true };

/**
 * Determines whether a project row is visible to a given role.
 *
 * Test-project visibility is intentionally environment-agnostic: non-squad
 * roles (anyone other than ADMIN / DEVELOPER / DESIGNER) cannot see test
 * projects regardless of whether the app is running locally, on dev Railway,
 * or on the production Railway service. This ensures operational roles always
 * get an accurate project list and never stumble on sandbox data.
 *
 * Mutation restrictions (edits to live project data) are separately gated
 * behind isStrictProductionDeployment() in checkProductionProjectMutationAllowed.
 */
export function checkProjectVisibleInApi(
  project: Pick<ProjectAccessRow, "deletedAt" | "isTestProject">,
  viewerRealRole: string
): AccessDenied | AccessOk {
  if (project.deletedAt) {
    return { allowed: false, status: 404, error: "Not found" };
  }
  if (project.isTestProject && !isTestProjectSquadRole(viewerRealRole)) {
    return { allowed: false, status: 404, error: "Not found" };
  }
  return { allowed: true };
}

export function checkProductionProjectMutationAllowed(
  project: Pick<ProjectAccessRow, "isTestProject">,
  realUserRole: string,
  masquerade: MasqueradeContext | null
): AccessDenied | AccessOk {
  if (!isStrictProductionDeployment()) {
    return { allowed: true };
  }

  if (project.isTestProject) {
    if (!isTestProjectSquadRole(realUserRole)) {
      return { allowed: false, status: 404, error: "Not found" };
    }
    return { allowed: true };
  }

  if (isDesignerOrDeveloperRole(realUserRole)) {
    return {
      allowed: false,
      status: 403,
      error:
        "Designer and Developer accounts cannot modify production project data. Use the staging environment or a designated test project.",
    };
  }

  const n = normalizeRoleCode(realUserRole);
  if (n === "ADMIN") {
    // Admin can directly edit production project data without masquerade.
    // When masquerading, keep the Designer/Developer guard — those roles are
    // intentionally blocked from production writes (use a staging environment).
    if (masquerade && isDesignerOrDeveloperRole(masquerade.targetUserRole)) {
      return {
        allowed: false,
        status: 403,
        error: "Production project data cannot be changed while masquerading as Designer or Developer.",
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Field notes (observations, issues, and their comments/resolve flows) on real
 * production projects. ADMIN may mutate without masquerade so support and QA
 * can use live Unifier projects (e.g. Unifier "test" jobs) without impersonation.
 * Designer/Developer remain blocked on non-test projects; UPM/unit/status routes
 * still use checkProductionProjectMutationAllowed().
 */
export function checkProductionFieldNotesMutationAllowed(
  project: Pick<ProjectAccessRow, "isTestProject">,
  realUserRole: string,
  masquerade: MasqueradeContext | null,
): AccessDenied | AccessOk {
  if (!isStrictProductionDeployment()) {
    return { allowed: true };
  }

  if (project.isTestProject) {
    if (!isTestProjectSquadRole(realUserRole)) {
      return { allowed: false, status: 404, error: "Not found" };
    }
    return { allowed: true };
  }

  if (isDesignerOrDeveloperRole(realUserRole)) {
    return {
      allowed: false,
      status: 403,
      error:
        "Designer and Developer accounts cannot modify production project data. Use the staging environment or a designated test project.",
    };
  }

  const n = normalizeRoleCode(realUserRole);
  if (n === "ADMIN" && masquerade && isDesignerOrDeveloperRole(masquerade.targetUserRole)) {
    return {
      allowed: false,
      status: 403,
      error: "Production project data cannot be changed while masquerading as Designer or Developer.",
    };
  }

  return { allowed: true };
}

export async function enforceProductionFieldNotesMutation(
  projectId: string,
  session: { user: { role: string } },
  masqueradeOverride?: MasqueradeContext | null,
): Promise<NextResponse | null> {
  const row = await getProjectAccessRow(projectId);
  if (!row || row.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const vis = checkProjectVisibleInApi(row, session.user.role);
  if (!vis.allowed) {
    return NextResponse.json({ error: vis.error }, { status: vis.status });
  }
  const masquerade =
    masqueradeOverride !== undefined
      ? masqueradeOverride
      : ((await getEffectiveSession())?.masquerade ?? null);
  const m = checkProductionFieldNotesMutationAllowed(
    row,
    session.user.role,
    masquerade,
  );
  if (!m.allowed) {
    return NextResponse.json({ error: m.error }, { status: m.status });
  }
  return null;
}

export function checkProductionProjectCreateAllowed(
  realUserRole: string,
  bodyIsTestProject: boolean | undefined
): AccessDenied | AccessOk {
  if (!isStrictProductionDeployment()) {
    return { allowed: true };
  }
  const isTest = bodyIsTestProject === true;
  if (isDesignerOrDeveloperRole(realUserRole)) {
    if (!isTest) {
      return {
        allowed: false,
        status: 403,
        error: "Designer and Developer accounts may only create test projects in production.",
      };
    }
    return { allowed: true };
  }
  if (isTest && !isTestProjectSquadRole(realUserRole)) {
    return {
      allowed: false,
      status: 403,
      error: "Only Admin, Developer, or Designer may create test projects.",
    };
  }
  return { allowed: true };
}

export function checkProductionTestProjectFlagPatchAllowed(
  realUserRole: string,
  wantsToChangeTestFlag: boolean
): AccessDenied | AccessOk {
  if (!wantsToChangeTestFlag) return { allowed: true };
  if (!isStrictProductionDeployment()) return { allowed: true };
  if (!isTestProjectSquadRole(realUserRole)) {
    return {
      allowed: false,
      status: 403,
      error: "Only Admin, Developer, or Designer may change the test project flag.",
    };
  }
  return { allowed: true };
}

export async function filterProjectIdsHiddenFromRole(
  projectIds: string[],
  viewerRealRole: string
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  if (isTestProjectSquadRole(viewerRealRole)) return projectIds;
  const testRows = await db.project.findMany({
    where: { id: { in: projectIds }, isTestProject: true },
    select: { id: true },
  });
  const testSet = new Set(testRows.map((r) => r.id));
  return projectIds.filter((id) => !testSet.has(id));
}

/**
 * Guard for read routes. Returns a 404 response when the project doesn't exist,
 * has been soft-deleted, or should be hidden from the viewer.
 *
 * Always resolves the effective session internally so that role-preview is
 * respected: an admin previewing as INSTALL_MANAGER will be blocked from
 * test projects the same way a real INSTALL_MANAGER would be.
 *
 * Rule: read-visibility uses the effective role; write-auth uses the real
 * JWT role. Callers handle auth with `session`; this function owns visibility.
 */
export async function enforceProjectReadVisibility(
  projectId: string,
  session: { user: { role: string } }
): Promise<NextResponse | null> {
  const row = await getProjectAccessRow(projectId);
  if (!row || row.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const effective = await getEffectiveSession();
  const viewerRole = effective?.user.role ?? session.user.role;
  const vis = checkProjectVisibleInApi(row, viewerRole);
  if (!vis.allowed) {
    return NextResponse.json({ error: vis.error }, { status: vis.status });
  }
  return null;
}

export async function enforceProductionProjectMutation(
  projectId: string,
  session: { user: { role: string } }
): Promise<NextResponse | null> {
  const row = await getProjectAccessRow(projectId);
  if (!row || row.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const vis = checkProjectVisibleInApi(row, session.user.role);
  if (!vis.allowed) {
    return NextResponse.json({ error: vis.error }, { status: vis.status });
  }
  const effective = await getEffectiveSession();
  const m = checkProductionProjectMutationAllowed(row, session.user.role, effective?.masquerade ?? null);
  if (!m.allowed) {
    return NextResponse.json({ error: m.error }, { status: m.status });
  }
  return null;
}
