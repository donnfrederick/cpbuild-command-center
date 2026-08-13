import {
  formatPortfolioProgressDeltaPct,
  portfolioProgressDeltaColorHex,
} from "@/lib/reports/portfolio-progress-display";

/** Inline unit count beside a % delta — mirrors levelScopeReport.deltaUnitsInline. */
export function formatExportUnitsInline(count: number, locale: string): string {
  const abs = Math.abs(count);
  if (locale.startsWith("es")) {
    return abs === 1 ? `(${abs} unidad)` : `(${abs} unidades)`;
  }
  return abs === 1 ? `(${abs} unit)` : `(${abs} units)`;
}

export function formatExportDeltaText(
  delta: number | null | undefined,
  _noChange: string,
): string {
  return formatPortfolioProgressDeltaPct(delta);
}

export function deltaColorHex(delta: number | null | undefined): string {
  return portfolioProgressDeltaColorHex(delta);
}
