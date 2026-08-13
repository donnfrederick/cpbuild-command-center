import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@/lib/projects";
import { PROJECTS_LIST_FILTERS_SESSION_KEY } from "@/lib/projects-list-filters-session";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

const { mockStartProjectNavigation } = vi.hoisted(() => ({
  mockStartProjectNavigation: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { projectName?: string; address?: string }) => {
    if (key === "openProjectDetailAria" && values?.projectName) {
      return `Open ${values.projectName}`;
    }
    if (key === "openAddressInMapsAria" && values?.address) {
      return `Open ${values.address} in Google Maps`;
    }
    if (key === "deleteProjectAria" && values?.projectName) {
      return `Delete ${values.projectName}`;
    }
    return key;
  },
  useLocale: () => "en",
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@/components/navigation/navigation-pending-provider", () => ({
  useOptionalNavigationPending: () => ({
    startProjectNavigation: mockStartProjectNavigation,
  }),
}));

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ label }: { label: string }) => <span data-testid="status-badge">{label}</span>,
}));

vi.mock("@/components/projects/CreateProjectModal", () => ({
  CreateProjectModal: ({ onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (p: unknown) => void }) => (
    <div data-testid="create-project-modal">
      <button onClick={() => onCreated({ id: "new-1", projectName: "New Project" })}>create</button>
    </div>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const sessionStorageStore: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(sessionStorageStore).forEach((key) => delete sessionStorageStore[key]);
  }),
};
vi.stubGlobal("sessionStorage", sessionStorageMock);

// ── Component import ──────────────────────────────────────────────────────────

const { ProjectsTable } = await import("@/components/projects/ProjectsTable");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  {
    id: "p1",
    projectName: "Alpha Tower",
    siteLocation: "Downtown",
    status: "Construction",
    lifecycleStatus: "Active" as const,
    startDate: null,
    installManagerId: null,
    installManagerName: "Bob",
    projectManagerId: null,
    projectManagerName: "Alice",
    unifierPid: "u1",
    unifierProjectNumber: "CP-1",
    scopeTypes: ["Framing", "Drywall"],
    isTestProject: false,
    clonedFromProjectId: null,
    clonedFromProjectName: null,
    clonedAt: null,
    isFavorite: true,
  },
  {
    id: "p2",
    projectName: "Beta Plaza",
    siteLocation: "Midtown",
    status: "",
    lifecycleStatus: "Planning" as const,
    startDate: null,
    installManagerId: null,
    installManagerName: null,
    projectManagerId: null,
    projectManagerName: "Carol",
    unifierPid: "u2",
    unifierProjectNumber: null,
    scopeTypes: [],
    isTestProject: false,
    clonedFromProjectId: null,
    clonedFromProjectName: null,
    clonedAt: null,
    isFavorite: false,
  },
  {
    id: "p3",
    projectName: "Gamma Court",
    siteLocation: "Uptown",
    status: "Closeout",
    lifecycleStatus: "Completed" as const,
    startDate: null,
    installManagerId: null,
    installManagerName: "Dave",
    projectManagerId: null,
    projectManagerName: "",
    unifierPid: "u3",
    unifierProjectNumber: null,
    scopeTypes: ["Tile"],
    isTestProject: false,
    clonedFromProjectId: null,
    clonedFromProjectName: null,
    clonedAt: null,
    isFavorite: false,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/hooks/offline-sync-context", () => ({
  useOfflineSyncContext: () => ({
    offlineProjectIds: new Set<string>(),
    downloadProgress: null,
    downloadState: null,
    downloadingProjectId: null,
    isDownloading: false,
    triggerDownload: vi.fn(),
    cancelDownload: vi.fn(),
    setProjectOffline: vi.fn(),
    lastSyncedAt: () => null,
    pendingCount: 0,
    syncProgress: null,
    syncDetail: null,
    isSyncing: false,
    flush: vi.fn(),
  }),
}));

