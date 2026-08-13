import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnifierProjectView } from "@/components/devtools/UnifierProjectView";
import { UnifierExplorerPanel } from "@/components/devtools/UnifierExplorerPanel";

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_PROJECT_ROWS = [
  {
    PID: "1001",
    UE_PRJ_PROJNAMESSN: "Sunrise Apartments",
    UE_PRJ_PROJNUMSSN: "PRJ-001",
    UUU_SHELL_STATUS: "Active",
    CP_GEN_PROJMANAGER_NAME: "Jane Smith",
    CP_PROJECT_PHASEPD: "Construction",
    CP_CL_CLIENTNAME_TB50: "Sunrise LLC",
    CP_OP_STAGE_PD: "In Progress",
    CP_OP_PROJECTTYPE_PD: "Residential",
    UUU_LOCATION: "Phoenix, AZ",
  },
  {
    PID: "1002",
    UE_PRJ_PROJNAMESSN: "Desert View Condos",
    UE_PRJ_PROJNUMSSN: "PRJ-002",
    UUU_SHELL_STATUS: "Completed",
    CP_GEN_PROJMANAGER_NAME: null,
    CP_PROJECT_PHASEPD: null,
    CP_CL_CLIENTNAME_TB50: "",
    CP_OP_STAGE_PD: null,
    CP_OP_PROJECTTYPE_PD: "Commercial",
    UUU_LOCATION: null,
  },
];

const MOCK_TEAM_ROWS = [
  {
    PROJECT_ID: "1001",
    ROLE_NAME: "Project Manager",
    USER_NAME: "Jane Smith",
    EMAIL: "jane@example.com",
    CP_GEN_PROJMANAGER_NAME: "Jane Smith",
    CP_GEN_INSTALLMANAGER_NAME: "Ian Installer",
  },
  { PROJECT_ID: "1001", ROLE_NAME: "Estimator", USER_NAME: "Bob Jones", EMAIL: "bob@example.com" },
];

function makeProjectsResponse(rows = MOCK_PROJECT_ROWS) {
  return { ok: true, json: async () => ({ tableName: "UNIFIER_US_XPRJ", columns: ["PID", "UE_PRJ_PROJNAMESSN", "UE_PRJ_PROJNUMSSN", "UUU_SHELL_STATUS"], rows, total: rows.length, returned: rows.length, limit: 200, projectIdFilter: null }) };
}

function makeTableResponse(tableName: string, rows: Record<string, unknown>[]) {
  const cols = rows.length > 0 ? Object.keys(rows[0]) : ["PROJECT_ID"];
  return { ok: true, json: async () => ({ tableName, columns: cols, rows, total: rows.length, returned: rows.length, limit: 100, projectIdFilter: "1001" }) };
}

function makeSchemaResponse() {
  return { ok: true, json: async () => ({ tables: [{ tableName: "UNIFIER_US_XPRJ", displayName: "Project Shells", description: "Projects", integrated: true, columns: [{ code: "PID", label: "Project ID" }] }], count: 1 }) };
}

// ── Test helpers ──────────────────────────────────────────────────────────

