import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ReportsOfflineGuard } from "@/components/reports/ReportsOfflineGuard";

const mockReplace = vi.fn();
const mockToastInfo = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ReportsOfflineGuard", () => {
  beforeEach(() => {
    mockIsOnline.current = true;
    mockReplace.mockReset();
    mockToastInfo.mockReset();
  });

  it("renders children when online", () => {
    const { getByText } = render(
      <ReportsOfflineGuard>
        <span>Report content</span>
      </ReportsOfflineGuard>,
      { wrapper: Wrapper },
    );
    expect(getByText("Report content")).toBeDefined();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to projects and hides children when offline", async () => {
    mockIsOnline.current = false;
    const { queryByText } = render(
      <ReportsOfflineGuard>
        <span>Report content</span>
      </ReportsOfflineGuard>,
      { wrapper: Wrapper },
    );
    expect(queryByText("Report content")).toBeNull();
    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith("Reports need an internet connection.");
      expect(mockReplace).toHaveBeenCalledWith("/projects");
    });
  });
});
