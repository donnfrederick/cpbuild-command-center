"use client";

import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { usePathname } from "@/i18n/navigation";
import { House, MapPin, ShieldCheck, AlertTriangle, Images } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  projectId: string;
  canViewUnits?: boolean;
  /** Kept for backwards-compat — dev tools now live in the profile menu only. */
  canUseDevTools?: boolean;
}

interface NavItem {
  key: string;
  label: string;
  href: `/projects/${string}` | `/projects/${string}/units` | `/projects/${string}/log/inspections` | `/projects/${string}/field-reports` | `/projects/${string}/media`;
  icon: LucideIcon;
  hidden?: boolean;
  isActive: (pathname: string, href: string) => boolean;
}

function isFieldReportsPath(pathname: string, projectId: string): boolean {
  return (
    pathname === `/projects/${projectId}/field-reports` ||
    pathname.startsWith(`/projects/${projectId}/field-reports/`) ||
    pathname.startsWith(`/projects/${projectId}/log/issues`) ||
    pathname.startsWith(`/projects/${projectId}/log/observations`)
  );
}

export function ProjectMobileBottomNav({
  projectId,
  canViewUnits = true,
}: Props) {
  const t = useTranslations("projects");
  const pathname = usePathname();

  const navItems = [
    {
      key: "overview",
      label: t("tabOverview"),
      href: `/projects/${projectId}` as `/projects/${string}`,
      icon: House,
      isActive: (path: string, href: string) => path === href,
    },
    {
      key: "media",
      label: t("tabMediaShort"),
      href: `/projects/${projectId}/media` as `/projects/${string}/media`,
      icon: Images,
      isActive: (path: string, href: string) => path === href || path.startsWith(`${href}/`),
    },
    {
      key: "units",
      label: t("tabUnits"),
      href: `/projects/${projectId}/units` as `/projects/${string}/units`,
      icon: MapPin,
      hidden: !canViewUnits,
      isActive: (path: string, href: string) =>
        path === href || (path.startsWith(`${href}/`) && !path.includes("/media")),
    },
    {
      key: "field-reports",
      label: t("tabFieldReportsShort"),
      href: `/projects/${projectId}/field-reports` as `/projects/${string}/field-reports`,
      icon: AlertTriangle,
      isActive: (path: string) => isFieldReportsPath(path, projectId),
    },
    {
      key: "inspections",
      label: t("tabInspectionsShort"),
      href: `/projects/${projectId}/log/inspections` as `/projects/${string}/log/inspections`,
      icon: ShieldCheck,
      isActive: (path: string, href: string) => path === href || path.startsWith(`${href}/`),
    },
  ].filter((item) => !item.hidden) as NavItem[];

  return (
    <nav
      id="project-mobile-bottom-nav"
      aria-label={t("projectNavAria")}
      style={{
        display: "none",
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 80,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "transparent",
        padding: 0,
        flexShrink: 0,
        width: "auto",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          backgroundColor: "var(--color-surface-dark)",
          borderRadius: "var(--radius-pill)",
          padding: "6px 3px",
          boxShadow: "0 8px 32px rgba(16,18,43,0.22)",
          pointerEvents: "auto",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname, item.href);

          return (
            <NavLink
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                textDecoration: "none",
                padding: "6px 4px",
                borderRadius: 99,
                backgroundColor: active ? "var(--color-accent)" : "transparent",
                color: active ? "var(--color-text-inverse)" : "rgba(255,255,255,0.35)",
                transition: "background-color 150ms",
                minWidth: 0,
              }}
            >
              <Icon size={18} aria-hidden style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: "0.02em",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