function setupFetch(impl: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

// ── UnifierProjectView tests ──────────────────────────────────────────────

describe("UnifierProjectView", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("fetches and renders the project list on mount", async () => {
    setupFetch(() => makeProjectsResponse());
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    expect(screen.getByLabelText("Reload project list")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Sunrise Apartments")).toBeTruthy();
    });
    expect(screen.getByText("Desert View Condos")).toBeTruthy();
  });

  it("shows loading state while fetching projects", async () => {
    setupFetch(() => new Promise(() => {})); // never resolves
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);
    expect(screen.getByText("Loading projects…")).toBeTruthy();
  });

  it("shows error state when project fetch fails", async () => {
    setupFetch(() => ({ ok: false, json: async () => ({ error: "Auth failed" }) }));
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Auth failed/i)).toBeTruthy();
    });
  });

  it("filters project list based on search input", async () => {
    const user = userEvent.setup();
    setupFetch(() => makeProjectsResponse());
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());

    await user.type(screen.getByLabelText("Search projects"), "Desert");

    expect(screen.queryByText("Sunrise Apartments")).toBeNull();
    expect(screen.getByText("Desert View Condos")).toBeTruthy();
  });

  it("clears filter and shows all projects when search is cleared", async () => {
    const user = userEvent.setup();
    setupFetch(() => makeProjectsResponse());
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());

    const searchInput = screen.getByLabelText("Search projects");
    await user.type(searchInput, "xyz");
    expect(screen.queryByText("Sunrise Apartments")).toBeNull();

    await user.clear(searchInput);
    expect(screen.getByText("Sunrise Apartments")).toBeTruthy();
    expect(screen.getByText("Desert View Condos")).toBeTruthy();
  });

  it("shows empty state before a project is selected", async () => {
    setupFetch(() => makeProjectsResponse());
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    expect(screen.getByText("Select a project to explore its data")).toBeTruthy();
  });

  it("shows project header after selecting a project", async () => {
    const user = userEvent.setup();
    // First call: project list; subsequent calls: table data
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      if ((url as string).includes("UNIFIER_UXPT")) return makeTableResponse("UNIFIER_UXPT", MOCK_TEAM_ROWS);
      return makeTableResponse("UNIFIER_SYS_PROJECT_INFO", []);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));

    // Header should show project name
    expect(screen.getAllByText("Sunrise Apartments").length).toBeGreaterThan(0);
    // PID appears in sidebar item + header — both are valid
    expect(screen.getAllByText(/PID: 1001/i).length).toBeGreaterThanOrEqual(1);
    // PM name should appear in the key fields grid
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText("Ian Installer")).toBeTruthy();
    });
  });

  it("renders all domain sections when a project is selected", async () => {
    const user = userEvent.setup();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      return makeTableResponse("UNIFIER_SYS_PROJECT_INFO", []);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));

    // A sampling of expected section labels
    expect(screen.getByText("Team")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Contracts")).toBeTruthy();
    expect(screen.getByText("Budget")).toBeTruthy();
    expect(screen.getByText("Inspections")).toBeTruthy();
  });

  it("loads team data for the project header and reuses it when Team is expanded", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      if ((url as string).includes("UNIFIER_UXPT")) return makeTableResponse("UNIFIER_UXPT", MOCK_TEAM_ROWS);
      return makeTableResponse("OTHER", []);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));

    await waitFor(() => {
      const teamCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("UNIFIER_UXPT"));
      expect(teamCalls.length).toBe(1);
    });

    // Count fetches after the header team data has loaded.
    const callsBeforeExpand = fetchMock.mock.calls.length;

    // Expand the Team section
    await user.click(screen.getByText("Team"));

    // Team section should reuse the header fetch rather than requesting the same table again.
    await waitFor(() => {
      const teamCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("UNIFIER_UXPT"));
      expect(teamCalls.length).toBe(1);
    });

    expect(fetchMock.mock.calls.length).toBe(callsBeforeExpand);

    // Collapse and re-expand — should NOT fetch again
    await user.click(screen.getByText("Team")); // collapse
    await user.click(screen.getByText("Team")); // re-expand

    const teamCallsAfterReexpand = fetchMock.mock.calls.filter(([url]) => (url as string).includes("UNIFIER_UXPT"));
    expect(teamCallsAfterReexpand.length).toBe(1); // still only 1
  });

  it("displays fetched rows in the mini grid when section is expanded", async () => {
    const user = userEvent.setup();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      if ((url as string).includes("UNIFIER_UXPT")) return makeTableResponse("UNIFIER_UXPT", MOCK_TEAM_ROWS);
      return makeTableResponse("OTHER", []);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("Team"));

    await waitFor(() => {
      // Jane Smith appears in both the project header (PM field) and the team grid
      expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Bob Jones")).toBeTruthy();
    expect(screen.getByText("2 rows")).toBeTruthy();
  });

  it("shows per-section error state when table fetch fails", async () => {
    const user = userEvent.setup();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      // Fail all table-level requests
      return { ok: false, json: async () => ({ error: "Unifier timeout" }) };
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("System Info"));

    await waitFor(() => {
      expect(screen.getByText(/Unifier timeout/i)).toBeTruthy();
    });
  });

  it("allows retry after a section fetch error", async () => {
    const user = userEvent.setup();
    let callCount = 0;
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      if ((url as string).includes("UNIFIER_UXPT")) return makeTableResponse("UNIFIER_UXPT", MOCK_TEAM_ROWS);
      callCount++;
      if (callCount === 1) return { ok: false, json: async () => ({ error: "Timeout" }) };
      return makeTableResponse("UNIFIER_SYS_PROJECT_INFO", [{ PID: "1001", STARTDATE: "2024-01-01" }]);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("System Info"));

    await waitFor(() => expect(screen.getByText(/Timeout/i)).toBeTruthy());

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("2024-01-01")).toBeTruthy();
    });
  });

  it("shows multi-table sub-tabs for sections like Contracts", async () => {
    const user = userEvent.setup();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      return makeTableResponse("UNIFIER_UXUECON", []);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("Contracts"));

    await waitFor(() => {
      // Both sub-tabs should be visible
      expect(screen.getByRole("tab", { name: /Contracts/i })).toBeTruthy();
      expect(screen.getByRole("tab", { name: /Line Items/i })).toBeTruthy();
    });
  });

  it("resets section data when a different project is selected", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      if ((url as string).includes("UNIFIER_UXPT")) {
        return makeTableResponse("UNIFIER_UXPT", (url as string).includes("projectId=1002") ? [] : MOCK_TEAM_ROWS);
      }
      return makeTableResponse("OTHER", []);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());

    // Select first project and expand Team
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("Team"));
    await waitFor(() => expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0));

    // Switch to second project — sections should reset (Team no longer shows data, and project 2 has null PM)
    await user.click(screen.getByText("Desert View Condos"));
    expect(screen.queryByText("Jane Smith")).toBeNull();
  });

  it("calls onJumpToTable when clicking 'Open in Table Explorer'", async () => {
    const user = userEvent.setup();
    const onJumpToTable = vi.fn();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      return makeTableResponse("UNIFIER_UXPT", MOCK_TEAM_ROWS);
    });
    render(<UnifierProjectView onJumpToTable={onJumpToTable} />);

    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());
    await user.click(screen.getByText("Sunrise Apartments"));
    await user.click(screen.getByText("Team"));

    await waitFor(() => expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0));

    await user.click(screen.getByText(/Open in Table Explorer/i));
    expect(onJumpToTable).toHaveBeenCalledWith("UNIFIER_UXPT", "1001");
  });

  it("handles null/empty values in project header gracefully", async () => {
    const user = userEvent.setup();
    setupFetch((url: string) => {
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      return makeTableResponse("UNIFIER_SYS_PROJECT_INFO", []);
    });
    render(<UnifierProjectView onJumpToTable={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Desert View Condos")).toBeTruthy());
    // Second project has null PM, null phase, empty client — selecting it should not crash
    await user.click(screen.getByText("Desert View Condos"));
    // PID appears in sidebar item + header
    expect(screen.getAllByText(/PID: 1002/i).length).toBeGreaterThanOrEqual(1);
  });
});

