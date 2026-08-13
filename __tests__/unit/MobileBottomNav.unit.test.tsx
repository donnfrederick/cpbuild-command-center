import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

// The nav uses display:none by default (shown via CSS on real mobile).
// We query with { hidden: true } to reach hidden elements, and use
// container.querySelector for href checks.

let mockPathname = "/";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
}));

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
    mainNav: "Main navigation",
    dashboard: "Dashboard",
    projects: "Projects",
    reports: "Reports",
    activityLog: "Activity",
    forms: "Form Builder",
    users: "Users",
  },
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

describe("MobileBottomNav", () => {
  beforeEach(() => {
    mockIsOnline.current = true;
    mockToastInfo.mockReset();
  });

  it("blocks Reports nav tap when offline and shows toast", () => {
    mockIsOnline.current = false;
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const reportsLink = container.querySelector("a[href='/reports']");
    expect(reportsLink?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(reportsLink!);
    expect(mockToastInfo).toHaveBeenCalledWith("Reports need an internet connection.");
  });

  it("renders a nav element with id 'mobile-bottom-nav'", () => {
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    expect(container.querySelector("#mobile-bottom-nav")).toBeTruthy();
  });

  it("renders Projects, Reports, and Users by default (no Form Builder without permission)", () => {
    render(<MobileBottomNav />, { wrapper: Wrapper });
    expect(screen.getByText("Projects", { selector: "span" })).toBeDefined();
    expect(screen.getByText("Reports", { selector: "span" })).toBeDefined();
    expect(screen.queryByText("Form Builder", { selector: "span" })).toBeNull();
    expect(screen.getByText("Users", { selector: "span" })).toBeDefined();
  });

  it("renders Form Builder when canManageForms is true", () => {
    render(<MobileBottomNav canManageForms />, { wrapper: Wrapper });
    expect(screen.getByText("Form Builder", { selector: "span" })).toBeDefined();
  });

  it("renders links with correct hrefs when canManageForms is true", () => {
    const { container } = render(<MobileBottomNav canManageForms />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/projects");
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/forms");
    expect(hrefs).toContain("/users");
  });

  // ── Product invariant: feedback NEVER lives in the mobile bottom nav.
  // It belongs only in the profile-icon menu (MobileAccountPanel). See
  // docs/design/NAV_INVARIANTS.md. This test is a guardrail — if it ever
  // fails, DO NOT "fix" it by removing the assertion; fix the component
  // that regressed.
  it("DOES NOT include the feedback page in the bottom nav (invariant)", () => {
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/feedback");
    expect(screen.queryByText("Feedback", { selector: "span" })).toBeNull();
  });

  it("omits Users when canViewUsers is false", () => {
    const { container } = render(<MobileBottomNav canViewUsers={false} />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/users");
  });

  it("renders three links by default (Projects, Reports, Users)", () => {
    mockPathname = "/";
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    expect(container.querySelectorAll("a")).toHaveLength(3);
  });

  it("renders four links when Form Builder and Users are shown", () => {
    mockPathname = "/";
    const { container } = render(<MobileBottomNav canManageForms />, { wrapper: Wrapper });
    expect(container.querySelectorAll("a")).toHaveLength(4);
  });

  it("renders two links when users and Form Builder are hidden", () => {
    mockPathname = "/";
    const { container } = render(<MobileBottomNav canViewUsers={false} />, { wrapper: Wrapper });
    expect(container.querySelectorAll("a")).toHaveLength(2);
  });

  it("renders three links when users are hidden but Form Builder is shown", () => {
    mockPathname = "/";
    const { container } = render(
      <MobileBottomNav canViewUsers={false} canManageForms />,
      { wrapper: Wrapper },
    );
    expect(container.querySelectorAll("a")).toHaveLength(3);
  });

  it("marks reports as active when on /reports/activity", () => {
    mockPathname = "/reports/activity";
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const activeLink = container.querySelector("a[aria-current='page']");
    expect(activeLink).toBeTruthy();
    expect(activeLink!.getAttribute("href")).toBe("/reports");
  });

  it("marks projects as active when on /projects path", () => {
    mockPathname = "/projects";
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const activeLink = container.querySelector("a[aria-current='page']");
    expect(activeLink).toBeTruthy();
    expect(activeLink!.getAttribute("href")).toBe("/projects");
  });

  it("marks projects as active on a nested projects route", () => {
    mockPathname = "/projects/some-project-id";
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const activeLinks = container.querySelectorAll("a[aria-current='page']");
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0].getAttribute("href")).toBe("/projects");
  });

  it("marks no item active on an unmatched route", () => {
    mockPathname = "/settings";
    const { container } = render(<MobileBottomNav />, { wrapper: Wrapper });
    const activeLinks = container.querySelectorAll("a[aria-current='page']");
    expect(activeLinks).toHaveLength(0);
  });
});
