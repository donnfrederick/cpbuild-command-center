/**
 * Unit tests for CreateProjectModal.
 *
 * The key fixture rule (COPILOT_LEARNINGS 2026-03-05): form components that
 * submit to an API must render with a null/empty fixture and verify the POST
 * does not fail schema validation. Unifier can return null for projectManagerName,
 * address, location, status, projectNumber — this test ensures those cases
 * produce a valid POST body.
 *
 * Also covers the tour simulation event handlers that allow the guided tour to
 * walk through the wizard automatically without making real API calls.
 *
 * The component is excluded from coverage thresholds (vitest.config.ts) because
 * it is a complex multi-step wizard. These tests verify the critical null-path
 * serialization behavior and tour simulation behavior, not the full interaction flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import type { UnifierProject } from "@/lib/unifier/types";
import { CC_UNIFIER_LINKED_COUNT_HEADER } from "@/lib/unifier/projects-list-header";
import { formatUnifierSiteLocation } from "@/lib/unifier/site-location-display";
import { TOUR_DEMO_PROJECT, TOUR_DEMO_UPM_ROWS } from "@/lib/tour-demo-data";
import { parseUPM, parseUPMFromFile } from "@/lib/upm-parse";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/upm-parse", () => ({
  parseUPM: vi.fn(() => ({ error: null, headers: [], rows: [], validationErrors: [] })),
  parseUPMFromFile: vi.fn(),
  validateUPMRows: vi.fn(() => []),
  formatUPMValidationError: (e: { row: number; col: string; message: string }) =>
    e.row === 0 ? e.message : `Row ${e.row}, ${e.col}: ${e.message}`,
}));

const messages = {
  projects: {
    createProjectStep1: "Step 1 of 3",
    createProjectStep2: "Step 2 of 3",
    createProjectStep3: "Step 3 of 3",
    selectUnifierProject: "Select a Unifier Project",
    confirmProject: "Confirm Project",
    uploadUPM: "Upload Field Tracker",
    next: "Next",
    back: "Back",
    addProject: "Add Project",
    confirmCreateProject: "Confirm & Create Project",
    confirmCreateWithRows: "Confirm & Create Project ({count} rows)",
    nextUploadUPM: "Next, you will upload the Field Tracker spreadsheet.",
    nextUploadUPMOptional: "Upload Field Tracker now, or create the project and add locations later.",
    createWithoutLocations: "Create without locations",
    createWithoutLocationsAria: "Create project without Field Tracker data",
    locationsOptionalHint: "Locations are optional — confirm below or add them later.",
    searchUnifierPlaceholder: "Search by project name, number, location, or PM…",
    searchUnifierAria: "Search Unifier projects",
    loadingUnifierProjects: "Loading Unifier projects…",
    failedToLoadUnifier: "Failed to load Unifier projects",
    noUnifierProjects: "No available Unifier projects found.",
    noProjectsMatchSearch: "No projects match your search.",
    projectsAvailableCount: "{count} project available to import",
    projectsAvailableCountPlural: "{count} projects available to import",
    projectsMatchCount: "{count} of {total} match your search (available to import)",
    unifierProjectsAlreadyLinked:
      "{count, plural, one {# project is already linked in Field Tracker and won’t appear in this list.} other {# projects are already linked in Field Tracker and won’t appear in this list.}}",
    reviewProjectData: "Review the project data from Unifier",
    siteLocation: "Site Location",
    status: "Status",
    projectManager: "Project Manager",
    client: "Client",
    projectName: "Project Name",
    unifierPID: "Unifier PID",
    unifierNumber: "Unifier #",
    projectType: "Project Type",
    uploadOrPasteUPM: "Upload or paste Field Tracker data",
    uploadUPMHint: "Upload an Excel file or paste below.",
    uploadExcelFile: "Upload Excel file",
    pasteUPMPlaceholder: "Or paste spreadsheet data here…",
    previewRows: "Preview — {count} row (editable)",
    previewRowsPlural: "Preview — {count} rows (editable)",
    andMoreRows: "… and {count} more",
    upmPreviewRowNumberHeader: "Row",
    loadedFile: "Loaded: {name} ({count} rows)",
    fixInPreview: "You can fix these in the preview table below before confirming.",
    formatIssues: "Format issues:",
    parsing: "Parsing…",
    creating: "Creating…",
    projectCreated: "Project \"{name}\" created successfully.",
    projectCreatedWithUPM: "Project \"{name}\" created successfully with {count} Field Tracker rows.",
    projectRestored: "Project \"{name}\" restored successfully.",
    projectRestoredWithUPM: "Project \"{name}\" restored successfully with {count} rows.",
    unnamedProject: "Unnamed project",
  },
  common: {
    cancel: "Cancel",
    close: "Close",
    loading: "Loading…",
    error: "Error",
  },
};

/** A Unifier project fixture with all nullable fields set to null — mirrors worst-case Unifier response. */
const NULL_FIXTURE: UnifierProject = {
  pid: "UNI-NULL-001",
  projectName: "Null Fields Project",
  projectNumber: null,
  location: null,
  address: null,
  status: null,
  shellStatus: null,
  state: null,
  clientName: null,
  projectType: null,
  projectPhase: null,
  stage: null,
  estimatingStage: null,
  projectManagerName: null,
  fieldDueDate: null,
  estimatorName: null,
  sageProjectId: null,
  rfmsProjectId: null,
  projectTrack: null,
};

