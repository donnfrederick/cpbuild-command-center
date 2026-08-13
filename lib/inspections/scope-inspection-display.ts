import type { InspectionCategory } from "@/components/forms/formTypes";
import { INSPECTION_CATEGORY_LABELS } from "@/components/forms/formTypes";
import { isDocumentationSubmission } from "@/lib/forms/form-purpose-rules";
import {
  categoryFromSubmissionSnapshot,
  isScopeInspectionStatusCategory,
} from "@/lib/inspections/inspection-type-codes";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { InspectionStatus, ScopeTileInspectionCategory } from "@/lib/scope-square-style";

/** Short labels for per-type badges on scope cards (v1). */
export const INSPECTION_CATEGORY_ABBREV: Record<InspectionCategory, string> = {
  TWO_AREA_CLEAR: "2AC",
  FIELD_VERIFICATION: "FV",
  GYPCRETE_MOISTURE_TEST: "Gyp",
  CLEAR_INSPECTION: "Clear",
  CALIBRATION_INSPECTION: "Cal",
  OTHER: "Other",
};

export function isCalibrationSubmission(sub: InspectionSubmission): boolean {
  if (sub.categorySnapshot === "CALIBRATION_INSPECTION") return true;
  if (categoryFromSubmissionSnapshot(sub.templateSnapshot) === "CALIBRATION_INSPECTION") {
    return true;
  }
  const resolved = resolveGridSubmissionCategory(sub.templateSnapshot, sub.formCategory);
  return resolved === "CALIBRATION_INSPECTION";
}

/** Resolved inspection category for status/grid — prefers form over legacy PRE_INSTALL stubs. */
export function inspectionSubmissionStatusCategory(sub: InspectionSubmission): string {
  if (isCalibrationSubmission(sub)) {
    return "CALIBRATION_INSPECTION";
  }
  const formCategory =
    sub.formCategory ??
    (isScopeInspectionStatusCategory(sub.categorySnapshot) ? sub.categorySnapshot : undefined);
  const resolved = resolveGridSubmissionCategory(sub.templateSnapshot, formCategory);
  if (resolved && isScopeInspectionStatusCategory(resolved)) {
    return resolved;
  }
  return sub.categorySnapshot;
}

/**
 * Submissions that may drive project_rows.inspectionStatus (all non-calibration
 * formal types plus Procore backfill).
 */
export function submissionAuthoritativeForScopeInspectionStatus(
  sub: InspectionSubmission,
): boolean {
  if (sub.source === "BACKFILL") return true;
  if (isCalibrationSubmission(sub)) return false;
  return isScopeInspectionStatusCategory(inspectionSubmissionStatusCategory(sub));
}

export function scopeInspectionStatusFromSubmission(
  sub: InspectionSubmission,
): "PASSED" | "FAILED" {
  return sub.outcome === "FAIL" ? "FAILED" : "PASSED";
}

/** Newest submission that drives project_rows.inspectionStatus and the status hub label. */
export function latestScopeInspectionStatusSubmission(
  submissions: InspectionSubmission[],
): InspectionSubmission | null {
  return submissions.find((sub) => submissionAuthoritativeForScopeInspectionStatus(sub)) ?? null;
}

/** Submissions are newest-first; return the latest non-calibration record. */
export function latestNonCalibrationSubmission(
  submissions: InspectionSubmission[],
): InspectionSubmission | null {
  return submissions.find((sub) => !isCalibrationSubmission(sub)) ?? null;
}

/** Newest calibration outcome for a scope, or null when no calibration exists. */
export function deriveLatestCalibrationOutcome(
  submissions: InspectionSubmission[],
): "PASS" | "FAIL" | null {
  const latest = submissions.find((sub) => isCalibrationSubmission(sub));
  if (!latest) return null;
  return latest.outcome === "FAIL" ? "FAIL" : "PASS";
}

/** @deprecated Use latestScopeInspectionStatusSubmission for status sync. */
export function latestClearInspectionSubmission(
  submissions: InspectionSubmission[],
): InspectionSubmission | null {
  return latestScopeInspectionStatusSubmission(submissions);
}

