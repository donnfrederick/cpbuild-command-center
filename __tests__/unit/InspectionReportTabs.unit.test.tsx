import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InspectionReportTabs } from "@/components/reports/InspectionReportTabs";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    namespace === "globalReports.inspectionDeficiencies" ? `def:${key}` : key,
}));

const mockPathname = vi.fn(() => "/reports/inspections");

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

describe("InspectionReportTabs", () => {
  it("marks inspection log link active on /reports/inspections", () => {
    mockPathname.mockReturnValue("/reports/inspections");
    render(<InspectionReportTabs />);

    expect(screen.getByRole("link", { name: "tabLog" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "tabPassFail" })).not.toHaveAttribute("aria-current");
  });

  it("marks pass/fail link active on /reports/inspections/pass-fail", () => {
    mockPathname.mockReturnValue("/reports/inspections/pass-fail");
    render(<InspectionReportTabs />);

    expect(screen.getByRole("link", { name: "tabPassFail" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "tabLog" })).not.toHaveAttribute("aria-current");
  });

  it("marks deficiencies link active on /reports/inspections/deficiencies", () => {
    mockPathname.mockReturnValue("/reports/inspections/deficiencies");
    render(<InspectionReportTabs />);

    expect(screen.getByRole("link", { name: "def:tabDeficiencies" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
