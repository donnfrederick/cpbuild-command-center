/** Helpers for the mobile inspection report card list. */

import { formatSubmissionLocationSubtext } from "@/lib/inspections/inspection-report-filters";

export function inspectorDisplayName(raw: string): string {
  return raw.replace(/^\[Seed\]\s*/i, "").trim();
}

export function subcontractorDisplayName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/^\[SEED\]\s*/i, "").trim();
}

export function inspectorInitials(name: string): string {
  const cleaned = inspectorDisplayName(name);
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export type MobileAttemptLineInput = {
  isCalibration: boolean;
  attemptNumber: number | null;
  submittedAt: string;
  formatDate: (iso: string) => string;
};

export function formatMobileAttemptLine(input: MobileAttemptLineInput): string {
  const date = input.formatDate(input.submittedAt);
  if (input.isCalibration) return `Calibration · ${date}`;
  if (input.attemptNumber != null) return `Attempt #${input.attemptNumber} · ${date}`;
  return date;
}

export function inspectionReportEntryTone(
  outcome: string,
  isCalibration: boolean
): "pass" | "fail" | "calibration" {
  if (isCalibration) return "calibration";
  return outcome === "PASS" ? "pass" : "fail";
}

/** Compact label for mobile report cards (e.g. Clear Inspection → Clear Insp). */
export function mobileInspectionTypeLabel(
  name: string | null | undefined,
  inspectionTypeCode: string | null | undefined,
  clearInspLabel: string,
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "—";
  if (
    inspectionTypeCode === "CLEAR_INSPECTION" ||
    /^clear inspection$/i.test(trimmed)
  ) {
    return clearInspLabel;
  }
  return trimmed.replace(/\s+Inspection\b/i, " Insp");
}

export function reportRowLocationLabel(submission: {
  unit: string;
  building: string;
  level: string;
  area?: string;
  shipPhase?: string;
  buildPhase?: string;
}): string | undefined {
  const parts: string[] = [];
  const subtext = formatSubmissionLocationSubtext(submission);
  if (subtext) parts.push(subtext);
  const unit = (submission.unit ?? "").trim();
  if (unit) parts.push(`Unit ${unit}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
