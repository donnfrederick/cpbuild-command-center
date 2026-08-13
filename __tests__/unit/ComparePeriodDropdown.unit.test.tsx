import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComparePeriodDropdown } from "@/components/reports/ComparePeriodDropdown";
import { defaultComparePeriod } from "@/lib/reports/portfolio-progress-period";

describe("ComparePeriodDropdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the menu and selects a preset", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));

    const onChange = vi.fn();
    render(
      <ComparePeriodDropdown
        idPrefix="test-period"
        ariaLabel="Compare changes over"
        comparePeriod={defaultComparePeriod()}
        onComparePeriodChange={onChange}
        periodPresets={[
          { id: "1w", label: "1 week" },
          { id: "2w", label: "2 weeks" },
          { id: "all", label: "All time" },
          { id: "custom", label: "Custom" },
        ]}
        locale="en"
        customFromLabel="From"
        customToLabel="To"
        customRangeError="Invalid range"
        periodRangeSummary={(from, to) => `${from} to ${to}`}
      />,
    );

    expect(screen.getByText(/5\/27\/26–6\/3\/26/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Compare changes over, 1 week/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2 weeks" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.preset).toBe("2w");

    vi.useRealTimers();
  });

  it("shows custom date inputs when Custom is selected", () => {
    render(
      <ComparePeriodDropdown
        idPrefix="test-period"
        ariaLabel="Compare changes over"
        comparePeriod={{ ...defaultComparePeriod(), preset: "custom" }}
        onComparePeriodChange={vi.fn()}
        periodPresets={[
          { id: "1w", label: "1 week" },
          { id: "custom", label: "Custom" },
        ]}
        locale="en"
        customFromLabel="From"
        customToLabel="To"
        customRangeError="Invalid range"
        periodRangeSummary={(from, to) => `${from} to ${to}`}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Compare changes over, Custom/ }));
    expect(document.getElementById("test-period-from")).toBeDefined();
    expect(document.getElementById("test-period-to")).toBeDefined();
  });
});
