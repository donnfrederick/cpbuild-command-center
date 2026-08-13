import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/reports/activity/by-project",
}));

import { ProjectActivityReportClient } from "@/components/reports/ProjectActivityReportClient";
import type { ProjectActivityRow } from "@/lib/reports/project-activity-types";

const MESSAGES = {
  dashboardActivity: {
    byProjectTitle: "Project activity",
    byProjectSubtitle: "Subtitle",
    byProjectSearchPlaceholder: "Search by project name…",
    byProjectSearchAria: "Search projects",
    byProjectSearchClear: "Clear search",
    byProjectPeriodLabel: "Date range",
    byProjectColumnProject: "Project",
    byProjectColumnActivity: "Activity",
    byProjectSortActivityAria: "Sort by activity level",
    byProjectPeopleFilterAria: "Filter by project manager or install manager",
    byProjectFiltersAria: "Project activity filters",
    byProjectEventCount: "{count, number}",
    byProjectEmptyFilter: "No projects match your filters.",
    byProjectCountSummary: "{count, plural, one {# project} other {# projects}}",
    byProjectCountFilteredSummary: "{filtered} of {total} {total, plural, one {project} other {projects}}",
    byProjectPmSection: "Project managers",
    byProjectImSection: "Install managers",
    closeFilterPanel: "Close filter panel",
    filterDone: "Done",
  },
  globalReports: {
    portfolioProgress: {
      period1w: "1 week",
      period2w: "2 weeks",
      period30d: "30 days",
      periodAll: "All time",
      periodCustom: "Custom",
      customFrom: "From",
      customTo: "To",
      customRangeError: "Invalid range",
      periodRangeSummary: "{from} to {to}",
      filterPeopleTitle: "People",
      filterPeopleSubtitle: "Filter by role",
      filterPeopleClear: "Clear",
      filterUnassigned: "Unassigned",
    },
  },
};

const ROWS: ProjectActivityRow[] = [
  {
    id: "p1",
    name: "River Tower",
    count: 42,
    projectManagerName: "Alice PM",
    installManagerName: "Bob IM",
  },
  {
    id: "p2",
    name: "Oak Plaza",
    count: 18,
    projectManagerName: "Alice PM",
    installManagerName: "",
  },
];

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ProjectActivityReportClient", () => {
  it("shows total project count when unfiltered", () => {
    render(
      <Wrapper>
        <ProjectActivityReportClient rows={ROWS} period={{ preset: "all" }} />
      </Wrapper>,
    );
    expect(screen.getByTestId("activity-list-count")).toHaveTextContent("2 projects");
  });

  it("shows filtered project count when search narrows the list", () => {
    render(
      <Wrapper>
        <ProjectActivityReportClient rows={ROWS} period={{ preset: "all" }} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByPlaceholderText("Search by project name…"), {
      target: { value: "river" },
    });
    expect(screen.getByTestId("activity-list-count")).toHaveTextContent("1 of 2 projects");
  });
});
