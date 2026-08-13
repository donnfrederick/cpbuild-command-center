import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { ProjectsPageClient } from "@/components/projects/ProjectsPageClient";
import type { Project } from "@/lib/projects";
import { enrichProjectListResilient } from "@/lib/project-unifier-merge";
import { enrichProjectsWithFavorites, favoriteOwnerFromEffectiveSession } from "@/lib/project-favorites";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { isTestProjectSquadRole, normalizeRoleCode } from "@/lib/production-project-access";

/**
 * Load projects for the SSR initial render.
 * `squad` determines whether test projects are included — pass the effective
 * role so role-preview is respected (an ADMIN previewing as INSTALL_MANAGER
 * should see the same list as a real INSTALL_MANAGER).
 */
async function loadProjects(
  squad: boolean,
  dbUserId: string | null
): Promise<{
  projects: Project[];
  unifierAvailable: boolean;
}> {
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

  // Build a map of projectId → sorted unique scope type names
  const scopeMap = new Map<string, Set<string>>();
  for (const r of scopeRows) {
    if (!r.scopeType) continue;
    if (!scopeMap.has(r.projectId)) scopeMap.set(r.projectId, new Set());
    scopeMap.get(r.projectId)!.add(r.scopeType.name);
  }

  const { projects, unifierAvailable } = await enrichProjectListResilient(
    rows.map((r) => Object.assign(r, { scopeTypes: [...(scopeMap.get(r.id) ?? [])].sort() }))
  );

  const projectsWithFavorites = await enrichProjectsWithFavorites(projects, dbUserId);

  return { projects: projectsWithFavorites, unifierAvailable };
}

export async function generateMetadata() {
  const t = await getTranslations("projects");
  return { title: `${t("title")} \u2014 CP Build` };
}

export default async function ProjectsPage() {
  const t = await getTranslations("projects");
  const effective = await getEffectiveSession();
  if (!effective?.user) return null;

  const squad = isTestProjectSquadRole(effective.user.role);
  const dbUserId = await resolveSessionToDbUserId(favoriteOwnerFromEffectiveSession(effective));
  const { projects, unifierAvailable } = await loadProjects(squad, dbUserId);
  const canCreate = hasPermission(effective.user.role, PERMISSIONS.MANAGE_PROJECTS)
    || hasPermission(effective.user.role, PERMISSIONS.CREATE_PROJECT);
  const canDelete = hasPermission(effective.user.role, PERMISSIONS.MANAGE_PROJECTS);
  const canDeleteTestProjects = normalizeRoleCode(effective.user.role) === "ADMIN";
  const canViewUPM = hasPermission(effective.user.role, PERMISSIONS.VIEW_UPM);
  const canEditUpm = hasPermission(effective.user.role, PERMISSIONS.EDIT_UPM);

  return (
    <ProjectsPageClient
      initialProjects={projects}
      unifierUnavailable={!unifierAvailable}
      canCreate={canCreate}
      canDelete={canDelete}
      canDeleteTestProjects={canDeleteTestProjects}
      canViewUPM={canViewUPM}
      canEditUpm={canEditUpm}
      title={t("title")}
      subtitle={t("allActiveHistorical")}
      addLabel={t("addProject")}
    />
  );
}
