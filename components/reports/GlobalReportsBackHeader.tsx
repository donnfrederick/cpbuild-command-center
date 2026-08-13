"use client";

import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isGlobalReportSubRoute } from "@/lib/reports/global-reports-registry";

/** Mobile-only back control when viewing a specific global report (not the hub). */
export function GlobalReportsBackHeader() {
  const pathname = usePathname();
  const t = useTranslations("globalReports");

  if (!isGlobalReportSubRoute(pathname)) return null;

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .global-reports-back-header {
            display: none !important;
          }
        }
      `}</style>
      <div
        className="global-reports-back-header mobile-only"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "10px var(--page-padding-x, 12px) 2px",
          flexShrink: 0,
          backgroundColor: "var(--neutral-0)",
        }}
      >
        <Link
          href="/reports"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 14,
            fontWeight: 500,
            color: "var(--primary-600)",
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={16} aria-hidden />
          {t("hubBack")}
        </Link>
      </div>
    </>
  );
}