function setupFetchMock(fixture: UnifierProject) {
  const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (url === "/api/unifier/projects") {
      return Promise.resolve({
        ok: true,
        headers: {
          get: (name: string) => (name === CC_UNIFIER_LINKED_COUNT_HEADER ? "0" : null),
        },
        json: () => Promise.resolve([fixture]),
      });
    }
    if (url === "/api/projects" && opts?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "proj-1",
            projectName: fixture.projectName,
            siteLocation: formatUnifierSiteLocation(
              fixture.location ?? fixture.address,
              fixture.state
            ),
            status: (fixture.status ?? fixture.projectPhase ?? "").trim(),
            lifecycleStatus:
              fixture.shellStatus?.trim().toLowerCase() === "active"
                ? "Active"
                : fixture.shellStatus?.trim().toLowerCase() === "on hold"
                  ? "On Hold"
                  : "Planning",
            projectManagerName: "",
            unifierPid: fixture.pid,
            restored: false,
          }),
      });
    }
    if (typeof url === "string" && url.includes("/api/projects/proj-1/units") && opts?.method === "POST") {
      const body = JSON.parse(String(opts.body)) as { rows: Record<string, string>[] };
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            added: body.rows.length,
            skipped: 0,
            addedRowIds: body.rows.map((_, i) => `row-${i}`),
            unlinkedScopeTypes: [],
          }),
      });
    }
    if (url === "/api/projects/proj-1" && opts?.method === "DELETE") {
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "unexpected" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderModal(overrides?: Partial<UnifierProject>) {
  const fixture: UnifierProject = { ...NULL_FIXTURE, ...overrides };
  const fetchMock = setupFetchMock(fixture);
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateProjectModal onClose={onClose} onCreated={onCreated} />
    </NextIntlClientProvider>
  );
  return { fetchMock, onClose, onCreated };
}