/** Whether install stage/status picks inside the hub are frozen (clear or backfill exists). */
export function scopeStatusHubInstallOptionsLocked(
  submissions: InspectionSubmission[],
): boolean {
  return scopeInstallLockedByClearInspection(submissions);
}

/** Whether the status hub trigger itself should be disabled (not inspection actions). */
export function scopeStatusHubTriggerDisabled(
  saving: boolean,
  canManageStatus: boolean,
): boolean {
  return saving || !canManageStatus;
}

/**
 * Install stage/status pickers lock only after a completed Clear Inspection
 * (or Procore backfill), not after pre-install inspection types.
 */
export function scopeInstallLockedByClearInspection(
  submissions: InspectionSubmission[],
): boolean {
  return submissions.some((sub) => {
    if (sub.source === "BACKFILL") return true;
    if (sub.categorySnapshot !== "CLEAR_INSPECTION") return false;
    return sub.outcome === "PASS" || sub.outcome === "FAIL" || sub.outcome === "COMPLETE";
  });
}

/** Most recent submission per category (excluding calibrations from type keys). */
export function latestSubmissionByCategory(
  submissions: InspectionSubmission[],
): Map<InspectionCategory | "BACKFILL", InspectionSubmission> {
  const map = new Map<InspectionCategory | "BACKFILL", InspectionSubmission>();
  for (const sub of submissions) {
    if (isCalibrationSubmission(sub)) continue;
    const key: InspectionCategory | "BACKFILL" =
      sub.source === "BACKFILL" ? "BACKFILL" : sub.categorySnapshot;
    if (!map.has(key)) {
      map.set(key, sub);
    }
  }
  return map;
}

export function describeCategoryAbbrev(sub: InspectionSubmission): string {
  if (sub.source === "BACKFILL") return "Clear";
  return INSPECTION_CATEGORY_ABBREV[sub.categorySnapshot] ?? sub.categorySnapshot;
}

export function describeCategoryLabel(sub: InspectionSubmission): string {
  if (sub.source === "BACKFILL") return INSPECTION_CATEGORY_LABELS.CLEAR_INSPECTION;
  return INSPECTION_CATEGORY_LABELS[sub.categorySnapshot] ?? sub.categorySnapshot;
}

export function describeInspectionCategoryLabel(
  category: InspectionCategory | "BACKFILL",
): string {
  if (category === "BACKFILL") return INSPECTION_CATEGORY_LABELS.CLEAR_INSPECTION;
  return INSPECTION_CATEGORY_LABELS[category] ?? category;
}

/** Status hub + grid tile display before per-scope submission fetch completes. */
export interface ScopeInspectionHubDisplay {
  failed: boolean;
  categoryLabel: string;
  inspectionStatus: "PASSED" | "FAILED";
  latestInspectionCategory: ScopeTileInspectionCategory;
}

export function resolveScopeInspectionHubDisplay(input: {
  gridInspectionStatus?: InspectionStatus | null;
  latestInspectionCategory?: ScopeTileInspectionCategory | null;
  submissions: InspectionSubmission[];
}): ScopeInspectionHubDisplay | null {
  const latest = latestScopeInspectionStatusSubmission(input.submissions);
  if (latest) {
    const failed = submissionOutcomeIsFail(latest);
    return {
      failed,
      categoryLabel: describeCategoryLabel(latest),
      inspectionStatus: failed ? "FAILED" : "PASSED",
      latestInspectionCategory:
        latest.source === "BACKFILL"
          ? "BACKFILL"
          : (inspectionSubmissionStatusCategory(latest) as InspectionCategory),
    };
  }

  const { gridInspectionStatus, latestInspectionCategory } = input;
  if (gridInspectionStatus !== "PASSED" && gridInspectionStatus !== "FAILED") {
    return null;
  }
  if (!latestInspectionCategory) return null;

  const failed = gridInspectionStatus === "FAILED";
  return {
    failed,
    categoryLabel: describeInspectionCategoryLabel(latestInspectionCategory),
    inspectionStatus: gridInspectionStatus,
    latestInspectionCategory,
  };
}

/** CSS suffix for type-aware inspection history rows and chips. */
export type InspectionVisualType =
  | "clear"
  | "backfill"
  | "fv"
  | "2ac"
  | "other"
  | "gyp"
  | "cal";

