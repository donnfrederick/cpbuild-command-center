import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ScopeStatusSquare } from "@/components/projects/ScopeStatusSquare";

const messages = {
  units: {
    scopeSquareSemantic_install_complete: "Install complete",
    scopeSquareSemantic_issue_flagged: "Issue flagged",
    scopeSquareSemantic_neutral: "Neutral",
    scopeSquareSemantic_not_started: "Not started",
    scopeSquareSemantic_staging_assembly_progress: "In progress",
    scopeSquareSemantic_assembly: "Assembly",
    scopeSquareSemantic_install_in_progress: "Install in progress",
    scopeSquareSemantic_inspection_ready: "Inspection ready",
    scopeSquareSemantic_inspection_passed: "Inspection passed",
    scopeSquareSemantic_failed_inspection: "Inspection failed",
    scopeSquareSemantic_blocked: "Blocked",
    scopeSquareAria: "{name} ({abbrev}): {detail}",
  },
};

function renderSquare(
  props: Partial<React.ComponentProps<typeof ScopeStatusSquare>["scope"]> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ScopeStatusSquare
        layout="grid"
        scope={{
          id: "row-1",
          scopeType: { code: "TIL", name: "Tile" },
          description: "Tile",
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
          inspectionStatus: null,
          subScopeStatuses: ["COMPLETE"],
          ...props,
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe("ScopeStatusSquare grid sub-scope dots", () => {
  it("renders sub-scope dots below the abbrev, not overlapping it", () => {
    const { container } = renderSquare();
    expect(screen.getByText("TIL")).toBeTruthy();
    const dots = container.querySelectorAll('[aria-hidden="true"] span[style*="border-radius: 2px"]');
    expect(dots.length).toBeGreaterThan(0);
    const dot = dots[0] as HTMLElement;
    expect(dot.style.backgroundColor).toBe("var(--scope-tile-verified-fg)");
  });

  it("hides sub-scope dots when the tile uses an inspection shield", () => {
    const { container } = renderSquare({
      inspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
    });
    const dots = container.querySelectorAll('[aria-hidden="true"] span[style*="border-radius: 2px"]');
    expect(dots.length).toBe(0);
  });
});
