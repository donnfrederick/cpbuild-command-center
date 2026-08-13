/** Neutral label when verified install % did not increase in the compare window. */
export const PORTFOLIO_PROGRESS_ZERO_DELTA_PCT = "0%";

/** True when delta represents positive verified progress for display. */
export function isPortfolioProgressPositiveDelta(
  delta: number | null | undefined,
): delta is number {
  return delta !== null && delta !== undefined && delta > 0;
}

/** Percent label — only positive changes show +N%; zero, negative, and null show 0%. */
export function formatPortfolioProgressDeltaPct(
  delta: number | null | undefined,
  options?: { zeroLabel?: string },
): string {
  const zeroLabel = options?.zeroLabel ?? PORTFOLIO_PROGRESS_ZERO_DELTA_PCT;
  if (isPortfolioProgressPositiveDelta(delta)) return `+${delta}%`;
  return zeroLabel;
}

/** CSS token for portfolio progress delta text (cards + level grid). */
export function portfolioProgressDeltaColor(delta: number | null | undefined): string {
  if (isPortfolioProgressPositiveDelta(delta)) return "var(--success-600)";
  return "var(--neutral-500)";
}

/** Hex color for PDF export — mirrors portfolioProgressDeltaColor. */
export function portfolioProgressDeltaColorHex(delta: number | null | undefined): string {
  if (isPortfolioProgressPositiveDelta(delta)) return "#15803d";
  return "#6b7280";
}
