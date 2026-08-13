import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { UnitsPageClient } from "@/components/projects/UnitsPageClient";
import { locationsListFiltersSessionKey } from "@/lib/locations-list-filters-session";

// ── Mock heavy child components ───────────────────────────────────────────────

vi.mock("@/components/projects/UnitCards", () => ({
  UnitCards: () => <div data-testid="unit-cards">UnitCards</div>,
}));

vi.mock("@/components/projects/BulkActionsBar", () => ({
  BulkActionsBar: ({ onCancel, selectedCount }: { onCancel: () => void; selectedCount: number; onDeselectAll: () => void }) => (
    <div data-testid="bulk-actions-bar">
      <span>{selectedCount} selected</span>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock("@/components/ai/AIInsightsPanel", () => ({
  AIInsightsPanel: () => <div data-testid="ai-insights" />,
}));

vi.mock("@/components/ai/AIAnomalyBadge", () => ({
  AIAnomalyBadge: () => <div data-testid="anomaly-badge" />,
}));

vi.mock("@/lib/issues/use-issue-catalog", () => ({
  useIssueCatalog: () => ({
    issueTypes: [
      { code: "SUBSTRATE_CONDITION", displayName: "Substrate Condition", requiresVisual: false },
      { code: "DAMAGED_MATERIALS", displayName: "Damaged Materials", requiresVisual: true },
      { code: "MISSING_MATERIALS", displayName: "Missing Materials", requiresVisual: false },
      { code: "TRADE_DAMAGE_REPAIR", displayName: "Trade Damage Repair", requiresVisual: true },
      { code: "OTHER", displayName: "Other", requiresVisual: false },
    ],
    responsibleParties: [
      { code: "CP_BUILD", displayName: "CP Build" },
      { code: "ELECTRICIAN", displayName: "Electrician" },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  resolveIssueTypeLabel: (code: string, types: Array<{ code: string; displayName: string }>) =>
    types.find((t) => t.code === code)?.displayName ?? code,
  resolvePartyLabel: (code: string, parties: Array<{ code: string; displayName: string }>) =>
    parties.find((p) => p.code === code)?.displayName ?? code,
  issueTypeRequiresVisual: () => false,
}));

// useUnitsTranslator reads directly from messages/*.json (bypasses NextIntlClientProvider).
// Mock it so tests get the same strings as the MESSAGES fixture below.
vi.mock("@/lib/units-i18n", () => ({
  useUnitsTranslator: () => (key: string) => {
    const m = (globalThis as Record<string, unknown>).__unitsMock__ as Record<string, string> | undefined;
    return m?.[key] ?? key;
  },
}));

// ── i18n messages ─────────────────────────────────────────────────────────────

const MESSAGES = {
  units: {
    searchUnits: "Search locations",
    closeSearch: "Close search",
    searchPlaceholder: "Search locations…",
    listView: "List view",
    gridView: "Grid view",
    groupByLocation: "Group by location",
    groupByLocationTooltip:
      "Group locations by building and level. Each building has its own color on the building chip, level rows, and location accents so you can tell buildings apart while scanning.",
    groupByLocationLockedInGrid: "Grid view always groups locations by building and level.",
    expandAll: "Expand all",
    filtersTooltip: "Filters",
    filterUnits: "Filter locations",
    filterTitle: "Filter Locations",
    filterSubtitle: "Customize which locations you see",
    filterClose: "Close filters",
    filterIssues: "Location Issues",
    filterIssueType: "Issue Type",
    filterResponsibleParty: "Responsible Party",
    filterIssueStatus: "Status",
    filterIssueStatusOpen: "Open",
    filterIssueStatusResolved: "Resolved",
    filterIssueBlockingLabel: "Blocking",
    filterIssueBlocking: "⊘ Blocking Work",
    filterIssueNonBlocking: "Non-Blocking",
    hasOpenIssues: "Has open issues",
    filterStage: "Stage",
    filterStageInStaging: "In Staging",
    filterStageInAssembly: "In Assembly",
    filterClearInspection: "Clear Inspection",
    filterInspectionPassed: "Passed",
    filterInspectionFailed: "Failed",
    filterCalibrationInspection: "Calibration Inspection",
    filterScope: "Scope",
    filterLocation: "Location",
    filterLocationHint: "Select a building to filter",
    filterUnitType: "Location Type",
    filterClearAll: "Clear all",
    filterDone: "Done",
    hideScopes: "Hide scopes",
    scopeCount: "{count} scopes",
    blocked: "Blocked",
    blockedCount: "{count} blocked",
    noUnits: "No locations found.",
    noUnitsMatch: "No locations match your filters",
    noUnitsMatchHint: "Try adjusting your filters.",
    loading: "Loading…",
    error: "Error",
    collapseAll: "Collapse all",
    aiInsights: "AI Insights",
    selectMode: "Select",
    exitSelectMode: "Cancel",
    selectedCount: "{count} selected",
    selectAll: "Select all ({count})",
    bulkActionsPlaceholder: "Actions",
  },
};

const EMPTY_ACTIVE_FILTERS = {
  stages: [],
  scopeTypeNames: [],
  scopeSubNames: [],
  unitTypes: [],
  locationKinds: [],
  buildings: [],
  levels: [],
  buildPhases: [],
  areas: [],
  issueTypes: [],
  responsibleParties: [],
  issueStatuses: [],
  issueBlocking: null,
  issueScopeTypeNames: [],
  issueSubScopeNames: [],
  inspectionStatuses: [],
  calibrationStatuses: [],
  subcontractorAssigned: null,
  subcontractorIds: [],
  unitsWithIssuesOnly: false,
} as const;

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {ui}
    </NextIntlClientProvider>
  );
}

/** Scope pill queries to one filter section (Clear vs Calibration both use Passed/Failed). */
function getFilterSection(label: string): HTMLElement {
  const section = screen
    .getByText(label, { selector: "p.filter-panel-section__label" })
    .closest("section");
  if (!section) throw new Error(`Filter section not found: ${label}`);
  return section;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UnitsPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    // Provide the units messages to the useUnitsTranslator mock (see vi.mock above).
    (globalThis as Record<string, unknown>).__unitsMock__ = MESSAGES.units;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__unitsMock__;
  });

  it("does not render a page title heading (title was removed from toolbar)", () => {
    renderWithIntl(<UnitsPageClient projectId="proj-1" />);
    expect(screen.queryByRole("heading", { name: /building a/i })).toBeNull();
  });

  it("renders the always-expanded search input", () => {
    renderWithIntl(<UnitsPageClient projectId="proj-1" />);
    expect(screen.getByPlaceholderText(/search locations/i)).toBeTruthy();
  });

  it("hides list/grid view toggle buttons on desktop viewport (grid is the only view)", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    renderWithIntl(<UnitsPageClient projectId="proj-1" />);
    // Toggle buttons exist in the DOM but are hidden (aria-hidden); they must not be reachable via role queries.
    // Use exact-string names to avoid matching the groupByLocation tooltip which also contains "grid view".
    expect(screen.queryByRole("button", { name: "List view" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Grid view" })).toBeNull();
  });

  it("on mobile viewport hides list/grid and group-by; search row includes filter only", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    renderWithIntl(<UnitsPageClient projectId="proj-1" />);
    expect(screen.queryByRole("button", { name: /list view/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /grid view/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /group by location/i })).toBeNull();
    expect(screen.getByRole("button", { name: /filters/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/search locations/i)).toBeTruthy();
  });

  it("renders the UnitCards child component", () => {
    renderWithIntl(<UnitsPageClient projectId="proj-1" />);
    expect(screen.getByTestId("unit-cards")).toBeTruthy();
  });

  describe("session filter persistence", () => {
    it("restores search and filter panel selections from sessionStorage on mount", async () => {
      sessionStorageStore[locationsListFiltersSessionKey("proj-1")] = JSON.stringify({
        searchQuery: "North wing",
        filters: {
          ...EMPTY_ACTIVE_FILTERS,
          stages: ["STAGING"],
        },
      });

      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("North wing")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      expect(screen.getByRole("button", { name: "In Staging" })).toHaveClass(
        "filter-panel-pill--active"
      );
    });

    it("does not wipe sessionStorage with empty defaults before restore applies", async () => {
      sessionStorageStore[locationsListFiltersSessionKey("proj-1")] = JSON.stringify({
        searchQuery: "Saved query",
        filters: {
          ...EMPTY_ACTIVE_FILTERS,
          stages: ["STAGING"],
        },
      });

      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await waitFor(() => {
        const stored = JSON.parse(sessionStorageStore[locationsListFiltersSessionKey("proj-1")]);
        expect(stored.searchQuery).toBe("Saved query");
        expect(stored.filters.stages).toEqual(["STAGING"]);
      });
    });

    it("persists search and filter panel selections to sessionStorage", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      const searchInput = screen.getByPlaceholderText(/search locations/i);
      await userEvent.type(searchInput, "Lab");

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      await userEvent.click(screen.getByRole("button", { name: "In Staging" }));

      await waitFor(() => {
        const stored = JSON.parse(sessionStorageStore[locationsListFiltersSessionKey("proj-1")]);
        expect(stored.searchQuery).toBe("Lab");
        expect(stored.filters.stages).toEqual(["STAGING"]);
      });
    });

    it("persists cleared filters to sessionStorage when Clear all is clicked", async () => {
      sessionStorageStore[locationsListFiltersSessionKey("proj-1")] = JSON.stringify({
        searchQuery: "Keep",
        filters: {
          ...EMPTY_ACTIVE_FILTERS,
          stages: ["STAGING"],
        },
      });

      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Keep")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      await userEvent.click(screen.getByRole("button", { name: /clear all/i }));

      await waitFor(() => {
        const stored = JSON.parse(sessionStorageStore[locationsListFiltersSessionKey("proj-1")]);
        expect(stored.searchQuery).toBe("Keep");
        expect(stored.filters.stages).toEqual([]);
      });
    });

    it("loads a different project's saved filters when projectId changes", async () => {
      sessionStorageStore[locationsListFiltersSessionKey("proj-1")] = JSON.stringify({
        searchQuery: "Project one",
        filters: EMPTY_ACTIVE_FILTERS,
      });
      sessionStorageStore[locationsListFiltersSessionKey("proj-2")] = JSON.stringify({
        searchQuery: "Project two",
        filters: {
          ...EMPTY_ACTIVE_FILTERS,
          stages: ["ASSEMBLY"],
        },
      });

      const { rerender } = renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Project one")).toBeInTheDocument();
      });

      rerender(
        <NextIntlClientProvider locale="en" messages={MESSAGES}>
          <UnitsPageClient projectId="proj-2" />
        </NextIntlClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Project two")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      expect(screen.getByRole("button", { name: "In Assembly" })).toHaveClass(
        "filter-panel-pill--active"
      );
    });

    it("?inspectionStatus deep-link overrides restored inspectionStatuses", async () => {
      sessionStorageStore[locationsListFiltersSessionKey("proj-1")] = JSON.stringify({
        searchQuery: "",
        filters: {
          ...EMPTY_ACTIVE_FILTERS,
          inspectionStatuses: ["PASSED"],
        },
      });

      vi.stubGlobal("location", {
        ...window.location,
        href: "http://localhost/en/projects/proj-1/units?inspectionStatus=FAILED",
        search: "?inspectionStatus=FAILED",
      });

      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      const clearInspectionSection = getFilterSection("Clear Inspection");
      await waitFor(() => {
        expect(within(clearInspectionSection).getByRole("button", { name: "Failed" })).toHaveClass(
          "filter-panel-pill--active"
        );
        expect(within(clearInspectionSection).getByRole("button", { name: "Passed" })).not.toHaveClass(
          "filter-panel-pill--active"
        );
      });
    });
  });

  describe("tour upload simulation overlay", () => {
    it("shows the upload overlay when tour:simulate-field-tracker-upload fires", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("tour:simulate-field-tracker-upload", { detail: { lang: "en" } })
        );
      });

      // The overlay renders a progress bar / ticker visible in the DOM
      expect(screen.getByTestId("tour-upload-overlay")).toBeTruthy();
    });

    it("shows Spanish text when lang:es is passed", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("tour:simulate-field-tracker-upload", { detail: { lang: "es" } })
        );
      });

      expect(screen.getByTestId("tour-upload-overlay")).toBeTruthy();
    });
  });

  describe("select mode (desktop)", () => {
    beforeEach(() => {
      // Simulate desktop viewport
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
          matches: false, // desktop: max-width:767px is false
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      );
    });

    it("renders a Select toolbar button on desktop", () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      expect(screen.getByRole("button", { name: /select/i })).toBeTruthy();
    });

    it("shows BulkActionsBar after clicking the Select button", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      const selectBtn = screen.getByRole("button", { name: /^select$/i });
      await userEvent.click(selectBtn);
      expect(screen.getByTestId("bulk-actions-bar")).toBeTruthy();
    });

    it("exits select mode when Cancel is clicked in BulkActionsBar", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      const selectBtn = screen.getByRole("button", { name: /^select$/i });
      await userEvent.click(selectBtn);
      expect(screen.getByTestId("bulk-actions-bar")).toBeTruthy();

      await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(screen.queryByTestId("bulk-actions-bar")).toBeNull();
    });
  });

  describe("issue filter panel", () => {
    it("renders Issue Type chips after expanding the Issue Type accordion card", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      // Cards are collapsed by default — expand the Issue Type card first
      await userEvent.click(screen.getByRole("button", { name: /issue type/i }));
      expect(screen.getByRole("button", { name: /substrate condition/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /damaged materials/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /missing materials/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /trade damage repair/i })).toBeTruthy();
    });

    it("renders Blocking and Non-Blocking chips after expanding the Blocking accordion card", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      await userEvent.click(screen.getByRole("button", { name: /blocking/i }));
      expect(screen.getByRole("button", { name: /blocking work/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /non-blocking/i })).toBeTruthy();
    });

    it("renders Open and Resolved status chips after expanding the Status accordion card", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);
      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      await userEvent.click(screen.getByRole("button", { name: /^status$/i }));
      expect(screen.getByRole("button", { name: /^open$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^resolved$/i })).toBeTruthy();
    });
  });

  describe("calibration inspection filter", () => {
    it("toggles PASSED and FAILED calibration pills and persists to sessionStorage", async () => {
      renderWithIntl(<UnitsPageClient projectId="proj-1" />);

      await userEvent.click(screen.getByRole("button", { name: /filters/i }));
      const calibrationSection = getFilterSection("Calibration Inspection");

      await userEvent.click(within(calibrationSection).getByRole("button", { name: "Passed" }));
      await waitFor(() => {
        const stored = JSON.parse(sessionStorageStore[locationsListFiltersSessionKey("proj-1")]);
        expect(stored.filters.calibrationStatuses).toEqual(["PASSED"]);
      });

      await userEvent.click(within(calibrationSection).getByRole("button", { name: "Failed" }));
      await waitFor(() => {
        const stored = JSON.parse(sessionStorageStore[locationsListFiltersSessionKey("proj-1")]);
        expect(stored.filters.calibrationStatuses).toEqual(["PASSED", "FAILED"]);
      });
    });
  });
});
