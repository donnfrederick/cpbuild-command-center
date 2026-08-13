/**
 * Pure helpers for deriving the one-line status copy an inspection
 * band and history row render. Kept as a separate module so unit
 * tests can cover the branching without mounting the components.
 */

import type {
  AnswersMap,
  AnswerState,
} from "@/components/forms/FormFillClient";
import type {
  FormTemplate,
  Deficiency,
  DeficiencySeverity,
} from "@/components/forms/formTypes";
import { isDocumentationForm } from "@/lib/forms/form-purpose-rules";
import type {
  InspectionOutcome,
  InspectionSubmission,
} from "@/lib/inspections/submissionsApi";

/**
 * Count deficiencies across all PASS_FAIL_DEFICIENCIES questions that
 * were marked Fail. Non-fail answers never carry deficiencies, so this
 * walks only the fail branches. Empty / half-filled deficiencies are
 * filtered out by `FormFillClient`'s submit gate before we ever get
 * here, so anything present is assumed complete.
 */
export function countDeficiencies(
  template: FormTemplate,
  answers: AnswersMap,
): { total: number; bySeverity: Record<DeficiencySeverity, number> } {
  const bySeverity: Record<DeficiencySeverity, number> = {
    Minor: 0,
    Major: 0,
    Critical: 0,
  };
  if (isDocumentationForm(template)) {
    return { total: 0, bySeverity };
  }
  let total = 0;
  for (const section of template.sections) {
    for (const q of section.questions) {
      if (q.responseType !== "PASS_FAIL_DEFICIENCIES") continue;
      const a: AnswerState | undefined = answers[q.id];
      if (a?.choice !== "fail") continue;
      for (const d of (a.deficiencies ?? []) as Deficiency[]) {
        const count = Math.max(1, Math.trunc(d.count ?? 1));
        total += count;
        if (d.severity) bySeverity[d.severity] += count;
      }
    }
  }
  return { total, bySeverity };
}

/**
 * Roll up the answers into a single outcome that drives the band's
 * status copy. Precedence (in order):
 *   1. Any Fail answer on a pass/fail-style question → FAIL
 *   2. No pass/fail questions at all → COMPLETE
 *   3. Otherwise → PASS
 */
export function deriveOutcome(
  template: FormTemplate,
  answers: AnswersMap,
): InspectionOutcome {
  if (isDocumentationForm(template)) return "COMPLETE";

  let hasPassFail = false;
  let anyFail = false;
  for (const section of template.sections) {
    for (const q of section.questions) {
      if (
        q.responseType !== "PASS_FAIL" &&
        q.responseType !== "PASS_FAIL_DEFICIENCIES" &&
        q.responseType !== "YES_NO"
      ) {
        continue;
      }
      hasPassFail = true;
      const choice = answers[q.id]?.choice;
      if (choice === "fail" || choice === "no") {
        anyFail = true;
      }
    }
  }

  if (anyFail) return "FAIL";
  if (!hasPassFail) return "COMPLETE";
  return "PASS";
}

/**
 * Returns the English ordinal string for a positive integer.
 *   1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th", etc.
 */
export function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  // 11–13 are exceptions that take "th" regardless of their last digit.
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = abs % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Short label for the scope-card band chip and the readonly record header.
 * When `attemptNumber` is supplied the ordinal is appended so the user can
 * immediately see which run they're looking at:
 *   PASS / COMPLETE → "Pass · 1st"   (or just "Pass" when no number given)
 *   FAIL            → "Fail · 2nd"   (or just "Fail" when no number given)
 * Deficiency count is intentionally omitted — open the record to see detail.
 */
export function describeOutcome(
  sub: InspectionSubmission,
  attemptNumber?: number,
): string {
  const suffix =
    attemptNumber != null ? ` · ${ordinal(attemptNumber)}` : "";
  switch (sub.outcome) {
    case "PASS":
    case "COMPLETE":
      return `Pass${suffix}`;
    case "FAIL":
      return `Fail${suffix}`;
  }
}

/**
 * Long-form label for history rows where more descriptive text fits.
 * When `attemptNumber` is supplied it prefixes the result:
 *   "1st — Passed", "2nd — Failed"
 */
export function describeOutcomeLong(
  sub: InspectionSubmission,
  attemptNumber?: number,
): string {
  const prefix =
    attemptNumber != null ? `${ordinal(attemptNumber)} — ` : "";
  switch (sub.outcome) {
    case "PASS":
    case "COMPLETE":
      return `${prefix}Passed`;
    case "FAIL":
      return `${prefix}Failed`;
  }
}

/**
 * Color token for the outcome pill. Pass → green, Fail → red,
 * Complete (no pass/fail questions) → green (treat as a pass).
 */
export function outcomeColor(outcome: InspectionOutcome): string {
  switch (outcome) {
    case "PASS":
    case "COMPLETE":
      return "var(--success-600, #16a34a)";
    case "FAIL":
      return "var(--error-600, #dc2626)";
  }
}

/**
 * Relative-time copy for a submission row. Intentionally low-precision —
 * inspectors don't need "2 minutes 47 seconds ago", they need "just now"
 * / "2h ago" / "yesterday" / absolute date for anything older.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export {
  describeCategoryAbbrev,
  describeCategoryLabel,
  INSPECTION_CATEGORY_ABBREV,
  isCalibrationSubmission,
  latestClearInspectionSubmission,
  latestNonCalibrationSubmission,
  latestSubmissionByCategory,
  scopeInstallLockedByClearInspection,
  scopeInspectionStatusFromSubmission,
  submissionAuthoritativeForScopeInspectionStatus,
} from "@/lib/inspections/scope-inspection-display";
