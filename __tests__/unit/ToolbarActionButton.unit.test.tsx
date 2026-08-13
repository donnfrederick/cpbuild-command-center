import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Filter } from "lucide-react";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";

describe("ToolbarActionButton", () => {
  it("uses aria-label without a native title tooltip", () => {
    render(
      <ToolbarActionButton
        icon={<Filter size={14} aria-hidden />}
        tooltip="Filter inspection reports"
        onClick={() => undefined}
      />,
    );

    const button = screen.getByRole("button", { name: "Filter inspection reports" });
    expect(button).not.toHaveAttribute("title");
  });

  it("prefers an explicit ariaLabel over tooltip", () => {
    render(
      <ToolbarActionButton
        icon={<Filter size={14} aria-hidden />}
        tooltip="Filter inspection reports"
        ariaLabel="Open filters"
        onClick={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Open filters" })).toBeInTheDocument();
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <ToolbarActionButton
        icon={<Filter size={14} aria-hidden />}
        ariaLabel="Filter"
        onClick={onClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the filter variant class for canvas filter triggers", () => {
    render(
      <ToolbarActionButton
        variant="filter"
        icon={<Filter size={14} aria-hidden />}
        ariaLabel="Filter"
        onClick={() => undefined}
      />,
    );

    const button = screen.getByRole("button", { name: "Filter" });
    expect(button).toHaveClass("toolbar-action--filter");
    expect(button).toHaveClass("toolbar-action--icon-only");
  });

  it("applies the filter-surface variant on light backgrounds", () => {
    render(
      <ToolbarActionButton
        variant="filter-surface"
        icon={<Filter size={14} aria-hidden />}
        ariaLabel="Filter"
        onClick={() => undefined}
      />,
    );

    const button = screen.getByRole("button", { name: "Filter" });
    expect(button).toHaveClass("toolbar-action--filter-surface");
  });
});