// ── UnifierExplorerPanel toggle tests ─────────────────────────────────────

describe("UnifierExplorerPanel — mode toggle", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function setupPanelFetch() {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if ((url as string).includes("unifier-schema")) return makeSchemaResponse();
      if ((url as string).includes("unifier-reset")) return { ok: true, json: async () => ({ circuitBreaker: { isSuspended: false, resumesAt: null, failureCount: 0 } }) };
      if ((url as string).includes("UNIFIER_US_XPRJ") && !(url as string).includes("projectId")) return makeProjectsResponse();
      return { ok: false, json: async () => ({ error: "unexpected" }) };
    }));
  }

  it("renders the Tables / Projects toggle", async () => {
    setupPanelFetch();
    render(<UnifierExplorerPanel />);
    expect(screen.getByText("Tables")).toBeTruthy();
    expect(screen.getByText("Projects")).toBeTruthy();
  });

  it("starts in Tables mode with table list visible", async () => {
    setupPanelFetch();
    render(<UnifierExplorerPanel />);
    await waitFor(() => expect(screen.getByText("Unifier Tables")).toBeTruthy());
  });

  it("switches to Project View when Projects button is clicked", async () => {
    const user = userEvent.setup();
    setupPanelFetch();
    render(<UnifierExplorerPanel />);

    await act(async () => {
      await user.click(screen.getByText("Projects"));
    });

    await waitFor(() => {
      expect(screen.getByText("Sunrise Apartments")).toBeTruthy();
    });
    // Table list should no longer be visible
    expect(screen.queryByText("Unifier Tables")).toBeNull();
  });

  it("returns to Tables mode when Tables button is clicked", async () => {
    const user = userEvent.setup();
    setupPanelFetch();
    render(<UnifierExplorerPanel />);

    await act(async () => {
      await user.click(screen.getByText("Projects"));
    });
    await waitFor(() => expect(screen.getByText("Sunrise Apartments")).toBeTruthy());

    await user.click(screen.getByText("Tables"));
    await waitFor(() => expect(screen.getByText("Unifier Tables")).toBeTruthy());
    expect(screen.queryByText("Select a project to explore its data")).toBeNull();
  });
});
