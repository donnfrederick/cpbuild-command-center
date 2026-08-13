import { Metadata } from "next";
import type { Project } from "@/lib/projects";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { PERMISSIONS, hasPermission, getProjectNavAccess } from "@/lib/permissions";
import { enrichProjectById, getProjectDisplayNameForMetadata } from "@/lib/project-unifier-merge";
import { ProjectDetailView } from "@/components/projects/ProjectDetailView";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT } from "@/lib/tour-demo-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === TOUR_DEMO_PROJECT_ID) {
    return { title: `${TOUR_DEMO_PROJECT.projectName} — Location Builder — CP Build` };
  }
  const name = await getProjectDisplayNameForMetadata(id);
  return {
    title: name ? `${name} — Location Builder — CP Build` : "Location Builder — CP Build",
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return null;

  const { id } = await params;

  const projectRow = await db.project.findUnique({
    where: { id, deletedAt: null },
  });

  if (!projectRow) notFound();

  // Only roles with VIEW_UPM may access the Field Tracker.
  // notFound() is used (not null) so that direct URL navigation by unauthorized roles
  // returns a proper 404 rather than silently rendering a blank page.
  const navAccess = getProjectNavAccess(effective.user.role);
  if (!navAccess.canViewUPM) notFound();

  // Only EDIT_UPM grants full write access including the destructive "overwrite" mode.
  const canManage = hasPermission(effective.user.role, PERMISSIONS.EDIT_UPM, []);
  // Roles with VIEW_UPM + MANAGE_PROJECTS (e.g. INSTALL_MANAGER) can add/edit/delete
  // rows and upload in add/merge modes, but NOT overwrite.
  const canAddAndEdit =
    canManage || hasPermission(effective.user.role, PERMISSIONS.MANAGE_PROJECTS, []);

  const projectData: Project | null = await enrichProjectById(id);
  if (!projectData) notFound();

  const unifierBaseUrl = process.env.UNIFIER_BASE_URL ?? null;

  return (
    <ProjectDetailView
      project={projectData}
      canManage={canManage}
      canAddAndEdit={canAddAndEdit}
      unifierBaseUrl={unifierBaseUrl}
      currentUserId={effective.user.id}
      currentUserRole={effective.user.role ?? undefined}
    />
  );
}