export function inspectionVisualType(sub: InspectionSubmission): InspectionVisualType {
  if (sub.categorySnapshot === "CALIBRATION_INSPECTION") return "cal";
  if (sub.source === "BACKFILL") return "backfill";
  switch (sub.categorySnapshot) {
    case "FIELD_VERIFICATION":
      return "fv";
    case "TWO_AREA_CLEAR":
      return "2ac";
    case "GYPCRETE_MOISTURE_TEST":
      return "gyp";
    case "OTHER":
      return "other";
    default:
      return "clear";
  }
}

export function submissionOutcomeIsFail(sub: InspectionSubmission): boolean {
  return sub.outcome === "FAIL";
}

export function submissionOutcomeIsPass(sub: InspectionSubmission): boolean {
  return sub.outcome === "PASS" || sub.outcome === "COMPLETE";
}

/** BEM-style modifiers for unit inspection history rows (type + pass/fail accent). */
export function inspectionHistoryRowModifiers(
  sub: InspectionSubmission,
  opts: { accent?: boolean },
): string {
  const type = inspectionVisualType(sub);
  const isFail = submissionOutcomeIsFail(sub);
  const isPass = submissionOutcomeIsPass(sub);
  const parts: string[] = [`inspection-history-row--type-${type}`];
  if (opts.accent && (isPass || isFail)) {
    parts.push(isFail ? "inspection-history-row--fail" : "inspection-history-row--pass");
  }
  return parts.join(" ");
}

/** Chip modifier: inspection-history-row__type-chip--{type}-{pass|fail|neutral} */
export function inspectionTypeChipModifier(sub: InspectionSubmission): string {
  const type = inspectionVisualType(sub);
  if (submissionOutcomeIsFail(sub)) return `${type}-fail`;
  if (submissionOutcomeIsPass(sub)) return `${type}-pass`;
  return `${type}-neutral`;
}

/** Whether Procore backfill can be set (no form yet) or edited (existing backfill). */
export function scopeShowProcoreBackfillMenu(
  submissions: InspectionSubmission[],
  canManageStatus: boolean,
): boolean {
  if (!canManageStatus) return false;
  const nonCalibration = submissions.filter((s) => !isCalibrationSubmission(s));
  const hasForm = nonCalibration.some((s) => s.source === "FORM");
  const hasBackfill = submissions.some((s) => s.source === "BACKFILL");
  return !hasForm || hasBackfill;
}

export function existingProcoreBackfillSubmission(
  submissions: InspectionSubmission[],
): InspectionSubmission | null {
  return submissions.find((s) => s.source === "BACKFILL") ?? null;
}

export function submissionCategoryKey(
  sub: InspectionSubmission,
): InspectionCategory | "BACKFILL" {
  if (sub.source === "BACKFILL") return "BACKFILL";
  return sub.categorySnapshot;
}

/** 1-based attempt index within the submission's category (newest-first list). */
export function attemptNumberForSubmission(
  target: InspectionSubmission,
  submissions: InspectionSubmission[],
): number {
  const key = submissionCategoryKey(target);
  const sameCategory = submissions.filter((s) => {
    if (isCalibrationSubmission(s)) return false;
    return submissionCategoryKey(s) === key;
  });
  const idx = sameCategory.findIndex((s) => s.id === target.id);
  if (idx < 0) return 1;
  return sameCategory.length - idx;
}

/** Whether a failed form inspection can enter the deficiency-resolution retry flow. */
export function scopeInspectionRetryEligible(
  sub: InspectionSubmission,
  canManageStatus: boolean,
): boolean {
  if (!canManageStatus) return false;
  if (sub.source === "BACKFILL") return false;
  if (isCalibrationSubmission(sub)) return false;
  if (isDocumentationSubmission(sub)) return false;
  if (!submissionOutcomeIsFail(sub)) return false;
  return isScopeInspectionStatusCategory(sub.categorySnapshot);
}

/** Whether the status hub should offer Retry for this latest inspection record. */
export function scopeInspectionHubRetryEligible(
  sub: InspectionSubmission,
  canManageStatus: boolean,
): boolean {
  return scopeInspectionRetryEligible(sub, canManageStatus);
}
