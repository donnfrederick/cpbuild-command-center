import { describe, expect, it } from "vitest";
import {
  formatPortfolioProgressDeltaPct,
  isPortfolioProgressPositiveDelta,
  portfolioProgressDeltaColor,
  portfolioProgressDeltaColorHex,
} from "@/lib/reports/portfolio-progress-display";

describe("portfolio-progress-display", () => {
  it("treats only positive deltas as progress", () => {
    expect(isPortfolioProgressPositiveDelta(4)).toBe(true);
    expect(isPortfolioProgressPositiveDelta(0)).toBe(false);
    expect(isPortfolioProgressPositiveDelta(-2)).toBe(false);
    expect(isPortfolioProgressPositiveDelta(null)).toBe(false);
    expect(isPortfolioProgressPositiveDelta(undefined)).toBe(false);
  });

  it("formats positive deltas with a plus sign and zero otherwise", () => {
    expect(formatPortfolioProgressDeltaPct(4)).toBe("+4%");
    expect(formatPortfolioProgressDeltaPct(-2)).toBe("0%");
    expect(formatPortfolioProgressDeltaPct(0)).toBe("0%");
    expect(formatPortfolioProgressDeltaPct(null)).toBe("0%");
  });

  it("uses success color only for positive deltas", () => {
    expect(portfolioProgressDeltaColor(3)).toBe("var(--success-600)");
    expect(portfolioProgressDeltaColor(-1)).toBe("var(--neutral-500)");
    expect(portfolioProgressDeltaColorHex(3)).toBe("#15803d");
    expect(portfolioProgressDeltaColorHex(-1)).toBe("#6b7280");
  });
});
