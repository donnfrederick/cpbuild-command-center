"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TAB_LOG_HREF = "/reports/activity" as const;
const TAB_BY_USER_HREF = "/reports/activity/by-user" as const;
const TAB_BY_PROJECT_HREF = "/reports/activity/by-project" as const;

export function ActivityReportTabs() {
  const t = useTranslations("dashboardActivity");
  const pathname = usePathname();

  const tabs = [
    {
      id: "log" as const,
      href: TAB_LOG_HREF,
      label: t("tabLog"),
      active: pathname === TAB_LOG_HREF,
    },
    {
      id: "byUser" as const,
      href: TAB_BY_USER_HREF,
      label: t("tabByUser"),
      active: pathname === TAB_BY_USER_HREF || pathname.startsWith(`${TAB_BY_USER_HREF}/`),
    },
    {
      id: "byProject" as const,
      href: TAB_BY_PROJECT_HREF,
      label: t("tabByProject"),
      active: pathname === TAB_BY_PROJECT_HREF || pathname.startsWith(`${TAB_BY_PROJECT_HREF}/`),
    },
  ];

  return (
    <nav
      aria-label={t("reportTabsAria")}
      style={{
        padding: "0 var(--page-padding-x, 12px)",
        borderBottom: "1px solid var(--neutral-200)",
        backgroundColor: "var(--neutral-0)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 12px",
              fontSize: "var(--text-caption, 12px)",
              fontWeight: tab.active ? 600 : 500,
              color: tab.active ? "var(--primary-600)" : "var(--neutral-500)",
              textDecoration: "none",
              borderBottom: tab.active
                ? "2px solid var(--primary-600)"
                : "2px solid transparent",
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
