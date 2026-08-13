import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectSettingsShell } from "@/components/project-settings/ProjectSettingsShell";
import { buildProjectSettingsTabs } from "@/lib/project-settings/tabs";

const pathname = vi.hoisted(() => ({ current: "/project-settings/issue-config" }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname.current,
}));

const messages = {
  projectSettings: {
    pageTitle: "Report Config",
    pageSubtitle: "Configure field-report options used across projects.",
    tabsAria: "Project settings sections",
    issueConfig: "Issue config",
    observationConfig: "Observation config",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("buildProjectSettingsTabs()", () => {
  it("returns issue and observation tabs when user can manage issue report config", () => {
    const tabs = buildProjectSettingsTabs({ canManageIssueReportConfig: true });
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.id)).toEqual(["issue-config", "observation-config"]);
  });

  it("returns no tabs when user lacks manage permission", () => {
    expect(buildProjectSettingsTabs({ canManageIssueReportConfig: false })).toEqual([]);
  });
});

describe("ProjectSettingsShell", () => {
  const tabs = buildProjectSettingsTabs({ canManageIssueReportConfig: true });

  it("renders page title and tab links", () => {
    render(
      <ProjectSettingsShell tabs={tabs}>
        <div>Child content</div>
      </ProjectSettingsShell>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("heading", { name: "Report Config" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Project settings sections" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Issue config" })).toHaveAttribute(
      "href",
      "/project-settings/issue-config",
    );
    expect(screen.getByRole("link", { name: "Observation config" })).toHaveAttribute(
      "href",
      "/project-settings/observation-config",
    );
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("marks the active tab with aria-current", () => {
    pathname.current = "/project-settings/issue-config";
    render(
      <ProjectSettingsShell tabs={tabs}>
        <div />
      </ProjectSettingsShell>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("link", { name: "Issue config" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Observation config" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
