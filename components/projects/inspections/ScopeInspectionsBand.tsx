"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CloudOff, FlaskConical } from "lucide-react";
import { useScopeInspection } from "@/components/projects/inspections/ScopeInspectionProvider";
import { submissionOutcomeIsFail } from "@/lib/inspections/scope-inspection-display";

/**
 * Scope-card badges and alerts: calibration pass/fail, pending sync, calibration discrepancy.
 * Formal inspection pass/fail lives on the status hub; full history in unit Inspections.
 */
export function ScopeInspectionsBand() {
  const t = useTranslations("inspections");
  const {
    submissions,
    hydrated,
    nonCalibrationSubmissions,
    latestCalibration,
    openCalibrationReview,
  } = useScopeInspection();

  const hasPending = submissions.some((s) => s._pendingSync);

  const latest = nonCalibrationSubmissions[0] ?? null;
  const hasCalibrationDiscrepancy =
    latestCalibration?.outcome === "FAIL" &&
    latest != null &&
    (latest.outcome === "PASS" || latest.outcome === "COMPLETE");

  if (!hydrated) {
    return null;
  }

  const hasCalibrationBadge = latestCalibration != null;
  if (!hasPending && !hasCalibrationDiscrepancy && !hasCalibrationBadge) {
    return null;
  }

  const calibrationFailed =
    latestCalibration != null && submissionOutcomeIsFail(latestCalibration);

  return (
    <div
      className="inspection-scope-alerts"
      style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}
    >
      {latestCalibration && (
        <button
          type="button"
          className={`inspection-calibration-result ${
            calibrationFailed
              ? "inspection-calibration-result--fail"
              : "inspection-calibration-result--pass"
          }`}
          onClick={() => openCalibrationReview(latestCalibration)}
          aria-label={t("scopeViewCalibrationAria")}
        >
          <FlaskConical size={12} aria-hidden />
          {t("scopeCalibrationResult", {
            outcome: calibrationFailed ? t("failLabel") : t("passLabel"),
          })}
        </button>
      )}

      {hasCalibrationDiscrepancy && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-warning-subtle, var(--warning-50))",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--warning-700, #b45309)",
          }}
        >
          <AlertTriangle size={11} aria-hidden />
          {t("scopeCalibrationDiscrepancy")}
        </div>
      )}

      {hasPending && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-warning-subtle, var(--warning-50))",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--warning-700, #b45309)",
          }}
        >
          <CloudOff size={11} aria-hidden />
          {t("pendingSyncBadge")}
        </div>
      )}
    </div>
  );
}
