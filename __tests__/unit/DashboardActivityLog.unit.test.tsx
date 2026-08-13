import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, style }: { href: string; children: ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  ),
  usePathname: () => "/activity",
}));

// ── i18n messages ──────────────────────────────────────────────────────────────

const MESSAGES = {
  dashboardActivity: {
    pageTitle: "Activity",
    pageSubtitle: "All activity across your projects",
    allProjects: "All projects",
    filterProject: "Project",
    searchPlaceholder: "Search activity…",
    filterActivity: "Filter activity",
    clearFilters: "Clear",
    loadMore: "Load more",
    loading: "Loading activity…",
    loadingMore: "Loading…",
    error: "Failed to load activity.",
    empty: "No activity yet.",
    emptyFiltered: "No activity matches your filters.",
    viewInProject: "View in project",
    filterDone: "Done",
    filterClearAll: "Clear all",
    filterDateRange: "Date range",
    filterEventType: "Event type",
    dateAll: "All time",
    date7d: "Last 7 days",
    date14d: "Last 14 days",
    date30d: "Last 30 days",
    dateCustom: "Custom",
    dateTo: "to",
    closeFilterPanel: "Close filter panel",
    filterProjectSearchPlaceholder: "Search projects…",
    filterProjectSelectAll: "Select all",
    filterProjectClear: "Clear",
    filterProjectNoMatches: "No projects match your search.",
    filterProjectCount: "{count} projects",
    exportLog: "Export Log",
    exportActivity: "Export activity log",
    dateRange: "Date Range",
    exportDialogTitle: "Export Activity Log",
    exportDialogSubtitle: "Choose how far back to include",
    exportDialogClose: "Close export dialog",
    exportActiveFiltersNotice: "Your current filters will also be applied:",
    exportProjectsLabel: "Projects",
    exportEventTypesLabel: "Event types",
    exportScopeAll: "All Projects",
    exportGenerating: "Generating PDF — this may take a moment…",
    exportGeneratingShort: "Generating…",
    exportDone: "✓ PDF ready — check your downloads.",
    exportEmptyTitle: "No events found for the selected range.",
    exportEmptyHelp: "Try selecting a wider date range or clearing filters.",
    exportFailed: "Export failed.",
    exportEmptyResponse: "The server returned an empty response. Please try again.",
    exportCancel: "Cancel",
    exportClose: "Close",
    exportSubmit: "Export as PDF",
    exportSubmitExcel: "Export as Excel",
    exportGeneratingPdf: "Generating PDF — this may take a moment…",
    exportGeneratingExcel: "Generating Excel — this may take a moment…",
    exportDonePdf: "✓ PDF ready — check your downloads.",
    exportDoneExcel: "✓ Excel ready — check your downloads.",
    exportTryAgain: "Try again",
    eventCountSummary: "{count, plural, one {# event} other {# events}}",
    eventCountFilteredSummary: "{filtered} of {total} {total, plural, one {event} other {events}}",
    pendingSyncBadge: "Pending sync",
  },
  activityLog: {
    pendingSyncBadge: enMessages.activityLog.pendingSyncBadge,
    syncFailedBadge: enMessages.activityLog.syncFailedBadge,
    eventTypeInspectionSyncFailed: enMessages.activityLog.eventTypeInspectionSyncFailed,
    syncErrorCardAria: enMessages.activityLog.syncErrorCardAria,
    syncErrorDetail: enMessages.activityLog.syncErrorDetail,
    gpsSection: enMessages.activityLog.gpsSection,
  },
  activityHeatmap: {
    outcomeOnMap: enMessages.activityHeatmap.outcomeOnMap,
    outcomeNoCapture: enMessages.activityHeatmap.outcomeNoCapture,
    outcomeLegacy: enMessages.activityHeatmap.outcomeLegacy,
  },
  captureMetadata: {
    locationNotRecordedDenied: enMessages.captureMetadata.locationNotRecordedDenied,
    locationNotRecordedTimeout: enMessages.captureMetadata.locationNotRecordedTimeout,
    locationNotRecordedUnavailable: enMessages.captureMetadata.locationNotRecordedUnavailable,
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

const PROJECTS = [
  { id: "proj-1", name: "Harbor Plaza" },
  { id: "proj-2", name: "Westfield Tower" },
];

const MANY_PROJECTS = [
  { id: "proj-1", name: "Harbor Plaza" },
  { id: "proj-2", name: "Westfield Tower" },
  { id: "proj-3", name: "Riverside Condos" },
  { id: "proj-4", name: "Oakwood Homes" },
];

function makeEvent(overrides: Partial<{
  id: string;
  projectId: string;
  eventType: string;
  userName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}> = {}) {
  return {
    id: overrides.id ?? "evt-1",
    projectId: overrides.projectId ?? "proj-1",
    eventType: overrides.eventType ?? "SCOPE_STATUS_UPDATED",
    userId: "user-1",
    userName: overrides.userName ?? "Alice",
    metadata: overrides.metadata ?? {
      scopeName: "Framing",
      building: "South",
      level: "1",
      unit: "S101",
      toStatus: "Completed",
    },
    createdAt: overrides.createdAt ?? new Date(Date.now() - 60_000).toISOString(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("DashboardActivityLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Several tests stub the `URL` global to mock `createObjectURL` /
  // `revokeObjectURL`. Without an explicit cleanup the stubbed object
  // (which lacks the real `URL` constructor/prototype) would leak into
  // subsequent tests and break anything that calls `new URL(...)`.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading state on mount", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    expect(screen.getByText("Loading activity…")).toBeInTheDocument();
  });

  it("renders activity cards after fetch", async () => {
    const events = [
      makeEvent({ id: "evt-1", projectId: "proj-1", userName: "Alice" }),
      makeEvent({ id: "evt-2", projectId: "proj-2", userName: "Bob" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: null }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
  });

  it("shows project name badges on each card", async () => {
    const events = [
      makeEvent({ id: "evt-1", projectId: "proj-1" }),
      makeEvent({ id: "evt-2", projectId: "proj-2" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: null }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Harbor Plaza")).toBeInTheDocument();
    });
    expect(screen.getByText("Westfield Tower")).toBeInTheDocument();
  });

  it("project pill links to the project activity log", async () => {
    const events = [makeEvent({ id: "evt-1", projectId: "proj-1" })];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: null }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Harbor Plaza")).toBeInTheDocument();
    });
    const link = screen.getByText("Harbor Plaza").closest("a");
    expect(link).toHaveAttribute("href", "/projects/proj-1/log/activity");
  });

  it("shows empty state when no events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [], nextCursor: null }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load activity.")).toBeInTheDocument();
    });
  });

  it("filters events by search text (client-side)", async () => {
    const events = [
      makeEvent({ id: "evt-1", userName: "Alice", metadata: { scopeName: "Framing", toStatus: "Complete", building: "S", level: "1", unit: "S101" } }),
      makeEvent({ id: "evt-2", userName: "Bob", metadata: { scopeName: "Plumbing", toStatus: "Complete", building: "S", level: "1", unit: "S102" } }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: null, totalCount: 2 }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });

    expect(screen.getByTestId("activity-list-count")).toHaveTextContent("2 events");

    const searchInput = screen.getByPlaceholderText("Search activity…");
    fireEvent.change(searchInput, { target: { value: "framing" } });

    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
      // Bob's event (Plumbing) should be filtered out — no "Bob" anywhere
      expect(screen.queryAllByText(/Bob/).length).toBe(0);
      expect(screen.getByTestId("activity-list-count")).toHaveTextContent("1 of 2 events");
    });
  });

  it("shows Load more button when nextCursor is present", async () => {
    const events = [makeEvent()];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: "2025-01-01T00:00:00.000Z" }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeInTheDocument();
    });
  });

  it("opens the filter panel when Filter button is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [], nextCursor: null }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument();
    });

    const filterButton = screen.getByLabelText("Filter activity");
    fireEvent.click(filterButton);

    expect(screen.getByRole("heading", { name: "Filter activity" })).toBeInTheDocument();
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("refetches with eventType query param when an event-type filter is toggled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [], nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fetchMock.mockClear();
    fireEvent.click(screen.getByLabelText("Filter activity"));
    fireEvent.click(screen.getByText("Inspection Submitted"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const url = String(fetchMock.mock.calls.at(-1)?.[0] ?? "");
      expect(url).toContain("eventType=INSPECTION_SUBMITTED");
    });
  });

  it("refetches with locationOutcome query param when a GPS filter preset is applied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [], nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} canViewLocationTracking />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fetchMock.mockClear();
    fireEvent.click(screen.getByLabelText("Filter activity"));
    fireEvent.click(screen.getByRole("button", { name: "Not captured" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const url = String(fetchMock.mock.calls.at(-1)?.[0] ?? "");
      expect(url).toContain("locationOutcome=no_capture");
    });
  });

  // ── Multi-select project filter ────────────────────────────────────────────

  async function openFilterPanel() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ events: [], nextCursor: null }) })
    );
    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");
    render(
      <Wrapper>
        <DashboardActivityLog projects={MANY_PROJECTS} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Filter activity"));
  }

  it("renders a searchable checkbox for every project in the panel (not a dropdown)", async () => {
    await openFilterPanel();

    // Every project shows as a checkbox (aria-label = project name).
    for (const p of MANY_PROJECTS) {
      expect(screen.getByLabelText(p.name)).toHaveAttribute("type", "checkbox");
    }
    // Legacy <select> must not be present.
    expect(document.querySelector("select")).toBeNull();
    // Search input is present.
    expect(screen.getByPlaceholderText("Search projects…")).toBeInTheDocument();
  });

  it("filters the visible project list when the user types in the project search", async () => {
    await openFilterPanel();

    const search = screen.getByPlaceholderText("Search projects…");
    fireEvent.change(search, { target: { value: "river" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Riverside Condos")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Harbor Plaza")).toBeNull();
    expect(screen.queryByLabelText("Westfield Tower")).toBeNull();
  });

  it("shows a no-matches message when the search returns zero projects", async () => {
    await openFilterPanel();

    fireEvent.change(screen.getByPlaceholderText("Search projects…"), {
      target: { value: "zzz-no-match" },
    });

    expect(screen.getByText("No projects match your search.")).toBeInTheDocument();
  });

  it("Select all checks every currently visible (filtered) project", async () => {
    await openFilterPanel();

    // Narrow to 2 matches: "o" matches Harbor, Westfield Tower, Oakwood, Riverside Condos? Use "wood"
    fireEvent.change(screen.getByPlaceholderText("Search projects…"), {
      target: { value: "wood" },
    });

    // Only Oakwood Homes should be visible
    expect(screen.getByLabelText("Oakwood Homes")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Select all"));

    // Oakwood is now checked. Others are NOT checked (they were filtered out).
    expect(screen.getByLabelText("Oakwood Homes")).toBeChecked();

    // Clear the search and confirm the others are still unchecked
    fireEvent.change(screen.getByPlaceholderText("Search projects…"), { target: { value: "" } });
    expect(screen.getByLabelText("Harbor Plaza")).not.toBeChecked();
    expect(screen.getByLabelText("Westfield Tower")).not.toBeChecked();
    expect(screen.getByLabelText("Riverside Condos")).not.toBeChecked();
  });

  it("Clear deselects all projects", async () => {
    await openFilterPanel();

    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByLabelText("Westfield Tower"));
    expect(screen.getByLabelText("Harbor Plaza")).toBeChecked();
    expect(screen.getByLabelText("Westfield Tower")).toBeChecked();

    fireEvent.click(screen.getByText("Clear"));

    expect(screen.getByLabelText("Harbor Plaza")).not.toBeChecked();
    expect(screen.getByLabelText("Westfield Tower")).not.toBeChecked();
  });

  it("sends projectIds (comma-separated) on the API call when projects are selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [], nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");
    render(
      <Wrapper>
        <DashboardActivityLog projects={MANY_PROJECTS} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Filter activity"));
    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByLabelText("Riverside Condos"));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0] as string;
      // Order-independent: both IDs present, param key is `projectIds`, no
      // stale `projectId=` param.
      expect(lastCall).toMatch(/projectIds=/);
      expect(lastCall).toContain("proj-1");
      expect(lastCall).toContain("proj-3");
      expect(lastCall).not.toMatch(/\bprojectId=[^s]/);
    });
  });

  it("pill shows project name when exactly one project is selected", async () => {
    await openFilterPanel();

    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    // Close the panel so the toolbar pill is the only instance of the name.
    fireEvent.click(screen.getByText("Done"));

    // After closing the panel, the toolbar renders a pill labeled with the name.
    await waitFor(() => {
      expect(screen.getByText("Harbor Plaza")).toBeInTheDocument();
    });
  });

  it("pill shows '{count} projects' when multiple projects are selected", async () => {
    await openFilterPanel();

    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByLabelText("Westfield Tower"));
    fireEvent.click(screen.getByLabelText("Riverside Condos"));
    fireEvent.click(screen.getByText("Done"));

    await waitFor(() => {
      expect(screen.getByText("3 projects")).toBeInTheDocument();
    });
  });

  it("toolbar pill X button clears all selected projects", async () => {
    await openFilterPanel();
    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByLabelText("Westfield Tower"));
    fireEvent.click(screen.getByText("Done"));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Filter activity" })).not.toBeInTheDocument();
    });

    // The toolbar pill is a button — clicking it clears the selection.
    const pill = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(pill);

    // Re-open the panel; nothing should be checked.
    fireEvent.click(screen.getByLabelText("Filter activity"));
    expect(screen.getByLabelText("Harbor Plaza")).not.toBeChecked();
    expect(screen.getByLabelText("Westfield Tower")).not.toBeChecked();
  });

  // ── Export flow ────────────────────────────────────────────────────────────

  async function mountAndReady(fetchImpl: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchImpl);
    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");
    render(
      <Wrapper>
        <DashboardActivityLog projects={MANY_PROJECTS} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument();
    });
  }

  it("renders the Export Log button in the toolbar", async () => {
    await mountAndReady(
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ events: [], nextCursor: null }) }),
    );
    expect(screen.getByRole("button", { name: "Export activity log" })).toBeInTheDocument();
  });

  it("opens the export dialog with date-range presets when Export Log is clicked", async () => {
    await mountAndReady(
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ events: [], nextCursor: null }) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));

    expect(screen.getByText("Export Activity Log")).toBeInTheDocument();
    expect(screen.getByText("Choose how far back to include")).toBeInTheDocument();
    // Date presets visible
    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 14 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    // Primary action
    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export as Excel" })).toBeInTheDocument();
  });

  it("shows selected-project and event-type context inside the dialog", async () => {
    await mountAndReady(
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ events: [], nextCursor: null }) }),
    );

    // Select two projects via the filter panel first
    fireEvent.click(screen.getByLabelText("Filter activity"));
    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByLabelText("Westfield Tower"));
    fireEvent.click(screen.getByText("Done"));

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));

    expect(screen.getByText("Your current filters will also be applied:")).toBeInTheDocument();
    // Label cells use <strong> inside a <p>; assert on the names' presence
    expect(screen.getByText(/Harbor Plaza, Westfield Tower/)).toBeInTheDocument();
  });

  it("POSTs to /api/activity/export-pdf with the selected date range and projects, then downloads the PDF", async () => {
    // Stub fetch: GET → empty page; POST → a fake PDF blob
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([pdfBytes], { type: "application/pdf" })),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });

    // Shim URL.createObjectURL / revokeObjectURL for jsdom
    const createUrl = vi.fn().mockReturnValue("blob:fake");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });

    await mountAndReady(fetchMock);

    // Pick Last 7 days + one project
    fireEvent.click(screen.getByLabelText("Filter activity"));
    fireEvent.click(screen.getByLabelText("Harbor Plaza"));
    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Filter activity" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByText("Last 7 days"));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/activity/export-pdf"),
      );
      expect(postCall).toBeTruthy();
    });

    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("/api/activity/export-pdf"),
    )!;
    const req = JSON.parse((postCall[1] as RequestInit).body as string) as {
      eventTypes: string[];
      projectIds?: string[];
      dateFrom?: string;
      dateTo?: string;
      scopeLabel: string;
      filterSummary: string;
    };
    expect(req.projectIds).toEqual(["proj-1"]);
    expect(req.dateFrom).toBeTruthy();
    expect(req.scopeLabel).toBe("Harbor Plaza");
    expect(req.filterSummary).toContain("Last 7 days");

    // After the PDF resolves the dialog shows the "done" state
    await waitFor(() => {
      expect(screen.getByText("✓ PDF ready — check your downloads.")).toBeInTheDocument();
    });
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it("POSTs to /api/activity/export-xlsx when Export as Excel is chosen", async () => {
    const xlsxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-xlsx")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([xlsxBytes])),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as Excel" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/activity/export-xlsx"),
      );
      expect(postCall).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("✓ Excel ready — check your downloads.")).toBeInTheDocument();
    });
  });

  it("sends scopeLabel='All Projects' when no projects are selected", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([new Uint8Array([0x25])])),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/activity/export-pdf"),
      );
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("/api/activity/export-pdf"),
    )!;
    const req = JSON.parse((postCall[1] as RequestInit).body as string) as {
      scopeLabel: string;
      projectIds?: string[];
    };
    expect(req.scopeLabel).toBe("All Projects");
    expect(req.projectIds).toBeUndefined();
  });

  it("shows the empty state when the API returns 404", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({ error: "No activity events match the current filters." }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      expect(
        screen.getByText("No events found for the selected range."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export as Excel" })).toBeInTheDocument();
  });

  it("wraps the PDF bytes in an octet-stream blob so Chrome saves to disk instead of opening inline", async () => {
    // Regression for the dev report where the success toast showed but the
    // PDF never arrived in ~/Downloads. The blob was typed `application/pdf`,
    // which let Chrome's built-in PDF viewer hijack the `<a download>` click
    // and render inline in a new tab — the entry landed in chrome://downloads
    // but no file was written. Using `application/octet-stream` forces a
    // save-to-disk regardless of the "Open PDFs in browser" setting.
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([pdfBytes], { type: "application/pdf" })),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:octet-stream-test");
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      expect(screen.getByText("✓ PDF ready — check your downloads.")).toBeInTheDocument();
    });

    // The blob passed to createObjectURL must be typed octet-stream so
    // Chrome's PDF viewer never grabs it — the `.pdf` extension is preserved
    // by the `download` attribute on the anchor, not by the blob MIME.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("application/octet-stream");
  });

  it("treats an empty blob response (size === 0) as an error, not a silent success", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([], { type: "application/pdf" })),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed.")).toBeInTheDocument();
    });
    expect(screen.getByText(/empty response/i)).toBeInTheDocument();

    errorSpy.mockRestore();
  });

  it("clears export success timers and anchor cleanup on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const revokeObjectURL = vi.fn();
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([pdfBytes], { type: "application/pdf" })),
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:fake"),
      revokeObjectURL,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");
    const { unmount } = render(
      <Wrapper>
        <DashboardActivityLog projects={MANY_PROJECTS} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      expect(screen.getByText("✓ PDF ready — check your downloads.")).toBeInTheDocument();
    });

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    clearTimeoutSpy.mockRestore();
  });

  // ── Scroll containment regression (FT-0036) ───────────────────────────────
  //
  // Without these CSS invariants the entire page (including the sidebar)
  // scrolls when the activity list grows:
  //
  //  1. `minHeight: 0` on the event list flex child — without it,
  //     `min-height: auto` lets the element grow past the flex container's
  //     allocated height so `overflow-y: auto` never activates.
  //
  //  2. `flex: 1; minHeight: 0; overflow: hidden` on the root div — fills the
  //     activity tab content area without absolute positioning (which collapsed
  //     the tab layout wrapper to zero height in PR #1203).
  //
  //  3. Activity layout + dashboard <main> are flex columns so the root can grow.
  it("event list has minHeight:0 and root container is flex fill (FT-0036)", async () => {
    const events = Array.from({ length: 5 }, (_, i) => makeEvent({ id: `evt-${i}` }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events, nextCursor: "cursor-abc" }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeInTheDocument();
    });

    const eventListDiv = screen.getByTestId("activity-log-event-list");
    expect(eventListDiv).toHaveStyle({ minHeight: "0px", overflowY: "auto" });

    // Root container: flex fill keeps scroll inside the event list, not <main>.
    expect(screen.getByTestId("activity-log-root")).toHaveStyle({
      flex: "1 1 0%",
      minHeight: "0px",
      overflow: "hidden",
    });
  });

  it("shows the error state when the API returns 500", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/api/activity/export-pdf")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "PDF generation failed." }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ events: [], nextCursor: null }),
      });
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await mountAndReady(fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed.")).toBeInTheDocument();
    });
    expect(screen.getByText("PDF generation failed.")).toBeInTheDocument();

    errorSpy.mockRestore();
  });

  it("cancels the dialog and closes it", async () => {
    await mountAndReady(
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ events: [], nextCursor: null }) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export activity log" }));
    expect(screen.getByText("Export Activity Log")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Export Activity Log")).not.toBeInTheDocument();
    });
  });

  it("opens sync error detail modal when an INSPECTION_SYNC_FAILED card is clicked", async () => {
    const syncFailureEvent = makeEvent({
      id: "evt-sync-fail",
      eventType: "INSPECTION_SYNC_FAILED",
      metadata: {
        formName: "Calibration",
        category: "CALIBRATION_INSPECTION",
        outcome: "PASS",
        offlineMutationId: "local-abc",
        building: "A",
        level: "1",
        unit: "101",
        scopeName: "Tile",
        syncErrors: [
          {
            attempt: 1,
            message: "HTTP 500: Internal Server Error",
            httpStatus: 500,
            errorKind: "retriable",
            recordedAt: "2026-06-25T10:00:00.000Z",
          },
        ],
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ events: [syncFailureEvent], nextCursor: null, totalCount: 1 }),
    }));

    const { DashboardActivityLog } = await import("@/components/DashboardActivityLog");

    render(
      <Wrapper>
        <DashboardActivityLog projects={PROJECTS} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sync failed")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: enMessages.activityLog.syncErrorCardAria }));

    expect(screen.getByText(enMessages.activityLog.syncErrorDetail.title)).toBeInTheDocument();
    expect(screen.getByText("HTTP 500: Internal Server Error")).toBeInTheDocument();
  });
});
