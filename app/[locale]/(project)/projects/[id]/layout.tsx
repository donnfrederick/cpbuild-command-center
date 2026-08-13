import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { formatRole, getProjectNavAccess, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_PROJECT } from "@/lib/tour-demo-data";
import { ProjectSideNav } from "@/components/projects/ProjectSideNav";
import { ProjectMobileBottomNav } from "@/components/projects/ProjectMobileBottomNav";
import { MobileBottomNavSpacer } from "@/components/layout/MobileBottomNavSpacer";
import { ProjectTopBar } from "@/components/projects/ProjectTopBar";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MasqueradeBanner } from "@/components/shared/MasqueradeBanner";
import { RolePreviewBanner } from "@/components/shared/RolePreviewBanner";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";
import { EagerSyncActivator } from "@/components/projects/EagerSyncActivator";
import { DevToolsPanelWrapper } from "@/components/devtools/DevToolsPanelWrapper";
import { AppShellMain } from "@/components/navigation/app-shell-main";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const locale = await getLocale();
  const effective = await getEffectiveSession();

  if (!effective?.user) {
    redirect(`/${locale}/login`);
  }
  const session = effective;

  const { id } = await params;

  const project =
    id === TOUR_DEMO_PROJECT_ID
      ? { id: TOUR_DEMO_PROJECT.id, projectName: TOUR_DEMO_PROJECT.projectName, status: TOUR_DEMO_PROJECT.status }
      : await (async () => {
          const p = await enrichProjectById(id);
          return p ? { id: p.id, projectName: p.projectName, status: p.status } : null;
        })();

  if (!project) notFound();

  const { name, email, role } = session.user;
  const realRole = session.rolePreview?.realRole ?? role;
  const canPreviewRole = hasPermission(realRole, PERMISSIONS.PREVIEW_ROLE);
  const navAccess = getProjectNavAccess(role);

  return (
    <div
      id="viewport-root"
      className="flex flex-col overflow-hidden"
      style={{ height: "100dvh", backgroundColor: "var(--neutral-100)" }}
    >
      {session.masquerade && <MasqueradeBanner masquerade={session.masquerade} />}
      {!session.masquerade && session.rolePreview && (
        <RolePreviewBanner rolePreview={session.rolePreview} />
      )}
      {/* Colored context bar */}
      <ProjectTopBar
        projectName={project.projectName}
        name={name ?? email ?? "User"}
        role={formatRole(role)}
        locale={locale}
        canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)}
      />
      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Project sidebar — hidden on mobile via globals.css #project-side-nav rule */}
        <aside
          id="project-side-nav"
          className="flex flex-col flex-shrink-0"
          style={{
            width: "var(--nav-width)",
            backgroundColor: "var(--neutral-0)",
            borderRight: "1px solid var(--neutral-200)",
          }}
        >
          <ProjectSideNav
            projectId={project.id}
            canViewUPM={navAccess.canViewUPM}
            canViewUnits={navAccess.canViewUnits}
          />

          {/* Account menu — pinned to bottom of sidebar, matches dashboard layout */}
          <div
            className="desktop-only flex-shrink-0"
            style={{
              padding: "var(--space-2)",
              borderTop: "1px solid var(--neutral-200)",
            }}
          >
            <AccountMenu
              name={name ?? email ?? "User"}
              role={formatRole(role)}
              locale={locale}
              canPreviewRole={canPreviewRole}
              realRole={realRole}
              activePreviewRole={session.rolePreview?.previewRole ?? null}
              canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)}
            />
          </div>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <main
            id="main-content"
            className="flex flex-col flex-1 overflow-hidden min-w-0 min-h-0"
            tabIndex={-1}
          >
            <AppShellMain>{children}</AppShellMain>
          </main>
          <OfflineIndicator />
          <MobileBottomNavSpacer />
          <ProjectMobileBottomNav
            projectId={project.id}
            canViewUnits={navAccess.canViewUnits}
            canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)}
          />
        </div>
      </div>
      <EagerSyncActivator projectId={project.id} />
      <DevToolsPanelWrapper
        canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)}
        appEnv={process.env.APP_ENV}
      />
    </div>
  );
}
