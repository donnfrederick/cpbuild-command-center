import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityReportTabs } from "@/components/reports/ActivityReportTabs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockPathname = vi.fn(() => "/reports/activity");

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    "aria-current"?: "page";
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname(),
}));

describe("ActivityReportTabs", () => {
  it("marks activity log link active on /reports/activity", () => {
    mockPathname.mockReturnValue("/reports/activity");
    render(<ActivityReportTabs />);

    expect(screen.getByRole("link", { name: "tabLog" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "tabByUser" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "tabByProject" })).not.toHaveAttribute("aria-current");
  });

  it("marks user activity link active on /reports/activity/by-user", () => {
    mockPathname.mockReturnValue("/reports/activity/by-user");
    render(<ActivityReportTabs />);

    expect(screen.getByRole("link", { name: "tabByUser" })).toHaveAttribute("aria-current", "page");
  });

  it("marks project activity link active on /reports/activity/by-project", () => {
    mockPathname.mockReturnValue("/reports/activity/by-project");
    render(<ActivityReportTabs />);

    expect(screen.getByRole("link", { name: "tabByProject" })).toHaveAttribute("aria-current", "page");
  });
});
