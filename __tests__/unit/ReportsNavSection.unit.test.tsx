import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ReportsNavSection } from "@/components/reports/ReportsNavSection";

let mockPathname = "/projects";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: () => mockPathname,
}));

const mockIsOnline = vi.hoisted(() => ({ current: true }));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: mockIsOnline.current, wasOffline: false }),
}));

const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: { info: (...args: unknown[]) => mockToastInfo(...args) },
}));

const messages = {
  nav: {
    reports: "Reports",
    reportsSubmenu: "Expand Reports menu",
  },
  globalReports: {
    activity: "Activity",
    progress: "Global Progress Report",
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

describe("ReportsNavSection", () => {
  beforeEach(() => {
    mockPathname = "/projects";
    mockIsOnline.current = true;
    mockToastInfo.mockReset();
  });

  it("renders Reports parent link to hub", () => {
    const { container } = render(<ReportsNavSection />, { wrapper: Wrapper });
    const parent = container.querySelector("a[href='/reports']");
    expect(parent).toBeTruthy();
    expect(parent!.textContent).toContain("Reports");
  });

  it("auto-expands and marks Activity active on /reports/activity", () => {
    mockPathname = "/reports/activity";
    const { container } = render(<ReportsNavSection />, { wrapper: Wrapper });
    expect(screen.getByText("Activity")).toBeDefined();
    const activityLink = container.querySelector("a[href='/reports/activity']");
    expect(activityLink?.getAttribute("aria-current")).toBe("page");
  });

  it("blocks Reports hub link when offline", () => {
    mockIsOnline.current = false;
    const { container } = render(<ReportsNavSection />, { wrapper: Wrapper });
    const parent = container.querySelector("a[href='/reports']");
    expect(parent?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(parent!);
    expect(mockToastInfo).toHaveBeenCalledWith("Reports need an internet connection.");
  });

  it("toggles submenu with chevron button", () => {
    mockPathname = "/projects";
    render(<ReportsNavSection />, { wrapper: Wrapper });
    expect(screen.queryByText("Activity")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Reports menu" }));
    expect(screen.getByText("Activity")).toBeDefined();
    expect(screen.getByText("Global Progress Report")).toBeDefined();
  });
});
