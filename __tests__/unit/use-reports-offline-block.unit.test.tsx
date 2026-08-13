import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useReportsOfflineBlock } from "@/hooks/use-reports-offline-block";

const mockToastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: { info: (...args: unknown[]) => mockToastInfo(...args) },
}));

const mockIsOnline = vi.hoisted(() => ({ current: true }));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: mockIsOnline.current, wasOffline: false }),
}));

const messages = {
  globalReports: {
    offlineUnavailable: "Reports need an internet connection.",
  },
};

function Probe() {
  const { isReportsNavBlocked, onReportsNavClick } = useReportsOfflineBlock();
  return (
    <button type="button" onClick={onReportsNavClick} data-blocked={isReportsNavBlocked}>
      Reports
    </button>
  );
}

describe("useReportsOfflineBlock()", () => {
  beforeEach(() => {
    mockIsOnline.current = true;
    mockToastInfo.mockReset();
  });

  it("does not block nav clicks when online", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Probe />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByRole("button", { name: "Reports" });
    expect(btn.getAttribute("data-blocked")).toBe("false");
    fireEvent.click(btn);
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("blocks nav clicks and shows toast when offline", () => {
    mockIsOnline.current = false;
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Probe />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByRole("button", { name: "Reports" });
    expect(btn.getAttribute("data-blocked")).toBe("true");
    fireEvent.click(btn, { cancelable: true });
    expect(mockToastInfo).toHaveBeenCalledWith("Reports need an internet connection.");
  });
});
