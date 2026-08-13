import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/projects/ProjectsTable", () => ({
  ProjectsTable: () => <div data-testid="projects-table" />,
}));
import { NextIntlClientProvider } from "next-intl";
import { ProjectsPageClient } from "@/components/projects/ProjectsPageClient";
import type { Project } from "@/lib/projects";

const messages = {
  projects: {
    title: "Projects",
    allActiveHistorical: "All active and historical construction projects.",
    addProject: "Add Project",
    unifierUnavailableBanner:
      "Unifier project data is temporarily unavailable. Showing saved projects only.",
  },
};

const sampleProject: Project = {
  id: "p1",
  projectName: "Tower A",
  siteLocation: "Austin, TX",
  status: "Active",
  lifecycleStatus: "Active",
  startDate: null,
  installManagerId: null,
  installManagerName: null,
  projectManagerId: null,
  projectManagerName: "Pat",
  unifierPid: "1",
  unifierProjectNumber: "CP-1",
  scopeTypes: [],
  isTestProject: false,
  clonedFromProjectId: null,
  clonedFromProjectName: null,
  clonedAt: null,
};

function renderClient(unifierUnavailable: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectsPageClient
        initialProjects={[sampleProject]}
        unifierUnavailable={unifierUnavailable}
        canCreate={false}
        canDelete={false}
        title="Projects"
        subtitle="All active and historical construction projects."
        addLabel="Add Project"
      />
    </NextIntlClientProvider>
  );
}

describe("ProjectsPageClient", () => {
  it("shows Unifier unavailable banner when unifierUnavailable is true", () => {
    renderClient(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unifier project data is temporarily unavailable"
    );
  });

  it("hides Unifier unavailable banner when Unifier is available", () => {
    renderClient(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
