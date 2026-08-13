import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SideNav } from "@/components/layout/SideNav";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: () => "/projects",
}));

vi.mock("@/components/reports/ReportsNavSection", () => ({
  ReportsNavSection: () => <div data-testid="reports-nav-section" />,
}));

const messages = {
  nav: {
    mainNav: "Main navigation",
    sectionMain: "Main",
    sectionProjectSettings: "Project Settings",
    sectionSystem: "System",
    projects: "Projects",
    forms: "Form Builder",
    projectSettings: "Report Config",
    users: "Users",
  },
  feedback: { navLabel: "Feedback" },
  adminStatus: { title: "Status" },
  morningBriefing: { navLabel: "Morning Briefing" },
  apiKeys: { navLabel: "API Keys" },
  biDocs: { navLabel: "BI Docs" },
  roleManager: { navLabel: "Roles" },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("SideNav", () => {
  it("omits Project Settings section when user has no settings permissions", () => {
    render(<SideNav />, { wrapper: Wrapper });
    expect(screen.queryByText("Form Builder")).toBeNull();
    const reportConfigLinks = screen.queryAllByRole("link", { name: "Report Config" });
    expect(reportConfigLinks).toHaveLength(0);
  });

  it("renders Form Builder under Project Settings when canManageForms is true", () => {
    render(<SideNav canManageForms />, { wrapper: Wrapper });
    expect(screen.getByText("Form Builder")).toBeDefined();
    expect(screen.queryAllByRole("link", { name: "Report Config" })).toHaveLength(0);
  });

  it("links Form Builder to /forms when canManageForms is true", () => {
    const { container } = render(<SideNav canManageForms />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/forms");
  });

  it("renders Report Config hub link when canManageIssueReportConfig is true", () => {
    render(<SideNav canManageIssueReportConfig />, { wrapper: Wrapper });
    expect(screen.getByRole("link", { name: "Report Config" })).toBeDefined();
    expect(screen.queryByText("Form Builder")).toBeNull();
  });

  it("links Report Config hub to /project-settings", () => {
    const { container } = render(<SideNav canManageIssueReportConfig />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/project-settings");
  });

  it("lists Form Builder above Report Config when both permissions are granted", () => {
    const { container } = render(
      <SideNav canManageForms canManageIssueReportConfig />,
      { wrapper: Wrapper },
    );
    const labels = Array.from(container.querySelectorAll("a span")).map((el) => el.textContent);
    const formsIdx = labels.indexOf("Form Builder");
    const settingsIdx = labels.indexOf("Report Config");
    expect(formsIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeGreaterThan(formsIdx);
  });
});
