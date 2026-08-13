import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ReportsHubClient } from "@/components/reports/ReportsHubClient";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  globalReports: {
    hubTitle: "Reports",
    hubSubtitle: "Cross-project reports and activity logs.",
    activity: "Activity",
    activityDesc: "Timeline of actions across all projects.",
    progress: "Global Progress Report",
    progressDesc: "Portfolio-wide level and scope progress.",
    inspections: "Inspections",
    inspectionsDesc: "Clear inspections across all projects.",
    fieldDaily: "Field Daily Report",
    fieldDailyDesc: "Install managers' daily field activity reports.",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ReportsHubClient", () => {
  it("renders hub title and subtitle", () => {
    render(<ReportsHubClient />, { wrapper: Wrapper });
    expect(screen.getByRole("heading", { name: "Reports" })).toBeDefined();
    expect(screen.getByText("Cross-project reports and activity logs.")).toBeDefined();
  });

  it("lists all registry reports as tile cards with correct hrefs", () => {
    const { container } = render(<ReportsHubClient />, { wrapper: Wrapper });
    const hrefs = Array.from(container.querySelectorAll("a.report-card")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toEqual([
      "/reports/activity",
      "/reports/progress",
      "/reports/inspections",
      "/reports/field-daily",
    ]);
    expect(container.querySelector(".report-card--activity")).toBeTruthy();
    expect(container.querySelector(".report-card--progress")).toBeTruthy();
    expect(container.querySelector(".report-card--inspections")).toBeTruthy();
    expect(container.querySelector(".report-card--field-daily")).toBeTruthy();
  });
});
