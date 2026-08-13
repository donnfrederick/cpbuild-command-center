"use client";

import { NavLink } from "@/components/navigation/nav-link";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { House, MapPin, Wrench, Eye, AlertTriangle, ShieldCheck, Activity, Images } from "lucide-react";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  exact: boolean;
  hidden?: boolean;
}

interface ProjectSideNavProps {
  projectId: string;
  canViewUPM: boolean;
  canViewUnits?: boolean;
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "#C4C7D4",
  padding: "6px 16px 4px",
  display: "block",
};

export function ProjectSideNav({
  projectId,
  canViewUPM,
  canViewUnits = true,
}: ProjectSideNavProps) {
  const t = useTranslations("projects");
  const pathname = usePathname();

  const mainItems: NavItem[] = [
    {
      key: "overview",
      label: t("tabOverview"),
      href: `/projects/${projectId}`,
      icon: House,
      exact: true,
    },
    {
      key: "units",
      label: t("tabUnits"),
      href: `/projects/${projectId}/units`,
      icon: MapPin,
      exact: false,
      hidden: !canViewUnits,
    },
    {
      key: "media",
      label: t("tabMediaShort"),
      href: `/projects/${projectId}/media`,
      icon: Images,
      exact: false,
      hidden: !canViewUnits,
    },
    {
      key: "upm",
      label: t("tabUPM"),
      href: `/projects/${projectId}/upm`,
      icon: Wrench,
      exact: false,
      hidden: !canViewUPM,
    },
  ].filter((item) => !item.hidden);

  const logItems: NavItem[] = [
    {
      key: "log-observations",
      label: t("fieldReports.tabObservations"),
      href: `/projects/${projectId}/field-reports/observations`,
      icon: Eye,
      exact: false,
    },
    {
      key: "log-issues",
      label: t("fieldReports.tabIssues"),
      href: `/projects/${projectId}/field-reports`,
      icon: AlertTriangle,
      exact: false,
    },
    {
      key: "log-inspections",
      label: "Inspections",
      href: `/projects/${projectId}/log/inspections`,
      icon: ShieldCheck,
      exact: false,
    },
    {
      key: "log-activity",
      label: "Activity",
      href: `/projects/${projectId}/log/activity`,
      icon: Activity,
      exact: false,
    },
  ];

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);

    return (
      <NavLink
        key={item.key}
        href={item.href as Parameters<typeof NavLink>[0]["href"]}
        aria-current={isActive ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "8px 16px",
          backgroundColor: isActive ? "#FFF4ED" : "transparent",
          color: isActive ? "#F55F00" : "#737891",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 2,
          textDecoration: "none",
          transition: "background-color 0.15s, color 0.15s",
          boxShadow: isActive ? "inset -3px 0 0 #F55F00" : "none",
          borderRadius: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive)
            e.currentTarget.style.backgroundColor = "#F0F1F5";
        }}
        onMouseLeave={(e) => {
          if (!isActive)
            e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <Icon
          style={{ width: "var(--icon-size)", height: "var(--icon-size)", flexShrink: 0 }}
          aria-hidden
        />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <nav
      style={{ flex: 1, overflowY: "auto", paddingTop: "var(--space-2)" }}
      aria-label={t("projectNavAria")}
    >
      {mainItems.map(renderItem)}

      <div style={{ height: 1, background: "var(--neutral-200)", margin: "8px 0" }} />
      <span style={SECTION_LABEL_STYLE}>Reports</span>
      {logItems.map(renderItem)}
    </nav>
  );
}