describe("CreateProjectModal — null Unifier fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search step without crashing when Unifier returns null fields", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Null Fields Project")).toBeTruthy();
    });
  });

  it("POST create omits denormalized Unifier fields; only unifierPid is required (PM from Unifier on read)", async () => {
    const { fetchMock } = renderModal();

    await waitFor(() => screen.getByText("Null Fields Project"));

    // Step 1 — select the project
    fireEvent.click(screen.getByText("Null Fields Project"));

    // Step 2 — confirm → Next (advance to UPM step)
    await waitFor(() => screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — UPM step → Create project (no UPM data)
    await waitFor(() => screen.getByRole("button", { name: /create project/i }));
    expect(screen.getByRole("button", { name: /create project/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      const projectsCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === "/api/projects" && opts?.method === "POST"
      );
      expect(projectsCall).toBeTruthy();
      const body = JSON.parse(projectsCall![1].body as string) as Record<string, unknown>;
      expect(body.unifierPid).toBe("UNI-NULL-001");
      expect(body.projectManagerName).toBeUndefined();
      expect(body.projectName).toBeUndefined();
    });
  });

  it("creates project from confirm step without visiting Location Builder upload", async () => {
    const { fetchMock, onCreated } = renderModal();

    await waitFor(() => screen.getByText("Null Fields Project"));
    fireEvent.click(screen.getByText("Null Fields Project"));

    await waitFor(() =>
      screen.getByRole("button", { name: "Create project without Field Tracker data" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create project without Field Tracker data" })
    );

    await waitFor(() => {
      const projectsCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === "/api/projects" && opts?.method === "POST"
      );
      expect(projectsCall).toBeTruthy();
      const body = JSON.parse(projectsCall![1].body as string) as Record<string, unknown>;
      expect(body.unifierPid).toBe("UNI-NULL-001");
      expect(body.upmData).toBeUndefined();
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it("POST /api/projects sends only unifierPid when creating with Field Tracker rows", async () => {
    vi.mocked(parseUPM).mockReturnValue({
      error: null,
      headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
      rows: [
        {
          Building: "A",
          Level: "1",
          Unit: "101",
          "Unit Type": "Lobby",
          Description: "Tile floor",
          "Scope Type": "Tile",
        },
      ],
      validationErrors: [],
    });

    const { fetchMock, onCreated } = renderModal({ location: null, address: "123 Main St" });

    await waitFor(() => screen.getByText("Null Fields Project"));
    fireEvent.click(screen.getByText("Null Fields Project"));

    await waitFor(() => screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => screen.getByPlaceholderText(/paste spreadsheet/i));
    fireEvent.change(screen.getByPlaceholderText(/paste spreadsheet/i), {
      target: { value: "Building\tLevel\tUnit\nA\t1\t101" },
    });

    await waitFor(() => screen.getByRole("button", { name: /confirm.*create/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm.*create/i }));

    await waitFor(() => {
      const projectsCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === "/api/projects" && opts?.method === "POST"
      );
      expect(projectsCall).toBeTruthy();
      const body = JSON.parse(projectsCall![1].body as string) as Record<string, unknown>;
      expect(body).toEqual({ unifierPid: "UNI-NULL-001" });
      expect(body).not.toHaveProperty("upmData");

      const unitsCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          typeof url === "string" && url.includes("/api/projects/proj-1/units") && opts?.method === "POST"
      );
      expect(unitsCall).toBeTruthy();
      expect(onCreated).toHaveBeenCalled();
    });
  });
});

describe("CreateProjectModal — UPM validation gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function goToUpmStep() {
    renderModal();
    await waitFor(() => screen.getByText("Null Fields Project"));
    fireEvent.click(screen.getByText("Null Fields Project"));
    await waitFor(() => screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => screen.getByPlaceholderText(/paste spreadsheet/i));
  }

  it("disables Create when validationErrors are present", async () => {
    vi.mocked(parseUPM).mockReturnValue({
      error: null,
      headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
      rows: [
        {
          Building: "A",
          Level: "1",
          Unit: "101",
          "Unit Type": "",
          Description: "Tile floor",
          "Scope Type": "Tile",
        },
      ],
      validationErrors: [{ row: 1, col: "Unit Type", message: "Unit Type is required" }],
    });

    await goToUpmStep();
    fireEvent.change(screen.getByPlaceholderText(/paste spreadsheet/i), {
      target: { value: "Building\tLevel\tUnit\nA\t1\t101" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm.*create/i })).toBeDisabled();
    });
  });

  /**
   * Regression guard for the file-upload disabled-button bug.
   * When a file is uploaded, upmPaste is cleared → parseUPM("") returns
   * error: "No data pasted." — the old canCreateWithLocations check blocked
   * on !upmParsed.error even when data came from a file, keeping the button
   * disabled. Fix: only require !upmParsed.error when pasteIsEmpty is false.
   */
  it("enables Create after file upload even though paste area is cleared (regression guard)", async () => {
    vi.mocked(parseUPM).mockImplementation((pasted: string) => {
      if (!pasted.trim()) {
        return { error: "No data pasted.", headers: [], rows: [], validationErrors: [] };
      }
      return { error: null, headers: [], rows: [], validationErrors: [] };
    });
    vi.mocked(parseUPMFromFile).mockResolvedValue({
      error: null,
      headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
      rows: [
        {
          Building: "A",
          Level: "1",
          Unit: "101",
          "Unit Type": "Lobby",
          Description: "Tile floor",
          "Scope Type": "Tile",
        },
      ],
      validationErrors: [],
    });

    await goToUpmStep();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["dummy"], "locations.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm.*create/i })).not.toBeDisabled();
    });
  });

  it("enables Create once validationErrors are cleared", async () => {
    vi.mocked(parseUPM).mockImplementation((pasted: string) => {
      if (pasted === "invalid-upm") {
        return {
          error: null,
          headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
          rows: [
            {
              Building: "A",
              Level: "1",
              Unit: "101",
              "Unit Type": "",
              Description: "Tile floor",
              "Scope Type": "Tile",
            },
          ],
          validationErrors: [{ row: 1, col: "Unit Type", message: "Unit Type is required" }],
        };
      }
      if (pasted === "valid-upm") {
        return {
          error: null,
          headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
          rows: [
            {
              Building: "A",
              Level: "1",
              Unit: "101",
              "Unit Type": "Lobby",
              Description: "Tile floor",
              "Scope Type": "Tile",
            },
          ],
          validationErrors: [],
        };
      }
      return { error: null, headers: [], rows: [], validationErrors: [] };
    });

    await goToUpmStep();
    const textarea = screen.getByPlaceholderText(/paste spreadsheet/i);
    fireEvent.change(textarea, { target: { value: "invalid-upm" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm.*create/i })).toBeDisabled();
    });

    fireEvent.change(textarea, { target: { value: "valid-upm" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm.*create/i })).not.toBeDisabled();
    });
  });
});

