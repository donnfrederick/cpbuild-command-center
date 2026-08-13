"use client";

/**
 * Unified header for inspection record + retry sheets.
 * Card layout: colored hero band (pass/fail/pending) + white metadata body.
 */

import {
  Calendar,
  ClipboardCheck,
  FlaskConical,
  HardHat,
  MapPin,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { InspectionLocationParts } from "@/lib/inspections/inspectionHeaderUtils";
import {
  formatInspectionBuildingLevelLabel,
  formatInspectionUnitTitle,
} from "@/lib/inspections/inspectionHeaderUtils";

export interface InspectionSheetHeaderProps {
  /** Hero title fallback when unit parts are unavailable — e.g. form name. */
  title?: string;
  onClose: () => void;
  closeLabel: string;
  /** Preferred — drives hero unit title + building/level line. */
  locationParts?: InspectionLocationParts | null;
  /** Legacy full location string when parts are unavailable. */
  locationLabel?: string;
  /** Category line — e.g. "Clear inspection". Combined with scope for subtitle. */
  categoryEyebrow?: string | null;
  /** Scope type display name — e.g. "Cabinets". */
  scopeTypeName?: string | null;
  /** Scope type code pill — e.g. "CABIU". */
  scopeCode?: string | null;
  /** Attempt badge in body — e.g. "Attempt #4". */
  attemptLabel?: string | null;
  /** Pass / fail / in-progress status in the hero badge. */
  outcome?: {
    label?: string;
    passed: boolean | null;
  };
  showCalibrationBanner?: boolean;
  calibrationBannerLabel?: string;
  /** Assigned subcontractor / install team display name. */
  installerName?: string;
  dateLabel?: string;
  submittedBy?: string;
  /** Meta row label for `submittedBy` — defaults to Inspector for clear inspections. */
  submittedByMetaLabel?: string;
  /** Project name for project-level forms (hero location line). */
  projectName?: string;
  sticky?: boolean;
  /** When false, hide the header close control (e.g. readonly toolbar owns close). */
  showCloseButton?: boolean;
}

function heroTone(passed: boolean | null | undefined): "pass" | "fail" | "pending" {
  if (passed === true) return "pass";
  if (passed === false) return "fail";
  return "pending";
}

function HeaderPartyRow({
  icon,
  label,
  value,
  unassigned = false,
  iconTone = "sub",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unassigned?: boolean;
  iconTone?: "sub" | "inspector";
}) {
  return (
    <div
      className={`inspection-sheet-header__party${unassigned ? " inspection-sheet-header__party--unassigned" : ""}`}
    >
      <span
        className={`inspection-sheet-header__party-icon inspection-sheet-header__party-icon--${iconTone}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="inspection-sheet-header__party-copy">
        <span className="inspection-sheet-header__party-label">{label}</span>
        <span className="inspection-sheet-header__party-value">{value}</span>
      </span>
    </div>
  );
}

export function InspectionSheetHeader({
  title,
  onClose,
  closeLabel,
  locationParts,
  locationLabel,
  categoryEyebrow,
  scopeTypeName,
  scopeCode,
  attemptLabel,
  outcome,
  showCalibrationBanner = false,
  calibrationBannerLabel = "",
  installerName,
  dateLabel,
  submittedBy,
  submittedByMetaLabel,
  projectName,
  sticky = false,
  showCloseButton = true,
}: InspectionSheetHeaderProps) {
  const t = useTranslations("inspections");

  const buildingLevelLabel =
    formatInspectionBuildingLevelLabel(locationParts) ??
    (locationLabel?.includes("Unit ")
      ? locationLabel.replace(/\s·\sUnit\s.+$/, "").trim() || undefined
      : locationLabel);

  const trimmedProject = projectName?.trim();
  const heroLocationLabel = buildingLevelLabel ?? (trimmedProject || undefined);

  const unitTitle = formatInspectionUnitTitle(locationParts, title) ?? title ?? "";

  const showProjectInSubtitle = Boolean(
    trimmedProject && trimmedProject !== heroLocationLabel,
  );

  const subtitle =
    [
      categoryEyebrow?.trim(),
      scopeTypeName?.trim(),
      showProjectInSubtitle ? trimmedProject : undefined,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  const tone = heroTone(outcome?.passed);
  const showStatusBadge = outcome != null && outcome.passed !== null;
  const statusLabel =
    outcome?.passed === true
      ? t("headerOutcomePassed")
      : outcome?.passed === false
        ? t("headerOutcomeFailed")
        : undefined;

  const showMeta = Boolean(installerName || submittedBy);
  const showScopePill =
    Boolean(scopeCode) &&
    !subtitle?.toLowerCase().includes(scopeCode!.toLowerCase());
  const showAside = Boolean(attemptLabel || dateLabel);
  const showBody = showMeta || showScopePill || showAside;
  const installerUnassigned =
    Boolean(installerName) && installerName === t("overlayUnassigned");

  return (
    <header
      className={`inspection-sheet-header${sticky ? " inspection-sheet-header--sticky" : ""}`}
    >
      <div className="inspection-sheet-header__card">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="inspection-sheet-header__close"
          style={showCloseButton ? undefined : { display: "none" }}
        >
          <X size={18} aria-hidden />
        </button>
        {showCalibrationBanner && (
          <span className="inspection-sheet-header__calibration-badge">
            <FlaskConical size={11} aria-hidden />
            <span>{calibrationBannerLabel || t("calibrationBadge")}</span>
          </span>
        )}
        <div
          className={`inspection-sheet-header__hero inspection-sheet-header__hero--${tone}`}
        >
          <div className="inspection-sheet-header__hero-main">
            {heroLocationLabel && (
              <div className="inspection-sheet-header__hero-location">
                <MapPin size={12} aria-hidden />
                <span>{heroLocationLabel}</span>
              </div>
            )}
            <h2 className="inspection-sheet-header__hero-title">{unitTitle}</h2>
            {subtitle && (
              <p className="inspection-sheet-header__hero-subtitle">{subtitle}</p>
            )}
          </div>

          {showStatusBadge && statusLabel && (
            <div
              className="inspection-sheet-header__status-badge"
              role="status"
              aria-label={statusLabel}
            >
              {outcome?.passed === true ? (
                <ShieldCheck size={22} aria-hidden />
              ) : (
                <ShieldX size={22} aria-hidden />
              )}
              <span>{statusLabel}</span>
            </div>
          )}
        </div>

        {showBody && (
          <div className="inspection-sheet-header__body">
            <div className="inspection-sheet-header__body-main">
              {installerName && (
                <HeaderPartyRow
                  icon={<HardHat size={14} strokeWidth={2.25} />}
                  label={t("headerMetaSub")}
                  value={installerName}
                  unassigned={installerUnassigned}
                  iconTone="sub"
                />
              )}
              {submittedBy && (
                <HeaderPartyRow
                  icon={<ClipboardCheck size={14} strokeWidth={2.25} />}
                  label={submittedByMetaLabel ?? t("headerMetaInspector")}
                  value={submittedBy}
                  iconTone="inspector"
                />
              )}
              {showScopePill && (
                <span className="inspection-sheet-header__scope-pill">{scopeCode}</span>
              )}
            </div>

            {showAside && (
              <div className="inspection-sheet-header__body-aside">
                {attemptLabel && (
                  <span className="inspection-sheet-header__attempt-pill">{attemptLabel}</span>
                )}
                {dateLabel && (
                  <p className="inspection-sheet-header__meta-line inspection-sheet-header__aside-date">
                    <Calendar size={12} aria-hidden />
                    <span>{dateLabel}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
