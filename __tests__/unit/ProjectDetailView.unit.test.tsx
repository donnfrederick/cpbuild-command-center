/**
 * ProjectDetailView unit tests
 *
 * Focused on behaviors added in the FB-0057 work:
 *  1. View-mode toggle (grid / breakdown)
 *  2. PROGRESS_COLS rendered (scopeStage, scopeStatus, inspectionStatus, installCompletePct)
 *  3. Installer cell renders SubcontractorPicker (not a plain dropdown)
 *  4. Column picker includes all four PROGRESS_COLS
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

// ── Stubs for heavy sub-components ───────────────────────────────────────────

vi.mock("@/components/projects/LocationProgressBreakdown", () => ({
  LocationProgressBreakdown: ({ units }: { units: unknown[] }) => (
    <div data-testid="location-breakdown" data-row-count={units.length} />
  ),
}));

// Async factory so React can be imported inside — avoids the vi.mock hoisting
// TDZ bug that occurs when referencing module-level consts in sync factories.
vi.mock("@/components/projects/SubcontractorPicker", async () => {
  const { forwardRef, createElement } = await import("react");
  const Stub = forwardRef<unknown, { value: string | null }>(
    function SubcontractorPickerStub({ value }) {
      return createElement("div", { "data-testid": "sub-picker", "data-value": value ?? "" });
    }
  );
  return {
    SubcontractorPicker: Stub,
    _resetSubcontractorCache: vi.fn(),
  };
});

// Stub Sonner toasts so they don't pollute the DOM
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: (...args: unknown[]) => toastErrorMock(...args) },
}));

// Stub next/link – not relevant for grid tests
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Stub ProjectDocuments to avoid its fetches
vi.mock("@/components/projects/ProjectDocuments", () => ({
  ProjectDocuments: () => <div data-testid="project-documents" />,
}));

// Stub ScopeLinkingModal
vi.mock("@/components/projects/ScopeLinkingModal", () => ({
  ScopeLinkingModal: () => null,
}));

vi.mock("@/lib/upm-parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/upm-parse")>();
  return {
    ...actual,
    parseUPMFromFile: vi.fn().mockResolvedValue({
      headers: ["Building", "Level", "Unit", "Description", "Scope Type"],
      rows: [
        {
          Building: "A",
          Level: "1",
          Unit: "101",
          Description: "Floor install",
          "Scope Type": "Flooring",
        },
      ],
      validationErrors: [],
      error: null,
    }),
  };
});

vi.mock("@/hooks/use-file-drop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-file-drop")>();
  return {
    ...actual,
    useFileDrop: ({
      onFiles,
      disabled,
    }: {
      onFiles: (files: File[]) => void;
      disabled?: boolean;
    }) => ({
      isDragOver: false,
      isDesktop: true,
      dropHandlers: disabled
        ? {
            onDragEnter: vi.fn(),
            onDragOver: vi.fn(),
            onDragLeave: vi.fn(),
            onDrop: vi.fn(),
          }
        : {
            onDragEnter: vi.fn(),
            onDragOver: vi.fn(),
            onDragLeave: vi.fn(),
            onDrop: () =>
              onFiles([
                new File(["x"], "locations.xlsx", {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
              ]),
          },
    }),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { ProjectDetailView } from "@/components/projects/ProjectDetailView";
import type { Project } from "@/lib/projects";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_PROJECT: Project = {
  id: "p1",
  projectName: "Test Tower",
  siteLocation: "Chicago",
  status: "Active",
  lifecycleStatus: "Active",
  startDate: null,
  installManagerId: null,
  installManagerName: null,
  projectManagerId: null,
  projectManagerName: "Jane Doe",
  unifierPid: null,
  unifierProjectNumber: null,
  scopeTypes: [],
  isTestProject: false,
  clonedFromProjectId: null,
  clonedFromProjectName: null,
  clonedAt: null,
};

function makeUnitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    rowIndex: 0,
    building: "A",
    level: "1",
    unit: "101",
    area: "",
    shipPhase: "P1",
    buildPhase: "B1",
    scheme: "",
    unitType: "Lobby",
    description: "Floor install",
    scopeType: { id: "st-1", code: "FLR", name: "Flooring", canonicalScopeType: null },
    csiPrimeCode: "",
    csiDetailCode: "",
    locationType: null,
    costType: null,
    installer: null,
    unifierSubId: "sub-1",
    qty: 10,
    uom: null,
    unitRate: null,
    budgetedManHours: null,
    startDate: null,
    finishDate: null,
    percentComplete: null,
    actualManHours: null,
    scopeStage: "INSTALL" as const,
    scopeStatus: "COMPLETE" as const,
    inspectionStatus: "PASSED" as const,
    subScopeInstances: [],
    ...overrides,
  };
}

const MINIMAL_MESSAGES = {
  status: "Status",
  projects: {
    backToProjects: "Back",
    viewModeAria: "Switch view mode",
    gridView: "Grid",
    breakdownView: "Breakdown",
    columnsLabel: "Columns",
    chooseColumns: "Choose columns",
    filterByColumn: "Filter by column",
    allColumns: "All columns",
    searchAllColumns: "Search all columns…",
    searchFieldTrackerHint: "Press Enter to search",
    searchTable: "Search table",
    searchPlaceholder: "Search…",
    unitPlanMatrixRows: "Location Builder ({count} rows)",
    unitPlanMatrixRowsPartial: "Location Builder ({loaded} of {total} rows)",
    unitPlanMatrixRowsFiltered: "Location Builder ({count} of {total} rows)",
    noUnitRows: "No unit rows.",
    noRowsMatch: "No rows match your filters.",
    tryAdjusting: " Try adjusting the search or column filters.",
    addRows: "Add rows",
    addRow: "Add row",
    addNewRow: "Add new row",
    addNewRowDescription: "Fill in row fields.",
    addNewRowAria: "Add new row",
    rowSelected: "{count} row selected",
    rowsSelected: "{count} rows selected",
    set: "Set",
    to: "to",
    value: "Value",
    updating: "Updating…",
    clearSelection: "Clear selection",
    requiredFieldCannotBeEmpty: "{field} is required and cannot be empty",
    requiredFieldsMissing: "Required fields missing: {fields}",
    rowAdded: "Row added",
    failedToAddRow: "Failed to add row",
    failedBulkUpdate: "Failed to bulk update",
    valueUpdated: "Updated",
    failedToSave: "Failed to save",
    uploadFile: "Upload",
    exportXlsx: "Export",
    pasteRows: "Paste rows",
    mergeMode: "Merge",
    overwriteMode: "Overwrite",
    addMode: "Add",
    pasteRowsPlaceholder: "Paste here…",
    cancelButton: "Cancel",
    submitRows: "Submit",
    undoDelete: "Undo",
    deleteSelected: "Delete",
    bulkUpdate: "Bulk update",
    findReplaceLabel: "Find & replace",
    findLabel: "Find",
    replaceLabel: "Replace",
    replaceAll: "Replace all",
    close: "Close",
    columns: {
      building: "Building",
      level: "Level",
      unit: "Unit",
      area: "Area",
      shipPhase: "Ship Phase",
      buildPhase: "Build Phase",
      scheme: "Scheme",
      unitType: "Unit Type",
      description: "Description",
      scopeType: "Scope Type",
      csiPrimeCode: "CSI Prime",
      csiDetailCode: "CSI Detail",
      locationType: "Location Type",
      costType: "Cost Type",
      installer: "Installer",
      qty: "QTY",
      uom: "UOM",
      unitRate: "Unit Rate",
      budgetedManHours: "Budgeted MH",
      startDate: "Start Date",
      finishDate: "Finish Date",
      percentComplete: "% Complete",
      actualManHours: "Actual MH",
      scopeStage: "Stage",
      scopeStatus: "Status",
      inspectionStatus: "Inspection",
      installCompletePct: "Install %",
    },
    breakdown: {
      noRows: "No rows.",
      noRowsMatch: "No rows match.",
      groupByPhaseAria: "Group by phase",
      groupByShipPhase: "Ship Phase",
      groupByBuildPhase: "Build Phase",
      expandAll: "Expand all",
      collapseAll: "Collapse all",
      searchPlaceholder: "Filter…",
      searchAria: "Search breakdown",
      exportCsv: "Export CSV",
      exportCsvAria: "Export progress breakdown as CSV",
      colLocation: "Location",
      colPct: "%",
      colStage: "Stage",
      colStatus: "Status",
      colInspection: "Inspection",
      colStart: "Start",
      colFinish: "Finish",
      levelPrefix: "Lvl",
      unitPrefix: "Unit",
      expand: "Expand",
      collapse: "Collapse",
      colInstaller: "Installer",
      installerCount: "installers",
    },
  },
  common: {
    loading: "Loading…",
    error: "Error",
    noData: "No data",
    apply: "Apply",
    cancel: "Cancel",
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MINIMAL_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

// Mock IntersectionObserver (not present in jsdom)
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

function mockFetch(rows = [makeUnitRow()]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      // Individual row PATCH / GET
      if (url.match(/\/units\/[^?]+/)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(rows[0] ?? {}),
        });
      }
      // Units list
      if (url.includes("/units")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              units: rows,         // component reads json.units
              total: rows.length,
              hasMore: false,
              nextCursor: null,
            }),
        });
      }
      if (url.includes("/lookups")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              scopeTypes: [],
              locationTypes: [],
              costTypes: [],
              installTeams: [],
              uomTypes: [],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProjectDetailView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    mockFetch();
  });

  function patchFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(
      ([url, opts]: [string, RequestInit?]) =>
        typeof url === "string" && /\/units\/[^/?]+$/.test(url) && opts?.method === "PATCH"
    );
  }

  function postUnitsFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(
      ([url, opts]: [string, RequestInit?]) =>
        typeof url === "string" && url.includes("/units") && !url.match(/\/units\/[^/?]+$/) && opts?.method === "POST"
    );
  }

  /** Waits for data to load: Grid button always in toolbar, Breakdown button too. */
  async function waitForLoaded() {
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Grid" })).toBeDefined(),
      { timeout: 5000 }
    );
  }

  it("renders the view-mode toggle toolbar with Grid and Breakdown buttons", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} />,
      { wrapper: Wrapper }
    );

    // Wait for the toolbar to finish loading (Grid button always present)
    await waitFor(() => expect(screen.getByRole("button", { name: "Grid" })).toBeDefined(), { timeout: 5000 });

    expect(screen.getByRole("button", { name: "Grid" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Breakdown" })).toBeDefined();
  });

  it("Grid button is pressed by default", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} />,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Grid" })).toBeDefined(), { timeout: 5000 });

    const gridBtn = screen.getByRole("button", { name: "Grid" });
    expect(gridBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps column headers and filters visible when no rows match filters", async () => {
    mockFetch([makeUnitRow({ unit: "101" })]);
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} />,
      { wrapper: Wrapper },
    );
    await waitForLoaded();
    await waitFor(() => expect(screen.getByText("101")).toBeDefined());

    const buildingFilter = screen.getByRole("textbox", { name: /Filter by Building/i });
    fireEvent.change(buildingFilter, { target: { value: "NO_MATCH_XYZ" } });

    await waitFor(() => expect(screen.getByText(/No rows match your filters/i)).toBeDefined());
    expect(screen.getByRole("columnheader", { name: /Building/i })).toBeDefined();
    expect(screen.getByRole("textbox", { name: /Filter by Building/i })).toBeDefined();
    expect(screen.queryByText("101")).toBeNull();
  });

  it("switches to Breakdown view when Breakdown button is clicked", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} />,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Breakdown" })).toBeDefined(), { timeout: 5000 });

    const breakdownBtn = screen.getByRole("button", { name: "Breakdown" });
    fireEvent.click(breakdownBtn);

    await waitFor(() => {
      expect(screen.getByTestId("location-breakdown")).toBeDefined();
    });
    expect(breakdownBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("breakdown view receives the loaded rows as 'units' prop", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} />,
      { wrapper: Wrapper }
    );

    // Wait until data loads so units state is populated
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Breakdown" })).toBeDefined(),
      { timeout: 5000 }
    );

    // Wait a tick for state to settle
    await waitFor(() => {
      const titleEl = screen.queryByText(/Location Builder/i);
      expect(titleEl).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));

    await waitFor(() => {
      const breakdown = screen.getByTestId("location-breakdown");
      expect(breakdown.getAttribute("data-row-count")).toBe("1");
    }, { timeout: 3000 });
  });

  it("renders SubcontractorPicker for the installer cell when canManage is true", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const pickers = screen.getAllByTestId("sub-picker");
      expect(pickers.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("SubcontractorPicker receives the row unifierSubId as value", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const picker = screen.getAllByTestId("sub-picker")[0];
      expect(picker.getAttribute("data-value")).toBe("sub-1");
    }, { timeout: 5000 });
  });

  it("renders PROGRESS_COLS headers in the grid (Stage, Status, Inspection, Install %)", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} />,
      { wrapper: Wrapper }
    );

    await waitForLoaded();

    // All four PROGRESS_COLS should appear as column headers in the grid table
    await waitFor(() => {
      // getAllByText returns array; asserting length ≥ 1 is enough to confirm presence
      expect(screen.getAllByText("Stage").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Inspection").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Install %").length).toBeGreaterThan(0);
    });
  });

  describe("Location Builder required fields", () => {
    it("blocks clearing description via single-cell edit (no PATCH, error toast)", async () => {
      const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
        if (url.match(/\/units\/[^?]+/) && opts?.method === "PATCH") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        if (url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: [makeUnitRow()],
                total: 1,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ProjectDetailView project={MOCK_PROJECT} canManage={true} />, { wrapper: Wrapper });
      await waitForLoaded();

      fireEvent.click(screen.getByText("Floor install"));
      const input = await screen.findByDisplayValue("Floor install");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith("Description is required and cannot be empty");
      });
      expect(patchFetchCalls(fetchMock)).toHaveLength(0);
    });

    it("blocks bulk update that clears unitType (no PATCH, error toast)", async () => {
      const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
        if (url.match(/\/units\/[^?]+/) && opts?.method === "PATCH") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        if (url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: [makeUnitRow()],
                total: 1,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ProjectDetailView project={MOCK_PROJECT} canManage={true} />, { wrapper: Wrapper });
      await waitForLoaded();

      fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
      await waitFor(() => expect(screen.getByText(/1 row selected/i)).toBeDefined());
      const bulkBar = screen.getByText("Set").closest("div")!;
      const bulkSelect = within(bulkBar as HTMLElement).getByRole("combobox");
      fireEvent.change(bulkSelect, { target: { value: "unitType" } });
      expect((bulkSelect as HTMLSelectElement).value).toBe("unitType");
      fireEvent.click(within(bulkBar as HTMLElement).getByRole("button", { name: "Apply" }));

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith("Unit Type is required and cannot be empty");
      });
      expect(patchFetchCalls(fetchMock)).toHaveLength(0);
    });

    it("blocks Add Row submit when required fields are missing (no POST, error toast)", async () => {
      const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
        if (url.includes("/units") && opts?.method === "POST") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ added: 1, skipped: 0 }) });
        }
        if (url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: [makeUnitRow()],
                total: 1,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ProjectDetailView project={MOCK_PROJECT} canManage={true} />, { wrapper: Wrapper });
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: "Add new row" }));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

      fireEvent.change(screen.getByLabelText("Building"), { target: { value: "B" } });
      fireEvent.change(screen.getByLabelText("Level"), { target: { value: "2" } });
      fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "202" } });
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Add row" }));

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith(
          expect.stringMatching(/Required fields missing:.*Unit Type.*Description.*Scope Type/)
        );
      });
      expect(postUnitsFetchCalls(fetchMock)).toHaveLength(0);
    });
  });
});