describe("CreateProjectModal — create without locations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits upmData when Create without locations is used after UPM rows were loaded", async () => {
    const postBodies: unknown[] = [];
    const { fetchMock } = renderModal();
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/unifier/projects") {
        return Promise.resolve({
          ok: true,
          headers: { get: (name: string) => (name === CC_UNIFIER_LINKED_COUNT_HEADER ? "0" : null) },
          json: () => Promise.resolve([NULL_FIXTURE]),
        });
      }
      if (url === "/api/projects" && opts?.method === "POST") {
        postBodies.push(JSON.parse(String(opts.body)));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "proj-1", projectName: NULL_FIXTURE.projectName }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "unexpected" }) });
    });

    vi.mocked(parseUPM).mockReturnValue({
      error: null,
      headers: ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
      rows: [{ Building: "A", Level: "1", Unit: "101", "Unit Type": "Lobby", Description: "Tile", "Scope Type": "Tile" }],
      validationErrors: [],
    });

    await waitFor(() => screen.getByText("Null Fields Project"));
    fireEvent.click(screen.getByText("Null Fields Project"));
    await waitFor(() => screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => screen.getByPlaceholderText(/paste spreadsheet/i));
    fireEvent.change(screen.getByPlaceholderText(/paste spreadsheet/i), {
      target: { value: "Building\tLevel\tUnit\nA\t1\t101" },
    });
    await waitFor(() => screen.getByText(/Preview — 1 row/i));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const skipBtn = await screen.findByLabelText("Create project without Field Tracker data");
    fireEvent.click(skipBtn);

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]).toEqual({ unifierPid: NULL_FIXTURE.pid });
  });
});

