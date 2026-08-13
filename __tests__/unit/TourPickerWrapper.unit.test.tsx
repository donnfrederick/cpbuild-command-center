import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TourPickerWrapper } from "@/components/tour/TourPickerWrapper";

vi.mock("@/components/tour/TourPicker", () => ({
  TourPicker: ({ isOpen, userRole, isAdmin }: { isOpen: boolean; userRole?: string; isAdmin?: boolean }) => (
    <div
      data-testid="tour-picker"
      data-open={String(isOpen)}
      data-role={userRole ?? ""}
      data-admin={String(isAdmin ?? false)}
    />
  ),
}));

describe("TourPickerWrapper", () => {
  it("renders TourPicker closed by default", () => {
    render(<TourPickerWrapper />);
    const picker = screen.getByTestId("tour-picker");
    expect(picker).toHaveAttribute("data-open", "false");
  });

  it("passes userRole and isAdmin props to TourPicker", () => {
    render(<TourPickerWrapper userRole="ADMIN" isAdmin={true} />);
    const picker = screen.getByTestId("tour-picker");
    expect(picker).toHaveAttribute("data-role", "ADMIN");
    expect(picker).toHaveAttribute("data-admin", "true");
  });

  it("opens TourPicker when tour-picker:open event is dispatched", () => {
    render(<TourPickerWrapper />);
    act(() => {
      window.dispatchEvent(new CustomEvent("tour-picker:open"));
    });
    expect(screen.getByTestId("tour-picker")).toHaveAttribute("data-open", "true");
  });

  it("toggles TourPicker closed on second event dispatch", () => {
    render(<TourPickerWrapper />);
    act(() => {
      window.dispatchEvent(new CustomEvent("tour-picker:open"));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent("tour-picker:open"));
    });
    expect(screen.getByTestId("tour-picker")).toHaveAttribute("data-open", "false");
  });
});
