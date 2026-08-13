import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type { FieldDailyReportPdfBadgeStyle } from "@/lib/field-daily-report/pdf-export-types";

/** Resolved hex values for design tokens used in scope / inspection badges (Puppeteer has no app CSS). */
const TOKEN_HEX: Record<string, string> = {
  "--blue-50": "#EBF2FF",
  "--blue-200": "#A3C4FF",
  "--blue-600": "#0044CC",
  "--blue-700": "#003399",
  "--neutral-0": "#FFFFFF",
  "--neutral-100": "#F0F1F5",
  "--neutral-400": "#C4C7D4",
  "--neutral-700": "#4D5266",
  "--success-50": "#EDFAF3",
  "--success-100": "#EDFAF3",
  "--success-500": "#16A34A",
  "--success-600": "#15803D",
  "--success-700": "#14532D",
  "--warning-100": "#FEF3C7",
  "--warning-600": "#92400E",
  "--error-100": "#FEE2E2",
  "--error-600": "#DC2626",
  "--error-700": "#991B1B",
  /* scope-tile tokens (combinedOptionDisplay uses these, not raw palette vars) */
  "--scope-tile-staging-bg": "#EBF2FF",
  "--scope-tile-staging-fg": "#0044CC",
  "--scope-tile-assembly-bg": "#A3C4FF",
  "--scope-tile-assembly-fg": "#003399",
  "--scope-tile-not-started-bg": "#F0F1F5",
  "--scope-tile-not-started-fg": "#C4C7D4",
};

function resolveCssColor(value: string): string {
  if (value.startsWith("#")) return value;
  const varMatch = /^var\((--[^)]+)\)$/.exec(value.trim());
  if (varMatch) {
    return TOKEN_HEX[varMatch[1]] ?? "#374151";
  }
  return value;
}

function pdfBadgeStyleFromCss(bg: string, color: string): FieldDailyReportPdfBadgeStyle {
  return {
    backgroundColor: resolveCssColor(bg),
    color: resolveCssColor(color),
  };
}

/** Matches FieldDailyScopeStatusBadge (triggerBg + textColor when present, else bg + color). */
export function scopeStatusPdfBadgeStyle(
  scopeStage?: string | null,
  scopeStatus?: string | null,
): FieldDailyReportPdfBadgeStyle | undefined {
  if (!scopeStage || !scopeStatus) return undefined;
  const display = combinedOptionDisplay(scopeStage as ScopeStage, scopeStatus as ScopeStatus);
  if (display.triggerBg && display.textColor) {
    return pdfBadgeStyleFromCss(display.triggerBg, display.textColor);
  }
  return pdfBadgeStyleFromCss(display.bg, display.color);
}

/** Matches inspectionOutcomeStyle in FieldDailyReportProjectBlock. */
export function inspectionOutcomePdfBadgeStyle(outcome: string): FieldDailyReportPdfBadgeStyle {
  const key = outcome.toUpperCase();
  if (key === "PASS" || key === "PASSED") {
    return { backgroundColor: "#EDFAF3", color: "#14532D" };
  }
  if (key === "FAIL" || key === "FAILED") {
    return { backgroundColor: "#FEE2E2", color: "#991B1B" };
  }
  return { backgroundColor: "#F0F1F5", color: "#4D5266" };
}
