import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InspectionReportPanel } from "@/components/projects/inspections/InspectionReportLayout";

describe("InspectionReportPanel", () => {
  it("does not render a default pass icon on bleed layout so titles align with fail bleed", () => {
    const { container } = render(
      <InspectionReportPanel
        tone="pass"
        layout="bleed"
        title="Review remaining items"
        status="7"
        open={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Review remaining items/i })).toBeInTheDocument();
    expect(container.querySelector(".inspection-report-panel__icon")).toBeNull();
  });

  it("renders the default pass icon on card layout", () => {
    const { container } = render(
      <InspectionReportPanel
        tone="pass"
        layout="card"
        title="Passed items"
        status="3"
        open={false}
        onToggle={vi.fn()}
      />,
    );

    expect(container.querySelector(".inspection-report-panel__icon")).not.toBeNull();
  });

  it("applies sticky header class when stickySectionHeader is enabled", () => {
    const { container } = render(
      <InspectionReportPanel
        tone="fail"
        layout="bleed"
        stickySectionHeader
        title="Open deficiencies"
        status="15"
        open
        onToggle={vi.fn()}
      >
        <p>Body</p>
      </InspectionReportPanel>,
    );

    expect(container.querySelector(".inspection-report-panel--sticky-header")).not.toBeNull();
  });
});
