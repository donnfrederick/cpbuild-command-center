import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { SideNav } from "@/components/layout/SideNav";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileBottomNavSpacer } from "@/components/layout/MobileBottomNavSpacer";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";
import { TopBar } from "@/components/layout/TopBar";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MasqueradeBanner } from "@/components/shared/MasqueradeBanner";
import { RolePreviewBanner } from "@/components/shared/RolePreviewBanner";
import { canManageForms, canManageIssueReportConfig, formatRole, getGlobalNavAccess, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getEffectiveSession } from "@/lib/masquerade";
import { DevToolsPanelWrapper } from "@/components/devtools/DevToolsPanelWrapper";
import { SiteTourLauncher } from "@/components/tour/SiteTourLauncher";
import { TourPickerWrapper } from "@/components/tour/TourPickerWrapper";
import { AnnouncementHost } from "@/components/announcements/AnnouncementHost";
import { AppShellMain } from "@/components/navigation/app-shell-main";
import { TOUR_USER_UI_ENABLED } from "@/lib/tour-user-ui";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const effective = await getEffectiveSession();

  if (!effective?.user) redirect(`/${locale}/login`);
  const session = effective;

  const { name, email, role, specialPermissions } = session.user;
  // When role preview is active, session.user.role is already the preview role.
  // realRole is the original role before the preview (used by AccountMenu / RolePreviewPicker).
  const realRole = session.rolePreview?.realRole ?? role;
  const canPreviewRole = hasPermission(realRole, PERMISSIONS.PREVIEW_ROLE);
  const t = await getTranslations("app");
  const { canViewUsers } = getGlobalNavAccess(role, specialPermissions);
  // BI_ANALYST is a read-only reporting role — Feedback is an internal team tool they don't need.
  const canViewFeedback = role !== "BI_ANALYST";
  // Data Docs page is shown to BI_ANALYST and ADMIN (anyone who works with the data).
  const canViewDataDocs = role === "BI_ANALYST" || role === "ADMIN";
  const userCanManageForms = canManageForms(role, specialPermissions);
  const userCanManageIssueReportConfig = canManageIssueReportConfig(role, specialPermissions);
  const canManageRoles = hasPermission(role, PERMISSIONS.MANAGE_ROLES, specialPermissions);
  return (
    <div
      id="viewport-root"
      className="flex overflow-hidden"
      style={{ height: "100dvh", backgroundColor: "var(--neutral-100)" }}
    >
      <aside
        className="flex flex-col flex-shrink-0"
        style={{
          width: "var(--nav-width)",
          backgroundColor: "var(--neutral-0)",
          borderRight: "1px solid var(--neutral-200)",
          height: "100%",
        }}
        aria-label="Sidebar"
      >
        <div
          className="flex items-center"
          style={{
            padding: "0 var(--space-4)",
            height: "var(--top-bar-height)",
            flexShrink: 0,
          }}
        >
          <div style={{ lineHeight: 1.15 }}>
            <span
              style={{
                display: "block",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#9CA0B3",
              }}
            >
              CP Build
            </span>
            <span
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                color: "#10122B",
                whiteSpace: "nowrap",
              }}
            >
              Field Tracker
            </span>
          </div>
        </div>

        <SideNav
          isAdmin={role === "ADMIN"}
          canManageRoles={canManageRoles}
          canViewUsers={canViewUsers}
          canViewFeedback={canViewFeedback}
          canViewDataDocs={canViewDataDocs}
          canManageForms={userCanManageForms}
          canManageIssueReportConfig={userCanManageIssueReportConfig}
        />

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
        <TopBar name={name ?? email ?? "User"} role={formatRole(role)} locale={locale} canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)} />
        {session.masquerade && <MasqueradeBanner masquerade={session.masquerade} />}
        {!session.masquerade && session.rolePreview && (
          <RolePreviewBanner rolePreview={session.rolePreview} />
        )}
        <main id="main-content" className="flex flex-col flex-1 overflow-auto relative min-h-0" tabIndex={-1}>
          <AppShellMain>{children}</AppShellMain>
        </main>
        <OfflineIndicator />
        <MobileBottomNavSpacer />
        <MobileBottomNav
          canViewUsers={canViewUsers}
          canViewFeedback={canViewFeedback}
          canManageForms={userCanManageForms}
        />
      </div>
      <DevToolsPanelWrapper
        canUseDevTools={hasPermission(role, PERMISSIONS.ACCESS_DEVTOOLS)}
        appEnv={process.env.APP_ENV}
      />
      {TOUR_USER_UI_ENABLED ? (
        <>
      {/* Launches the site tour automatically on a user's first visit.
          Runs silently (no UI) — checks localStorage and primes TourPlayer. */}
      <SiteTourLauncher />
      {/* Tour picker — opened by the graduation cap button in TopBar via tour-picker:open event */}
      <TourPickerWrapper
        userRole={role}
        isAdmin={role === "ADMIN"}
      />
        </>
      ) : null}
      <AnnouncementHost />
    </div>
  );
}
