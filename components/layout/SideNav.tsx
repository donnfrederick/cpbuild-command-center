"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { usePathname } from "@/i18n/navigation";
import {
  FolderKanban,
  Users,
  MessageSquare,
  Activity,
  Sun,
  Key,
  BookOpen,
  ClipboardList,
  Shield,
  Megaphone,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { ReportsNavSection } from "@/components/reports/ReportsNavSection";

interface SideNavProps {
  isAdmin?: boolean;
  canManageRoles?: boolean;
  canViewUsers?: boolean;
  canViewFeedback?: boolean;
  canViewDataDocs?: boolean;
  canManageForms?: boolean;
  canManageIssueReportConfig?: boolean;
}

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  exact: boolean;
};

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--neutral-400)",
  padding: "6px 16px 4px",
  display: "block",
};

export function SideNav({
  isAdmin = false,
  canManageRoles = false,
  canViewUsers = true,
  canViewFeedback = true,
  canViewDataDocs = false,
  canManageForms = false,
  canManageIssueReportConfig = false,
}: SideNavProps) {
  const t = useTranslations("nav");
  const tf = useTranslations("feedback");
  const ts = useTranslations("adminStatus");
  const tb = useTranslations("morningBriefing");
  const tk = useTranslations("apiKeys");
  const tr = useTranslations("roleManager");
  const ta = useTranslations("admin.announcements");
  const td = useTranslations("biDocs");
  const pathname = usePathname();

  const mainItemsBeforeReports: NavItem[] = [
    { id: "projects", label: t("projects"), icon: FolderKanban, href: "/projects", exact: false },
  ];

  const mainItemsAfterReports: NavItem[] = [
    ...(canViewUsers
      ? [{ id: "users", label: t("users"), icon: Users, href: "/users", exact: false }]
      : []),
  ];

  const projectSettingsItems: NavItem[] = [
    ...(canManageForms
      ? [{ id: "forms", label: t("forms"), icon: ClipboardList, href: "/forms", exact: false }]
      : []),
    ...(canManageIssueReportConfig
      ? [
          {
            id: "project-settings",
            label: t("projectSettings"),
            icon: SlidersHorizontal,
            href: "/project-settings",
            exact: false,
          },
        ]
      : []),
  ];

  const systemItems: NavItem[] = [
    ...(canViewFeedback
      ? [{ id: "feedback", label: tf("navLabel"), icon: MessageSquare, href: "/feedback", exact: false }]
      : []),
    ...(isAdmin
      ? [{ id: "announcements", label: ta("navLabel"), icon: Megaphone, href: "/admin/announcements", exact: false }]
      : []),
    ...(isAdmin
      ? [{ id: "status", label: ts("title"), icon: Activity, href: "/admin/status", exact: false }]
      : []),
    ...(isAdmin
      ? [{ id: "morning-briefing", label: tb("navLabel"), icon: Sun, href: "/admin/morning-briefing", exact: false }]
      : []),
    ...(canManageRoles
      ? [{ id: "roles", label: tr("navLabel"), icon: Shield, href: "/admin/roles", exact: false }]
      : []),
    ...(isAdmin
      ? [{ id: "api-keys", label: tk("navLabel"), icon: Key, href: "/admin/api-keys", exact: false }]
      : []),
    ...(canViewDataDocs
      ? [{ id: "bi-docs", label: td("navLabel"), icon: BookOpen, href: "/bi-docs", exact: false }]
      : []),
  ];

  function renderItem(item: NavItem) {
    const Icon = item.icon;
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

    return (
      <NavLink
        key={item.id}
        href={item.href as Parameters<typeof NavLink>[0]["href"]}
        aria-current={isActive ? "page" : undefined}
        data-tour={`nav-${item.id}`}
        className="flex items-center gap-3 transition-colors duration-150"
        style={{
          padding: "8px 16px",
          backgroundColor: isActive ? "var(--orange-50)" : "transparent",
          color: isActive ? "var(--orange-500)" : "var(--neutral-500)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 2,
          textDecoration: "none",
          display: "flex",
          boxShadow: isActive ? "inset -3px 0 0 var(--orange-500)" : "none",
          borderRadius: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = "var(--neutral-100)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Icon style={{ width: "var(--icon-size)", height: "var(--icon-size)", flexShrink: 0 }} />
        <span>{item.label}</span>
      </NavLink>
    );
  }

  return (
    <nav
      aria-label={t("mainNav")}
      className="flex-1"
      style={{ paddingTop: "var(--space-2)", paddingBottom: "var(--space-2)" }}
    >
      <span style={SECTION_LABEL_STYLE}>{t("sectionMain")}</span>
      {mainItemsBeforeReports.map(renderItem)}

      <ReportsNavSection />

      {mainItemsAfterReports.map(renderItem)}

      {projectSettingsItems.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--neutral-200)", margin: "8px 0" }} />
          <span style={SECTION_LABEL_STYLE}>{t("sectionProjectSettings")}</span>
          {projectSettingsItems.map(renderItem)}
        </>
      )}

      {systemItems.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--neutral-200)", margin: "8px 0" }} />
          <span style={SECTION_LABEL_STYLE}>{t("sectionSystem")}</span>
          {systemItems.map(renderItem)}
        </>
      )}
    </nav>
  );
}