// ── canAddAndEdit — INSTALL_MANAGER access ────────────────────────────────────
// Verifies that canManage=false / canAddAndEdit=true (the INSTALL_MANAGER profile)
// shows write controls including upload (append-only).

describe("ProjectDetailView — canAddAndEdit (INSTALL_MANAGER profile)", () => {
  const IM_MESSAGES = {
    status: "Status",
    projects: {
      backToProjects: "Back",
      viewModeAria: "Switch view mode",
      gridView: "Grid",
      breakdownView: "Breakdown",
      columnsLabel: "Columns",
      chooseColumns: "Choose columns",
      filterByColumn: "Filter by column",
      allColumns: "All columns",
      searchAllColumns: "Search all columns…",
      searchFieldTrackerHint: "Press Enter to search",
      searchTable: "Search table",
      searchPlaceholder: "Search…",
      unitPlanMatrixRows: "Location Builder ({count} rows)",
      unitPlanMatrixRowsPartial: "Location Builder ({loaded} of {total} rows)",
      unitPlanMatrixRowsFiltered: "Location Builder ({count} of {total} rows)",
      noUnitRows: "No unit rows.",
      addRows: "Add rows",
      addRow: "Add row",
      addNewRow: "Add new row",
      addNewRowDescription: "Fill in row fields.",
      addNewRowAria: "Add new row",
      pasteRows: "Paste rows",
      uploadFile: "Upload",
      uploadOverwrite: "Overwrite existing rows",
      uploadMerge: "Add only new rows (skip duplicates)",
      uploadAppend: "Append all rows to bottom",
      uploadSpreadsheetAria: "Upload spreadsheet to append rows to the bottom",
      uploadSpreadsheetTitle: "Upload Excel/CSV",
      appendUploadPreviewTitle: "Review rows to append",
      appendUploadPreviewBody: "These rows will be added to the bottom.",
      appendUploadSafetyNote: "This upload only appends new rows.",
      appendPreviewTabNew: "New rows ({count})",
      appendPreviewTabNewPlural: "New rows ({count})",
      appendPreviewTabExisting: "Existing rows ({count})",
      appendPreviewTabExistingPlural: "Existing rows ({count})",
      appendPreviewNewRows: "New rows to append — {count} row (editable)",
      appendPreviewNewRowsPlural: "New rows to append — {count} rows (editable)",
      appendPreviewExistingRows: "Existing rows — {count} row (read-only)",
      appendPreviewExistingRowsPlural: "Existing rows — {count} rows (read-only)",
      appendPreviewLoadingExisting: "Loading existing rows…",
      confirmAppendRows: "Confirm & append rows ({count})",
      confirmAppendRowsShort: "Confirm & append rows",
      loadedFile: "Loaded: {name} ({count} rows)",
      formatIssues: "Format issues:",
      fixInPreview: "Fix in preview.",
      andMoreRows: "… and {count} more",
      upmPreviewRowNumberHeader: "Row",
      pasteFromSpreadsheet: "Paste from spreadsheet",
      pastePlaceholder: "Paste here…",
      adding: "Adding…",
      exportXlsx: "Export",
      downloadFieldTracker: "Download",
      rowSelected: "{count} row selected",
      rowsSelected: "{count} rows selected",
      set: "Set",
      to: "to",
      value: "Value",
      updating: "Updating…",
      clearSelection: "Clear selection",
      requiredFieldCannotBeEmpty: "{field} is required",
      requiredFieldsMissing: "Required fields missing: {fields}",
      rowAdded: "Row added",
      failedToAddRow: "Failed to add row",
      failedToAddRows: "Failed to add rows",
      failedBulkUpdate: "Failed to bulk update",
      valueUpdated: "Updated",
      failedToSave: "Failed to save",
      mergeMode: "Merge",
      overwriteMode: "Overwrite",
      addMode: "Add",
      pasteRowsPlaceholder: "Paste here…",
      cancelButton: "Cancel",
      submitRows: "Submit",
      undoDelete: "Undo",
      undoLast: "Undo last action",
      undo: "Undo",
      deleteSelected: "Delete",
      bulkUpdate: "Bulk update",
      findReplaceLabel: "Find & replace",
      findLabel: "Find",
      replaceLabel: "Replace",
      replaceAll: "Replace all",
      close: "Close",
      selectAll: "Select all",
      showAll: "Show all",
      noValidRows: "No valid rows",
      noValidRowsInFile: "No valid rows in file",
      allRowsAlreadyExist: "All rows already exist",
      addedRows: "Added {count} row",
      addedRowsPlural: "Added {count} rows",
      updatedRows: "Updated {count} row",
      updatedRowsPlural: "Updated {count} rows",
      deletedRows: "Deleted {count} row",
      deletedRowsPlural: "Deleted {count} rows",
      failedToDeleteRows: "Failed to delete rows",
      failedFindReplace: "Failed to find & replace",
      rowsOverwritten: "Overwrote rows",
      overwriteBlockedToast: "Cannot replace rows — field data exists.",
      undoComplete: "Undone",
      undoFailed: "Undo failed",
      fieldTrackerExportLoadFailed: "Export failed",
      columns: {
        building: "Building",
        level: "Level",
        unit: "Unit",
        area: "Area",
        shipPhase: "Ship Phase",
        buildPhase: "Build Phase",
        scheme: "Scheme",
        unitType: "Unit Type",
        description: "Description",
        scopeType: "Scope Type",
        csiPrimeCode: "CSI Prime",
        csiDetailCode: "CSI Detail",
        locationType: "Location Type",
        costType: "Cost Type",
        installer: "Installer",
        qty: "Qty",
        uom: "UOM",
        unitRate: "Unit Rate",
        budgetedManHours: "Budgeted Hrs",
        startDate: "Start Date",
        finishDate: "Finish Date",
        percentComplete: "% Complete",
        actualManHours: "Actual Hrs",
        installCompletePct: "Install %",
        scopeStage: "Stage",
        scopeStatus: "Status",
        inspectionStatus: "Inspection",
      },
    },
    common: { loading: "Loading…", error: "Error" },
  };

  function IMWrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale="en" messages={IM_MESSAGES}>
        {children}
      </NextIntlClientProvider>
    );
  }

  function mockFetchIM(rows: ReturnType<typeof makeUnitRow>[] = []) {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: rows,
                total: rows.length,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      })
    );
  }

  async function waitForIMLoaded() {
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Grid" })).toBeDefined(),
      { timeout: 5000 }
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockFetchIM();
  });

  it("shows Add row and Paste rows buttons when canAddAndEdit=true, canManage=false", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} canAddAndEdit={true} />,
      { wrapper: IMWrapper }
    );
    await waitForIMLoaded();

    expect(screen.getByRole("button", { name: "Add new row" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Paste rows" })).toBeDefined();
  });

  it("shows Upload button when canAddAndEdit=true, canManage=false", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} canAddAndEdit={true} />,
      { wrapper: IMWrapper }
    );
    await waitForIMLoaded();

    expect(screen.getByRole("button", { name: "Upload spreadsheet to append rows to the bottom" })).toBeDefined();
  });

  it("does not show overwrite or merge upload options (append-only upload)", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} canAddAndEdit={true} />,
      { wrapper: IMWrapper }
    );
    await waitForIMLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Upload spreadsheet to append rows to the bottom" }));

    expect(screen.queryByText("Overwrite existing rows")).toBeNull();
    expect(screen.queryByText("Add only new rows (skip duplicates)")).toBeNull();
    expect(screen.queryByText("Append all rows to bottom")).toBeNull();
  });

  it("hides all write controls when both canManage=false and canAddAndEdit=false", async () => {
    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={false} canAddAndEdit={false} />,
      { wrapper: IMWrapper }
    );
    await waitForIMLoaded();

    expect(screen.queryByRole("button", { name: "Add new row" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste rows" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload spreadsheet to append rows to the bottom" })).toBeNull();
  });

  it("appends rows on spreadsheet drop after preview confirm (mode add)", async () => {
    const rows = [makeUnitRow()];
    const postCalls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        if (typeof url === "string" && url.includes("/units") && opts?.method === "POST") {
          postCalls.push(opts);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ added: 1, skipped: 0 }),
          });
        }
        if (typeof url === "string" && url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: rows,
                total: rows.length,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (typeof url === "string" && url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    const { container } = render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} canAddAndEdit={true} />,
      { wrapper: IMWrapper },
    );
    await waitForIMLoaded();

    const dropTarget = container.querySelector(".flex.flex-col");
    expect(dropTarget).not.toBeNull();
    fireEvent.drop(dropTarget!);

    await waitFor(() =>
      expect(screen.getByTestId("location-builder-upload-preview")).toBeDefined(),
    );
    expect(postCalls.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Confirm & append rows (1)" }));

    await waitFor(() => expect(postCalls.length).toBe(1));
    const body = JSON.parse(String(postCalls[0]?.body));
    expect(body.mode).toBe("add");
  });

  it("appends rows on file upload after preview confirm (mode add)", async () => {
    const rows = [makeUnitRow()];
    const postCalls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        if (typeof url === "string" && url.includes("/units") && opts?.method === "POST") {
          postCalls.push(opts);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ added: 1, skipped: 0 }),
          });
        }
        if (typeof url === "string" && url.includes("/units")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                units: rows,
                total: rows.length,
                hasMore: false,
                nextCursor: null,
              }),
          });
        }
        if (typeof url === "string" && url.includes("/lookups")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                scopeTypes: [],
                locationTypes: [],
                costTypes: [],
                installTeams: [],
                uomTypes: [],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    render(
      <ProjectDetailView project={MOCK_PROJECT} canManage={true} canAddAndEdit={true} />,
      { wrapper: IMWrapper },
    );
    await waitForIMLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Upload spreadsheet to append rows to the bottom" }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File(["x"], "menu-upload.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByTestId("location-builder-upload-preview")).toBeDefined(),
    );
    expect(postCalls.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Confirm & append rows (1)" }));

    await waitFor(() => expect(postCalls.length).toBe(1));
    const body = JSON.parse(String(postCalls[0]?.body));
    expect(body.mode).toBe("add");
    expect(body.source).toBe("upload");
  });
});
