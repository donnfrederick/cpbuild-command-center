"use client";

/**
 * Shared deficiency row display for inspection record + retry views.
 */

import { useTranslations } from "next-intl";
import type { Deficiency } from "@/components/forms/formTypes";
import { deficiencySeverityModifier } from "@/components/forms/formTypes";
import { ClickableMediaStrip } from "./InspectionRecordClient";

export function InspectionReportDeficiencyRow({
  deficiency,
  variant = "fail",
}: {
  deficiency: Deficiency;
  variant?: "fail" | "resolved";
}) {
  const t = useTranslations("inspections");
  const severityMod = deficiency.severity
    ? deficiencySeverityModifier(deficiency.severity)
    : null;
  const count = deficiency.count ?? 1;
  const hasMedia = (deficiency.capturedFiles?.length ?? 0) > 0;
  const hasResolutionMedia = (deficiency.resolutionCapturedFiles?.length ?? 0) > 0;

  return (
    <div
      className={`inspection-report-deficiency-row inspection-report-deficiency-row--${variant}${severityMod ? ` inspection-report-deficiency-row--${severityMod}` : ""}`}
    >
      <div className="inspection-report-deficiency-row__body">
        {deficiency.description ? (
          <p className="inspection-report-deficiency-row__description">{deficiency.description}</p>
        ) : variant === "fail" ? (
          <p className="inspection-report-deficiency-row__description inspection-report-deficiency-row__description--empty">
            {t("noDescriptionRecorded")}
          </p>
        ) : null}

        {deficiency.resolutionNote && (
          <p className="inspection-report-deficiency-row__resolution-note">
            <span className="inspection-report-deficiency-row__resolution-label">
              {t("recordResolutionNote")}:
            </span>{" "}
            {deficiency.resolutionNote}
          </p>
        )}

        {hasMedia && (
          <div className="inspection-report-deficiency-row__media">
            <ClickableMediaStrip files={deficiency.capturedFiles!} />
          </div>
        )}

        {hasResolutionMedia && (
          <div className="inspection-report-deficiency-row__media">
            <ClickableMediaStrip files={deficiency.resolutionCapturedFiles!} />
          </div>
        )}

        {(deficiency as Deficiency & { photoBlobId?: string }).photoBlobId &&
          !hasMedia && (
            <p className="inspection-report-deficiency-row__photo-hint">{t("photoAttached")}</p>
          )}
      </div>

      {(deficiency.severity || count > 1 || variant === "fail") && (
        <div className="inspection-report-deficiency-row__meta">
          {deficiency.severity ? (
            <span
              className={`inspection-report-deficiency-row__severity inspection-report-deficiency-row__severity--${severityMod}`}
            >
              {deficiency.severity}
            </span>
          ) : variant === "fail" ? (
            <span className="inspection-report-deficiency-row__severity inspection-report-deficiency-row__severity--missing">
              {t("noSeverityRecorded")}
            </span>
          ) : null}
          {count > 1 || variant === "fail" ? (
            <span className="inspection-report-deficiency-row__count">×{count}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function InspectionReportResolvedHeading() {
  const t = useTranslations("inspections");
  return <p className="inspection-report-resolved-heading">{t("recordResolvedDeficiencies")}</p>;
}

export function InspectionReportDeficiencyRows({
  deficiencies,
  variant = "fail",
}: {
  deficiencies: Deficiency[];
  variant?: "fail" | "resolved";
}) {
  return (
    <>
      {deficiencies.map((d) => (
        <InspectionReportDeficiencyRow key={d.id} deficiency={d} variant={variant} />
      ))}
    </>
  );
}
