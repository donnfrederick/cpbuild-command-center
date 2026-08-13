import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectNavigationTransition } from "@/components/projects/ProjectNavigationTransition";

let mockPathname = "/projects";
let mockPendingProject: { id: string; projectName: string } | null = null;

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => {
    if (key === "tabOverview") return "Overview";
    if (key === "tabLog") return "Reports";
    if (key === "hubOverviewLoading") return "Loading project overview…";
    if (key === "backToProjects") return "Exit Project";
    if (key === "projectContextBarAria") return "Project context";
    return key;
  },
}));

vi.mock("@/components/projects/ProjectTopBar", () => ({
  ProjectTopBar: ({ projectName }: { projectName: string }) => (
    <header data-testid="project-top-bar">{projectName}</header>
  ),
}));

vi.mock("@/components/navigation/navigation-pending-provider", () => ({
  isProjectWorkspacePath: (pathname: string, projectId: string) =>
    pathname === `/projects/${projectId}` || pathname.startsWith(`/projects/${projectId}/`),
  useOptionalNavigationPending: () =>
    mockPendingProject
      ? {
          pendingProject: mockPendingProject,
          startProjectNavigation: vi.fn(),
          clearProjectNavigation: vi.fn(),
          isPending: false,
          startNavigation: vi.fn(),
        }
      : null,
}));

describe("ProjectNavigationTransition", () => {
  beforeEach(() => {
    mockPathname = "/projects";
    mockPendingProject = null;
  });

  it("renders nothing when no project navigation is pending", () => {
    render(<ProjectNavigationTransition />);
    expect(screen.queryByText("Alpha Tower")).not.toBeInTheDocument();
    expect(document.getElementById("project-navigation-transition")).toBeNull();
  });

  it("shows project shell overlay while pending and still on the list route", () => {
    mockPendingProject = { id: "p1", projectName: "Alpha Tower" };
    render(<ProjectNavigationTransition />);

    expect(document.getElementById("project-navigation-transition")).toBeTruthy();
    expect(screen.getByText("Alpha Tower")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("hides overlay once pathname reaches the target project workspace", () => {
    mockPendingProject = { id: "p1", projectName: "Alpha Tower" };
    mockPathname = "/projects/p1";
    render(<ProjectNavigationTransition />);

    expect(document.getElementById("project-navigation-transition")).toBeNull();
  });
});
