import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InspectionReportPeriodPicker } from "@/components/reports/InspectionReportPeriodPicker";
import { defaultInspectionReportPeriod } from "@/lib/reports/inspection-report-period";

const presets = [
  { id: "all" as const, label: "All time" },
  { id: "1w" as const, label: "1 week" },
  { id: "30d" as const, label: "30 days" },
  { id: "custom" as const, label: "Custom" },
];

const baseProps = {
  idPrefix: "test-period",
  ariaLabel: "Time period",
  periodPresets: presets,
  locale: "en",
  customFromLabel: "From",
  customToLabel: "To",
  customRangeError: "Invalid range",
  clearCustomLabel: "Clear",
};

describe("InspectionReportPeriodPicker", () => {
  it("renders preset pills with All time selected by default", () => {
    render(
      <InspectionReportPeriodPicker
        {...baseProps}
        period={defaultInspectionReportPeriod()}
        onPeriodChange={() => {}}
      />
    );

    expect(screen.getByRole("radio", { name: "All time" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("replaces pills with date inputs when Custom is selected", async () => {
    const user = userEvent.setup();
    const onPeriodChange = vi.fn();

    render(
      <InspectionReportPeriodPicker
        {...baseProps}
        period={defaultInspectionReportPeriod()}
        onPeriodChange={onPeriodChange}
      />
    );

    await user.click(screen.getByRole("radio", { name: "Custom" }));

    expect(onPeriodChange).toHaveBeenCalledWith(expect.objectContaining({ preset: "custom" }));
    expect(screen.queryByRole("radio", { name: "Custom" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("clears custom dates and selects All time when Clear is clicked", async () => {
    const user = userEvent.setup();

    function ControlledPicker() {
      const [period, setPeriod] = useState({
        preset: "custom" as const,
        customFrom: "2026-01-01",
        customTo: "2026-01-31",
      });

      return (
        <InspectionReportPeriodPicker
          {...baseProps}
          period={period}
          onPeriodChange={setPeriod}
        />
      );
    }

    render(<ControlledPicker />);

    await user.click(screen.getByRole("radio", { name: "Custom" }));
    expect(screen.getByLabelText("From")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByRole("radio", { name: "All time" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });
});
