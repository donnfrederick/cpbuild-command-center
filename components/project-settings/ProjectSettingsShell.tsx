"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { ProjectSettingsTab } from "@/lib/project-settings/tabs";

interface ProjectSettingsShellProps {
  children: ReactNode;
  tabs: ProjectSettingsTab[];
}

function tabIsActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProjectSettingsShell({ children, tabs }: ProjectSettingsShellProps) {
  const t = useTranslations("projectSettings");
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--color-surface)",
      }}
    >
      <header
        style={{
          padding: "12px var(--page-padding-x, 12px)",
          borderBottom: "1px solid var(--color-divider)",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "var(--tracking-tight)",
            color: "var(--color-text-primary)",
            lineHeight: 1.2,
          }}
        >
          {t("pageTitle")}
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            lineHeight: 1.45,
          }}
        >
          {t("pageSubtitle")}
        </p>
      </header>

      <div
        className="project-settings-body"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
        }}
      >
        <nav
          aria-label={t("tabsAria")}
          className="project-settings-tabs"
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--color-divider)",
            backgroundColor: "var(--color-surface)",
            padding: "8px var(--page-padding-x, 12px)",
            display: "flex",
            gap: 6,
            overflowX: "auto",
          }}
        >
          {tabs.map((tab) => {
            const active = tabIsActive(pathname, tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                style={{
                  flexShrink: 0,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: `1px solid ${active ? "var(--primary-500)" : "var(--neutral-200)"}`,
                  backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                  color: active ? "var(--primary-700)" : "var(--neutral-600)",
                }}
              >
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "10px var(--page-padding-x, 12px)",
          }}
        >
          {children}
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .project-settings-body {
            flex-direction: row !important;
          }
          .project-settings-tabs {
            flex-direction: column !important;
            width: 168px;
            border-bottom: none !important;
            border-right: 1px solid var(--color-divider);
            padding: 10px 8px !important;
            overflow-x: visible !important;
            gap: 4px !important;
          }
          .project-settings-tabs a {
            width: 100%;
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
}
