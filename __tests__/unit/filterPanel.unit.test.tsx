import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FilterChip,
  FilterPanelCheckboxRow,
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
  FilterPanelSummaryStat,
  FilterPill,
} from "@/components/shared/filterPanel";

describe("FilterPanelShell", () => {
  it("renders title, body, and footer actions", async () => {
    const onClose = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup();

    render(
      <FilterPanelShell
        title="Filter Locations"
        subtitle="Customize which locations you see"
        closeAriaLabel="Close filter panel"
        onClose={onClose}
        footer={(close) => (
          <FilterPanelFooterActions
            clearLabel="Clear all"
            applyLabel="Done"
            onClear={onClear}
            onApply={close}
          />
        )}
      >
        <p>Filter body</p>
      </FilterPanelShell>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Filter Locations")).toBeInTheDocument();
    expect(screen.getByText("Customize which locations you see")).toBeInTheDocument();
    expect(screen.getByText("Filter body")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("FilterChip", () => {
  it("applies active class when selected", () => {
    render(<FilterChip label="CABIU" active onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "CABIU" })).toHaveClass("filter-panel-chip--active");
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<FilterChip label="TOPIU" active={false} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "TOPIU" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("FilterPill", () => {
  it("applies active class when selected", () => {
    render(<FilterPill label="In Staging" active onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "In Staging" })).toHaveClass(
      "filter-panel-pill--active",
    );
  });
});

describe("FilterPanelSection", () => {
  it("renders a navy section header label", () => {
    render(
      <FilterPanelSection label="Location Issues">
        <p>Body</p>
      </FilterPanelSection>,
    );
    const label = screen.getByText("Location Issues");
    expect(label).toHaveClass("filter-panel-section__label");
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("collapses section body by default when collapsible", () => {
    render(
      <FilterPanelSection label="Media type" collapsible>
        <p>Observations</p>
      </FilterPanelSection>,
    );
    expect(screen.queryByText("Observations")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Media type" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("expands collapsible section on header click", async () => {
    const user = userEvent.setup();
    render(
      <FilterPanelSection label="Media type" collapsible>
        <p>Observations</p>
      </FilterPanelSection>,
    );
    await user.click(screen.getByRole("button", { name: "Media type" }));
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Media type" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows active count badge when collapsed with selections", () => {
    render(
      <FilterPanelSection label="Media type" collapsible activeCount={2}>
        <p>Observations</p>
      </FilterPanelSection>,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("FilterChip variants", () => {
  it("applies blocking variant class when selected", () => {
    render(
      <FilterChip label="Blocking" active variant="blocking" onClick={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Blocking" })).toHaveClass(
      "filter-panel-chip--blocking",
      "filter-panel-chip--active",
    );
  });
});

describe("FilterPanelCheckboxRow", () => {
  it("toggles via click", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<FilterPanelCheckboxRow label="Level 1" checked={false} onToggle={onToggle} />);
    await user.click(screen.getByRole("checkbox", { name: "Level 1" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
describe("FilterPanelSummaryStat", () => {
  it("uses plain text when showing all results", () => {
    render(
      <FilterPanelSummaryStat filtered={747} total={747} label="747 of 747 locations" />,
    );
    const stat = screen.getByText("747 of 747 locations");
    expect(stat).toHaveClass("filter-panel-summary__stat");
    expect(stat).not.toHaveClass("filter-panel-summary__stat--filtered");
  });

  it("highlights the full stat when filtered count is lower", () => {
    render(
      <FilterPanelSummaryStat filtered={120} total={747} label="120 of 747 locations" />,
    );
    expect(screen.getByText("120 of 747 locations")).toHaveClass(
      "filter-panel-summary__stat--filtered",
    );
  });
});

describe("FilterPanelFooterActions", () => {
  it("disables clear when clearDisabled is true", () => {
    render(
      <FilterPanelFooterActions
        clearLabel="Clear all"
        applyLabel="Done"
        onClear={() => undefined}
        onApply={() => undefined}
        clearDisabled
      />,
    );

    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });
});
