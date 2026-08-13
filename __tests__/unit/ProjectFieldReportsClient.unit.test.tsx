import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  ProjectFieldReportsClient,
  fieldReportsLocationsHintStorageKey,
} from "@/components/projects/ProjectFieldReportsClient";

const mockPathname = vi.fn(() => "/projects/p1/field-reports");

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname(),
}));

vi.mock("@/components/projects/IssuesLogClient", () => ({
  IssuesLogClient: () => <div data-testid="issues-log">Issues log</div>,
}));

vi.mock("@/components/projects/ObservationsLogClient", () => ({
  ObservationsLogClient: () => <div data-testid="observations-log">Observations log</div>,
}));

const messages = {
  projects: {
    fieldReports: {
      tabsAria: "Field reports",
      tabIssues: "Issues",
      tabObservations: "Observations",
      addFromLocationsHint:
        "To add an issue or observation, go to <link>Locations</link> and add it to that location.",
      dismissLocationsHint: "Hide message",
    },
  },
};

function renderClient(pathname = "/projects/p1/field-reports") {
  mockPathname.mockReturnValue(pathname);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectFieldReportsClient
        projectId="p1"
        currentUserId="user-1"
        currentUserRole="ADMIN"
        canManageStatus
      />
    </NextIntlClientProvider>,
  );
}

describe("ProjectFieldReportsClient", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an amber hint to add issues and observations from Locations", async () => {
    renderClient();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(
      /To add an issue or observation, go to Locations and add it to that location/i,
    );
    expect(note).toHaveStyle({ backgroundColor: "var(--warning-100)" });
    expect(screen.getByRole("link", { name: "Locations" })).toHaveAttribute(
      "href",
      "/projects/p1/units",
    );
  });

  it("hides the hint when the user dismisses it and remembers the choice", async () => {
    renderClient();
    const dismiss = await screen.findByRole("button", { name: "Hide message" });
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });

    expect(
      localStorage.getItem(fieldReportsLocationsHintStorageKey("user-1", "p1")),
    ).toBe("1");
  });

  it("does not show the hint when previously dismissed", async () => {
    localStorage.setItem(fieldReportsLocationsHintStorageKey("user-1", "p1"), "1");
    renderClient();

    await waitFor(() => {
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  it("renders issues log on the issues tab", async () => {
    renderClient("/projects/p1/field-reports");
    expect(await screen.findByTestId("issues-log")).toBeInTheDocument();
    expect(screen.queryByTestId("observations-log")).not.toBeInTheDocument();
  });

  it("renders observations log on the observations tab", async () => {
    renderClient("/projects/p1/field-reports/observations");
    expect(await screen.findByTestId("observations-log")).toBeInTheDocument();
    expect(screen.queryByTestId("issues-log")).not.toBeInTheDocument();
  });
});