// ─── Tour simulation event handlers ──────────────────────────────────────────

const TOUR_UNIFIER_FIXTURE: UnifierProject = {
  pid: "UNI-10045",
  projectName: "Riverside Apartments Phase 2",
  projectNumber: "2024-0045",
  location: "1200 Riverside Dr",
  address: "1200 Riverside Dr",
  status: "Construction",
  shellStatus: "Active",
  state: "TX",
  clientName: null,
  projectType: null,
  projectPhase: "Construction",
  stage: null,
  estimatingStage: null,
  projectManagerName: "Sarah Johnson",
  estimatorName: null,
  fieldDueDate: null,
  sageProjectId: null,
  rfmsProjectId: null,
  projectTrack: null,
};

describe("CreateProjectModal — tour simulation events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForTour() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === CC_UNIFIER_LINKED_COUNT_HEADER ? "0" : null),
      },
      json: () => Promise.resolve([TOUR_UNIFIER_FIXTURE]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreateProjectModal onClose={onClose} onCreated={onCreated} />
      </NextIntlClientProvider>
    );
    return { onClose, onCreated, fetchMock };
  }

  it("tour:select-demo-project picks a project from the loaded list and advances to confirm step", async () => {
    renderForTour();
    await waitFor(() => screen.getByText("Riverside Apartments Phase 2"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent("tour:select-demo-project"));
    });

    // After selection the modal advances to confirm — project name remains visible.
    await waitFor(() => {
      const found =
        screen.queryByText("Riverside Apartments Phase 2") ??
        screen.queryByText(TOUR_DEMO_PROJECT.projectName);
      expect(found).toBeTruthy();
    });
  });

  it("tour:wizard-advance advances the modal from confirm to the UPM step", async () => {
    renderForTour();
    await waitFor(() => screen.getByText("Riverside Apartments Phase 2"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent("tour:select-demo-project"));
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("tour:wizard-advance"));
    });

    // UPM step is visible — at minimum the upload or create button is present.
    await waitFor(() => {
      const uploadBtn =
        screen.queryByRole("button", { name: /upload/i }) ??
        screen.queryByRole("button", { name: /create/i });
      expect(uploadBtn).toBeTruthy();
    });
  });

  it("tour:inject-and-create loads demo UPM rows and calls onCreated with TOUR_DEMO_PROJECT after delay", async () => {
    const { onCreated, onClose } = renderForTour();

    // Wait for Unifier list to load (real timers still active here).
    await waitFor(() => screen.getByText("Riverside Apartments Phase 2"));

    await act(async () => {
      window.dispatchEvent(new CustomEvent("tour:select-demo-project"));
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("tour:wizard-advance"));
    });

    // Switch to fake timers AFTER the async load is done and just before we
    // need to control the 2500ms createTimer.
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent("tour:inject-and-create"));
      });

      // UPM rows are loaded synchronously by the handler — multiple building
      // cells with value "A" should now be present in the preview table.
      const buildingCells = screen.getAllByDisplayValue("A");
      expect(buildingCells.length).toBeGreaterThan(0);

      // Advance the 2500ms timer — simulated create fires.
      await act(async () => { vi.advanceTimersByTime(2500); });

      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: TOUR_DEMO_PROJECT.id })
      );
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT call the real /api/projects endpoint during tour simulation", async () => {
    const { fetchMock, onCreated } = renderForTour();

    await waitFor(() => screen.getByText("Riverside Apartments Phase 2"));

    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent("tour:select-demo-project"));
        window.dispatchEvent(new CustomEvent("tour:wizard-advance"));
        window.dispatchEvent(new CustomEvent("tour:inject-and-create"));
      });
      await act(async () => { vi.advanceTimersByTime(2500); });

      // onCreated was called (tour simulation completed).
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: TOUR_DEMO_PROJECT.id })
      );
      // But no POST to /api/projects was made.
      const postCall = fetchMock.mock.calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url === "/api/projects" && opts?.method === "POST"
      );
      expect(postCall).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
