"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TAB_LOG_HREF = "/reports/inspections" as const;
const TAB_PASS_FAIL_HREF = "/reports/inspections/pass-fail" as const;
const TAB_DEFICIENCIES_HREF = "/reports/inspections/deficiencies" as const;

export function InspectionReportTabs() {
  const t = useTranslations("globalReports.inspectionPassFail");
  const tDef = useTranslations("globalReports.inspectionDeficiencies");
  const pathname = usePathname();

  const tabs = [
    {
      id: "log" as const,
      href: TAB_LOG_HREF,
      label: t("tabLog"),
      active: pathname === TAB_LOG_HREF,
    },
    {
      id: "passFail" as const,
      href: TAB_PASS_FAIL_HREF,
      label: t("tabPassFail"),
      active:
        pathname === TAB_PASS_FAIL_HREF || pathname.startsWith(`${TAB_PASS_FAIL_HREF}/`),
    },
    {
      id: "deficiencies" as const,
      href: TAB_DEFICIENCIES_HREF,
      label: tDef("tabDeficiencies"),
      active:
        pathname === TAB_DEFICIENCIES_HREF ||
        pathname.startsWith(`${TAB_DEFICIENCIES_HREF}/`),
    },
  ];

  return (
    <nav
      aria-label={t("reportTabsAria")}
      style={{
        width: "100%",
        padding: "0 var(--page-padding-x, 12px)",
        borderBottom: "1px solid var(--neutral-200)",
        backgroundColor: "var(--neutral-0)",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          gap: 2,
          overflowX: "auto",
          width: "100%",
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
