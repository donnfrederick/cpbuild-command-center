import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { FieldDailyReportSheet } from "@/components/reports/FieldDailyReportSheet";

vi.mock("@/hooks/use-is-browser", () => ({ useIsBrowser: () => true }));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

describe("FieldDailyReportSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a close button in the header that dismisses the sheet", () => {
    const onClose = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FieldDailyReportSheet
          projectName="Marina Bay"
          reportDate="2026-07-14"
          onClose={onClose}
        >
          <p>Report body</p>
        </FieldDailyReportSheet>
      </NextIntlClientProvider>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
