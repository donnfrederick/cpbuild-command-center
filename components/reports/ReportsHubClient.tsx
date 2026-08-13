"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GLOBAL_REPORTS } from "@/lib/reports/global-reports-registry";
import { useReportsOfflineBlock } from "@/hooks/use-reports-offline-block";

export function ReportsHubClient() {
  const t = useTranslations("globalReports");
  const { isReportsNavBlocked, onReportsNavClick } = useReportsOfflineBlock();
  const reportLinkStyle = isReportsNavBlocked
    ? { opacity: 0.45, cursor: "not-allowed" as const }
    : undefined;

  return (
    <div className="reports-hub">
      <h1 className="reports-hub__title">{t("hubTitle")}</h1>
      <p className="reports-hub__subtitle">{t("hubSubtitle")}</p>

      <div className="reports-grid">
        {GLOBAL_REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              href={report.href}
              aria-disabled={isReportsNavBlocked || undefined}
              onClick={onReportsNavClick}
              className={`report-card report-card--${report.id}`}
              style={reportLinkStyle}
            >
              <div className="report-card__top">
                <div className="report-card__icon">
                  <Icon size={22} aria-hidden />
                </div>
                <span className="report-card__arrow" aria-hidden>
                  <ChevronRight size={17} />
                </span>
              </div>

              <div className="report-card__body">
                <div className="report-card__title-row">
                  <p className="report-card__title">{t(report.labelKey)}</p>
                </div>
                <p className="report-card__description">{t(report.descriptionKey)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
