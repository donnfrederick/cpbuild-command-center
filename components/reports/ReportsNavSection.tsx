"use client";

import { useState } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { usePathname } from "@/i18n/navigation";
import { GLOBAL_REPORTS } from "@/lib/reports/global-reports-registry";
import { useReportsOfflineBlock } from "@/hooks/use-reports-offline-block";

export function ReportsNavSection() {
  const tNav = useTranslations("nav");
  const tReports = useTranslations("globalReports");
  const pathname = usePathname();
  const inReportsSection = pathname === "/reports" || pathname.startsWith("/reports/");
  const [manualOpen, setManualOpen] = useState(false);
  const expanded = inReportsSection || manualOpen;
  const { isReportsNavBlocked, onReportsNavClick } = useReportsOfflineBlock();
  const reportsLinkStyle = isReportsNavBlocked
    ? { opacity: 0.45, cursor: "not-allowed" as const }
    : undefined;

  const parentActive = inReportsSection;

  const parentRowStyle = {
    display: "flex" as const,
    alignItems: "center" as const,
    marginBottom: 2,
    backgroundColor: parentActive ? "var(--orange-50)" : "transparent",
    boxShadow: parentActive ? "inset -3px 0 0 var(--orange-500)" : "none",
    borderRadius: 0,
  };

  const parentLinkStyle = {
    padding: "8px 16px",
    flex: 1,
    minWidth: 0,
    color: parentActive ? "var(--orange-500)" : "var(--neutral-500)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    fontFamily: "inherit",
    textDecoration: "none" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 12,
    ...reportsLinkStyle,
  };

  return (
    <div style={{ marginBottom: "var(--space-1)" }}>
      <div
        className="transition-colors duration-150"
        style={parentRowStyle}
        onMouseEnter={(e) => {
          if (!parentActive) e.currentTarget.style.backgroundColor = "var(--neutral-100)";
        }}
        onMouseLeave={(e) => {
          if (!parentActive) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <NavLink
          href="/reports"
          aria-current={pathname === "/reports" ? "page" : undefined}
          aria-disabled={isReportsNavBlocked || undefined}
          data-tour="nav-reports"
          onClick={onReportsNavClick}
          style={parentLinkStyle}
        >
          <BarChart3 style={{ width: "var(--icon-size)", height: "var(--icon-size)", flexShrink: 0 }} />
          <span>{tNav("reports")}</span>
        </NavLink>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={tNav("reportsSubmenu")}
          onClick={() => setManualOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            marginRight: 4,
            border: "none",
            borderRadius: 0,
            background: "transparent",
            color: parentActive ? "var(--orange-500)" : "var(--neutral-500)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronDown
            size={16}
            aria-hidden
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          />
        </button>
      </div>

      {expanded && (
        <div style={{ paddingLeft: "var(--space-4)", marginTop: 2 }}>
          {GLOBAL_REPORTS.map((report) => {
            const isActive =
              pathname === report.href || pathname.startsWith(`${report.href}/`);
            return (
              <NavLink
                key={report.id}
                href={report.href}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isReportsNavBlocked || undefined}
                data-tour={`nav-reports-${report.id}`}
                className="w-full flex items-center transition-colors duration-150"
                onClick={onReportsNavClick}
                style={{
                  padding: "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) + var(--icon-size))",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: isActive ? "var(--primary-100)" : "transparent",
                  color: isActive ? "var(--primary-700)" : "var(--neutral-700)",
                  fontSize: "var(--text-body)",
                  fontWeight: isActive ? 600 : 400,
                  marginBottom: 2,
                  textDecoration: "none",
                  display: "block",
                  ...reportsLinkStyle,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "var(--neutral-100)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {tReports(report.labelKey)}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
