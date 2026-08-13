import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortfolioProgressLevelBreakdownSkeleton } from "@/components/reports/PortfolioProgressLevelBreakdownSkeleton";

describe("PortfolioProgressLevelBreakdownSkeleton", () => {
  it("renders a busy status region with the loading label", () => {
    render(<PortfolioProgressLevelBreakdownSkeleton loadingLabel="Loading level detail…" />);

    expect(screen.getByRole("status", { name: "Loading level detail…" })).toBeDefined();
    expect(screen.getByText("Loading level detail…")).toBeDefined();
    expect(document.querySelector(".portfolio-progress-level-breakdown-skeleton")).not.toBeNull();
  });
});
