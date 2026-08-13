import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { BulkActionsBar } from "@/components/projects/BulkActionsBar";

const MESSAGES = {
  units: {
    exitSelectMode: "Cancel",
    selectedCount: "{count} selected",
    selectAll: "Select all ({count})",
    bulkActionsPlaceholder: "Actions",
  },
};

function renderBar(props: Partial<React.ComponentProps<typeof BulkActionsBar>> = {}) {
  const defaultProps = {
    selectedCount: 2,
    totalFilteredCount: 10,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onCancel: vi.fn(),
    onActionsOpen: vi.fn(),
    mobile: false,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <BulkActionsBar {...defaultProps} {...props} />
    </NextIntlClientProvider>
  );
}

describe("BulkActionsBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("desktop (mobile=false)", () => {
    it("renders selected count", () => {
      renderBar({ selectedCount: 3, mobile: false });
      expect(screen.getByText("3 selected")).toBeTruthy();
    });

    it("renders Select All checkbox with total count", () => {
      renderBar({ selectedCount: 2, totalFilteredCount: 10, mobile: false });
      expect(screen.getByRole("checkbox", { name: /select all \(10\)/i })).toBeTruthy();
    });

    it("calls onCancel when Cancel is clicked", async () => {
      const onCancel = vi.fn();
      renderBar({ onCancel, mobile: false });
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("calls onSelectAll when Select All checkbox is clicked while not all selected", async () => {
      const onSelectAll = vi.fn();
      renderBar({ onSelectAll, selectedCount: 2, totalFilteredCount: 10, mobile: false });
      await userEvent.click(screen.getByRole("checkbox", { name: /select all/i }));
      expect(onSelectAll).toHaveBeenCalledOnce();
    });

    it("shows checkbox as checked when all are selected", () => {
      renderBar({ selectedCount: 10, totalFilteredCount: 10, mobile: false });
      const checkbox = screen.getByRole("checkbox", { name: /select all/i });
      expect(checkbox.getAttribute("aria-checked")).toBe("true");
    });

    it("calls onDeselectAll when checkbox clicked while all are selected", async () => {
      const onDeselectAll = vi.fn();
      renderBar({ selectedCount: 10, totalFilteredCount: 10, onDeselectAll, mobile: false });
      await userEvent.click(screen.getByRole("checkbox", { name: /select all/i }));
      expect(onDeselectAll).toHaveBeenCalledOnce();
    });

    it("renders disabled Actions button when selectedCount is 0", () => {
      renderBar({ mobile: false, selectedCount: 0 });
      const actionsBtn = screen.getByRole("button", { name: /actions/i });
      expect(actionsBtn).toBeDisabled();
    });

    it("renders enabled Actions button when selectedCount > 0", () => {
      renderBar({ mobile: false, selectedCount: 3 });
      const actionsBtn = screen.getByRole("button", { name: /actions/i });
      expect(actionsBtn).not.toBeDisabled();
    });

    it("calls onActionsOpen when Actions button is clicked with selections", async () => {
      const onActionsOpen = vi.fn();
      renderBar({ mobile: false, selectedCount: 3, onActionsOpen });
      await userEvent.click(screen.getByRole("button", { name: /actions/i }));
      expect(onActionsOpen).toHaveBeenCalledOnce();
    });
  });

  describe("mobile (mobile=true)", () => {
    it("renders selected count via portal", async () => {
      const { unmount } = renderBar({ selectedCount: 5, mobile: true });
      // Component defers mount via queueMicrotask — wait for portal content
      await waitFor(() => expect(document.body.textContent).toContain("5 selected"));
      unmount();
    });

    it("calls onCancel when Cancel is clicked (mobile)", async () => {
      const onCancel = vi.fn();
      const { unmount } = renderBar({ onCancel, mobile: true });
      // Component defers mount via queueMicrotask — wait before interacting
      await waitFor(() => expect(document.querySelector("[aria-label='Cancel']")).toBeTruthy());
      await userEvent.click(document.querySelector("[aria-label='Cancel']")!);
      expect(onCancel).toHaveBeenCalledOnce();
      unmount();
    });

    it("calls onSelectAll when Select All checkbox is clicked (mobile)", async () => {
      const onSelectAll = vi.fn();
      const { unmount } = renderBar({ onSelectAll, selectedCount: 0, mobile: true });
      // Component defers mount via queueMicrotask — wait before interacting
      await waitFor(() => expect(document.querySelector("[role='checkbox']")).toBeTruthy());
      await userEvent.click(document.querySelector("[role='checkbox']")!);
      expect(onSelectAll).toHaveBeenCalledOnce();
      unmount();
    });
  });
});
