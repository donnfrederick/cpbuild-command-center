"use client";

import { useLocale, useTranslations } from "next-intl";
import { House } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectTopBar } from "@/components/projects/ProjectTopBar";
import { ProjectOverviewSkeleton } from "@/components/projects/ProjectOverviewSkeleton";
import {
  isProjectWorkspacePath,
  useOptionalNavigationPending,
} from "@/components/navigation/navigation-pending-provider";
import { usePathname } from "@/i18n/navigation";

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--neutral-400)",
  padding: "6px 16px 4px",
  display: "block",
};

function TransitionSideNavSkeleton() {
  const t = useTranslations("projects");

  return (
    <nav
      style={{ flex: 1, overflowY: "auto", paddingTop: "var(--space-2)" }}
      aria-hidden
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "8px 16px",
          backgroundColor: "var(--primary-50)",
          color: "var(--primary-600)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 2,
          boxShadow: "inset -3px 0 0 var(--primary-600)",
        }}
      >
        <House style={{ width: "var(--icon-size)", height: "var(--icon-size)", flexShrink: 0 }} aria-hidden />
        <span>{t("tabOverview")}</span>
      </div>
      {[88, 72, 64].map((width) => (
        <div key={width} style={{ padding: "8px 16px", marginBottom: 2 }}>
          <Skeleton style={{ width, height: 13, borderRadius: "var(--radius-sm)" }} />
        </div>
      ))}
      <div style={{ height: 1, background: "var(--neutral-200)", margin: "8px 0" }} />
      <span style={SECTION_LABEL_STYLE}>{t("tabLog")}</span>
      {[92, 76, 84, 68].map((width) => (
        <div key={width} style={{ padding: "8px 16px", marginBottom: 2 }}>
          <Skeleton style={{ width, height: 13, borderRadius: "var(--radius-sm)" }} />
        </div>
      ))}
    </nav>
  );
}

function TransitionMobileBottomNavSkeleton() {
  return (
    <div
      aria-hidden
      className="mobile-only"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        height: "calc(var(--mobile-bottom-nav-height, 56px) + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
        backgroundColor: "var(--neutral-0)",
        borderTop: "1px solid var(--neutral-200)",
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} style={{ width: 28, height: 28, borderRadius: "var(--radius-md)" }} />
      ))}
    </div>
  );
}

export function ProjectNavigationTransition() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("projects");
  const navigationPending = useOptionalNavigationPending();
  const pendingProject = navigationPending?.pendingProject ?? null;

  const showOverlay =
    pendingProject !== null && !isProjectWorkspacePath(pathname, pendingProject.id);

  if (!showOverlay || !pendingProject) {
    return null;
  }

  return (
    <div
      id="project-navigation-transition"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--neutral-100)",
      }}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">{t("hubOverviewLoading")}</span>
      <ProjectTopBar projectName={pendingProject.projectName} locale={locale} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <aside
          id="project-side-nav-transition"
          className="flex flex-col flex-shrink-0 desktop-only"
          style={{
            width: "var(--nav-width)",
            backgroundColor: "var(--neutral-0)",
            borderRight: "1px solid var(--neutral-200)",
          }}
        >
          <TransitionSideNavSkeleton />
        </aside>
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <main
            id="main-content-transition"
            className="flex flex-col flex-1 overflow-hidden min-w-0 min-h-0"
            tabIndex={-1}
          >
            <ProjectOverviewSkeleton />
          </main>
        </div>
      </div>
      <TransitionMobileBottomNavSkeleton />
    </div>
  );
}