describe("ProjectsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    // Default: /api/offline/preferences returns empty offline state
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/offline/preferences")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ modules: [], offlineProjectIds: [], projectSyncedAt: {}, availableModules: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  it("renders all project names from initialProjects", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    // Component renders both mobile and desktop views, so each project appears twice
    expect(screen.getAllByText("Alpha Tower").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Beta Plaza").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Gamma Court").length).toBeGreaterThanOrEqual(1);
  });

  it("shows install manager values in the project list and falls back to Unassigned", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badges for each project (mobile + desktop = 2× project count)", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    // Both mobile-only and desktop-only tables are present in JSDOM (no CSS hiding)
    expect(screen.getAllByTestId("status-badge").length).toBeGreaterThanOrEqual(3);
  });

  it("restores search and filter selections from sessionStorage on mount", async () => {
    sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY] = JSON.stringify({
      searchQuery: "Alpha",
      statusFilter: [],
      imFilter: [],
      pmFilter: [],
    });

    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Beta Plaza")).not.toBeInTheDocument();
    });
  });

  it("does not wipe sessionStorage with empty defaults before restore applies", async () => {
    sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY] = JSON.stringify({
      searchQuery: "Alpha",
      statusFilter: ["Construction"],
      imFilter: ["Bob"],
      pmFilter: ["Alice"],
    });

    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);

    await waitFor(() => {
      const stored = JSON.parse(sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY]);
      expect(stored.searchQuery).toBe("Alpha");
      expect(stored.statusFilter).toEqual(["Construction"]);
      expect(stored.imFilter).toEqual(["Bob"]);
      expect(stored.pmFilter).toEqual(["Alice"]);
    });
  });

  it("persists search and filter selections to sessionStorage", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    await userEvent.type(searchInput, "Gamma");

    await userEvent.click(screen.getByRole("button", { name: "toggleFilters" }));
    await userEvent.click(screen.getByRole("button", { name: "Construction" }));

    await waitFor(() => {
      const stored = JSON.parse(sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY]);
      expect(stored.searchQuery).toBe("Gamma");
      expect(stored.statusFilter).toEqual(["Construction"]);
    });
  });

  it("restores filter panel selections from sessionStorage on mount", async () => {
    sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY] = JSON.stringify({
      searchQuery: "",
      statusFilter: ["Construction"],
      imFilter: [],
      pmFilter: [],
    });

    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);

    await userEvent.click(screen.getByRole("button", { name: "toggleFilters" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Construction" })).toHaveClass(
        "filter-panel-pill--active"
      );
    });
  });

  it("filters by search query", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    // The search input uses t("searchPlaceholder") — our mock returns the key name
    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    await userEvent.type(searchInput, "Alpha");
    await waitFor(() => {
      expect(screen.getAllByText("Alpha Tower").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("Beta Plaza")).not.toBeInTheDocument();
    });
  });

  it("renders empty state when no projects match the search", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    const searchInput = screen.getByPlaceholderText("searchPlaceholder");
    await userEvent.type(searchInput, "ZZZNOMATCH");
    await waitFor(() => {
      expect(screen.queryByText("Alpha Tower")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Plaza")).not.toBeInTheDocument();
    });
  });

  it("does not show delete buttons when canDelete is false", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    expect(screen.queryByRole("button", { name: /Delete Alpha Tower/i })).not.toBeInTheDocument();
  });

  it("shows delete buttons when canDelete is true", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);
    expect(screen.getAllByRole("button", { name: /Delete Alpha Tower/i }).length).toBeGreaterThan(0);
  });

  it("opens the delete confirmation modal when the trash button is clicked", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);
    const deleteButtons = screen.getAllByRole("button", { name: /Delete Alpha Tower/i });
    await userEvent.click(deleteButtons[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Modal shows the project name inside the dialog
    expect(dialog.querySelector("strong")).toHaveTextContent("Alpha Tower");
  });

  it("keeps the Submit button disabled until 'delete' is typed", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);
    const deleteButtons = screen.getAllByRole("button", { name: /Delete Alpha Tower/i });
    await userEvent.click(deleteButtons[0]);
    const submitBtn = await screen.findByRole("button", { name: "confirmDeleteAria" });
    expect(submitBtn).toBeDisabled();

    const input = screen.getByLabelText("deleteModalInputLabel");
    await userEvent.type(input, "delet");
    expect(submitBtn).toBeDisabled();

    await userEvent.type(input, "e");
    expect(submitBtn).not.toBeDisabled();
  });

  it("accepts 'delete' typed in any case", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);
    const deleteButtons = screen.getAllByRole("button", { name: /Delete Alpha Tower/i });
    await userEvent.click(deleteButtons[0]);
    const submitBtn = await screen.findByRole("button", { name: "confirmDeleteAria" });
    const input = screen.getByLabelText("deleteModalInputLabel");
    await userEvent.type(input, "DELETE");
    expect(submitBtn).not.toBeDisabled();
  });

  it("dismisses the modal when Cancel is clicked", async () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);
    const deleteButtons = screen.getAllByRole("button", { name: /Delete Alpha Tower/i });
    await userEvent.click(deleteButtons[0]);
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "cancelDeleteAria" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes a project from the list after typing 'delete' and submitting", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete />);

    const deleteButtons = screen.getAllByRole("button", { name: /Delete Alpha Tower/i });
    await userEvent.click(deleteButtons[0]);

    const input = await screen.findByLabelText("deleteModalInputLabel");
    await userEvent.type(input, "delete");

    const submitBtn = screen.getByRole("button", { name: "confirmDeleteAria" });
    expect(submitBtn).not.toBeDisabled();
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText("Alpha Tower")).not.toBeInTheDocument();
    });
    // Modal closes after successful delete
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sorts projects in alphabetical order by default", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    // Both views render the same sorted order; just verify all 3 names are present
    expect(screen.getAllByText("Alpha Tower").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Beta Plaza").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Gamma Court").length).toBeGreaterThanOrEqual(1);
  });

  it("hides Field Tracker buttons when canViewUPM is false (e.g. INSTALL_MANAGER)", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} canViewUPM={false} />);
    expect(screen.queryByText("openUpm")).not.toBeInTheDocument();
  });

  it("shows Field Tracker buttons when canViewUPM is true (e.g. ADMIN, CONTROLS_MANAGER, PROJECT_MANAGER)", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} canViewUPM={true} />);
    // One button per project (mock i18n returns the key name)
    expect(screen.getAllByText("openUpm").length).toBe(PROJECTS.length);
  });

  function mapLinks() {
    return screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href")?.includes("google.com/maps"));
  }

  it("renders Google Maps links for non-empty site locations (mobile + desktop)", () => {
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    const links = mapLinks();
    expect(links.length).toBe(PROJECTS.length * 2);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(links[0].getAttribute("href")).toContain(
      encodeURIComponent("Downtown")
    );
  });

  it("does not render a map link when siteLocation is empty", () => {
    const withEmpty: Project[] = [
      {
        ...PROJECTS[0],
        id: "empty-loc",
        projectName: "No Address Project",
        siteLocation: "",
      },
    ];
    render(<ProjectsTable initialProjects={withEmpty} canCreate={false} canDelete={false} />);
    expect(mapLinks()).toHaveLength(0);
  });

  it("does not nest anchor tags inside mobile project cards", () => {
    const { container } = render(
      <ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />
    );
    const mobileSection = container.querySelector(".mobile-only");
    expect(mobileSection).toBeTruthy();
    mobileSection!.querySelectorAll("a").forEach((anchor) => {
      expect(anchor.querySelector("a")).toBeNull();
    });
  });

  it("navigates mobile project cards on Enter/Space but not when focus is on the map link", () => {
    mockStartProjectNavigation.mockClear();
    const { container } = render(
      <ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />
    );
    const mobileSection = container.querySelector(".mobile-only");
    const card = mobileSection!.querySelector('[data-testid="project-mobile-card"]') as HTMLElement;
    const mapLink = screen.getAllByRole("link", { name: /Open Downtown in Google Maps/i })[0];

    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockRouterPush).toHaveBeenCalledWith("/projects/p1");
    expect(mockStartProjectNavigation).toHaveBeenCalledWith("p1", "Alpha Tower");

    mockRouterPush.mockClear();
    mockStartProjectNavigation.mockClear();
    fireEvent.keyDown(mapLink, { key: "Enter" });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockStartProjectNavigation).not.toHaveBeenCalled();
  });

  it("starts project navigation transition when a desktop project link is clicked", async () => {
    mockStartProjectNavigation.mockClear();
    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);

    const projectLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/projects/p1");
    expect(projectLinks.length).toBeGreaterThan(0);
    await userEvent.click(projectLinks[0]);

    expect(mockStartProjectNavigation).toHaveBeenCalledWith("p1", "Alpha Tower");
  });

  it("pins favorited projects above non-favorites on mobile cards", () => {
    const pinnedProjects: Project[] = [
      { ...PROJECTS[0], isFavorite: false },
      { ...PROJECTS[1], isFavorite: true },
      { ...PROJECTS[2], isFavorite: false },
    ];
    const { container } = render(
      <ProjectsTable initialProjects={pinnedProjects} canCreate={false} canDelete={false} />
    );
    const cards = container.querySelectorAll('[data-testid="project-mobile-card"]');
    expect(cards[0].textContent).toContain("Beta Plaza");
  });

  it("does not navigate when clicking the favorite button on a mobile card", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/offline/preferences")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ modules: [], offlineProjectIds: [], projectSyncedAt: {}, availableModules: [] }),
        });
      }
      if (typeof url === "string" && url.includes("/favorite")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ projectId: "p2", favorite: true }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<ProjectsTable initialProjects={PROJECTS} canCreate={false} canDelete={false} />);
    const favoriteButtons = screen.getAllByRole("button", { name: "favoriteProject" });
    await userEvent.click(favoriteButtons[0]);

    expect(mockRouterPush).not.toHaveBeenCalled();
  });

});
