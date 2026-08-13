import { Buffer } from "node:buffer";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { UnitCards, unitTypeColor } from "@/components/projects/UnitCards";
import { FIELD_TRACKER_UNITS_PAGE_LIMIT } from "@/lib/field-tracker-units";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";
import {
  notifyInspectionOverlayClosed,
  notifyInspectionOverlayOpened,
  resetInspectionOverlayChromeForTests,
} from "@/lib/inspections/inspection-overlay-chrome";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotData: vi.fn().mockResolvedValue(null),
  readSnapshotUnitsForProject: vi.fn().mockResolvedValue(null),
}));

const UNIT_MESSAGES = {
  units: {
    loading: "Loading locations…",
    error: "Failed to load locations: {error}",
    noUnits: "No locations found for this project.",
    noLocationsYet: "No locations yet",
    noLocationsYetHint: "Define buildings, levels, and units by uploading Location Builder data for this project.",
    noLocationsYetReadOnly: "Locations haven't been set up for this project yet.",
    openLocationBuilder: "Open Location Builder",
    openLocationBuilderAria: "Open Location Builder to add locations",
    noUnitsMatch: "No locations match your filters",
    noUnitsMatchHint: "Try adjusting your search or filter criteria.",
    filterTitle: "Filter Locations",
    filterSubtitle: "Customize which locations you see",
    filterClose: "Close filters",
    filterIssues: "Location Issues",
    filterBlocking: "⊘ Blocking",
    filterStage: "Stage",
    filterScope: "Scope",
    filterLocation: "Location",
    filterLocationHint: "Select a building to filter",
    filterUnitType: "Location Type",
    filterClearAll: "Clear all",
    filterDone: "Done",
    hideScopes: "Hide scopes",
    scopeCount: "{count, plural, one {# scope} other {# scopes}}",
    mobileUnitCardAria: "{unit}. {scopeSummary}. {pct}% complete. Open location details.",
    mobileUnitCardAriaScopesNone: "No scopes",
    mobileUnitCardAriaScopesUnnamed: "Scopes without display names",
    mobileUnitInstallProgressCaption:
      "{complete} out of {total} {total, plural, one {scope} other {scopes}} at install complete",
    blocked: "Blocked",
    blockedCount: "{count, plural, one {# blocked} other {# blocked}}",
    searchPlaceholder: "Search locations…",
    closeSearch: "Close search",
    searchUnits: "Search locations",
    listView: "List view",
    gridView: "Grid view",
    groupByLocation: "Group by Location",
    groupByLocationTooltip:
      "Group locations by building and level. Each building has its own color on the building chip, level rows, and location accents so you can tell buildings apart while scanning.",
    levelGroupHeading: "Level {level}",
    levelNotSet: "Level not set",
    buildingsVisibleSummary:
      "Showing {visible} of {total} {total, plural, one {building} other {buildings}}",
    buildingsCompactSummary:
      "{visible, number} of {total, number} {total, plural, one {building} other {buildings}}",
    locationsCompactSummary:
      "{visible, number} of {total, number} {total, plural, one {location} other {locations}}",
    scopeCompleteByScope: "% Complete by Scope",
    unitsFilteredSummary:
      "{showCount, number} of {totalCount, number} {totalCount, plural, one {location} other {locations}}",
    buildingChipUnitCount: "· {count, plural, one {# location} other {# locations}}",
    locationGroupUnitCount: "{count, plural, one {# location} other {# locations}}",
    buildingExpandAllLevels: "Expand all levels in {building}",
    buildingCollapseAllLevels: "Collapse all levels in {building}",
    levelGroupToggleExpand: "Expand {title}",
    levelGroupToggleCollapse: "Collapse {title}",
    locationMetaBuildPhaseShort: "Phase {phase}",
    locationMetaPhaseLabel: "Phase: {phase}",
    locationMetaArea: "Area {area}",
    locationMetaAreaLabel: "Area: {area}",
    locationMetaBuildPhase: "Build phase {phase}",
    levelSectionExpandAllUnits: "Expand all locations in {title}",
    levelSectionCollapseAllUnits: "Collapse all locations in {title}",
    expandAll: "Expand all",
    groupByLocationLockedInGrid: "Grid always groups by location.",
    gridUnitCardAria: "Location {unit}. {pct}% install complete. Open location details.",
    gridUnitCardAriaWithMedia: "Location {unit}. {pct}% install complete. Has media attached. Open location details.",
    noScopesGrid: "No scopes",
    scopeSquareAria: "{name}. Abbreviation {abbrev}. {detail}",
    scopeSquareSemantic_failed_inspection: "Failed inspection.",
    scopeSquareSemantic_blocked: "Blocked.",
    scopeSquareSemantic_inspection_ready: "Ready for inspection.",
    scopeSquareSemantic_inspection_passed: "Passed.",
    scopeSquareSemantic_install_complete: "Install complete.",
    scopeSquareSemantic_staging_assembly_progress: "In progress.",
    scopeSquareSemantic_not_started: "Not started.",
    scopeSquareSemantic_neutral: "Unknown.",
    filters: "Filters",
    filtersTooltip: "Filter locations",
    noIssues: "No issues",
    inspectionMarkReady: "Mark Ready",
    inspectionStatusLabel: "Inspection status:",
    inspectionStatusValueNotStarted: "Not started",
    inspectionStatusValueReady: "Ready",
    inspectionStart: "Start Clear Inspection",
    inspectionReady: "Ready",
    inspectionPassed: "Passed",
    inspectionFailed: "Failed: In Rework",
    inspectionMarkPassed: "Mark as Passed",
    inspectionMarkFailed: "Mark as Failed: In Rework",
    inspectionCancel: "Cancel & Revert",
    unitDetailModalTitle: "{unit}",
    unitDetailModalClose: "Close location details",
    unitDetailModalScopesCompleteCaption:
      "{complete, plural, =0 {0 scopes installed} one {# scope installed} other {# scopes installed}}",
    unitDetailModalInstallProgressPct: "{pct}% install complete",
    scopesSectionTitle: "Scopes ({count})",
    clearStage: "Clear",
    colScope: "Scope",
    upmInstallTeamLabel: "UPM install team",
    colStage: "Stage",
    colStatus: "Status",
    colClearInspection: "Clear Inspection",
    pickerSheetClose: "Close",
    inspectionStart: "Start Inspection",
    stageFieldTapToChange: "Change stage",
    statusFieldTapToChange: "Change status",
    stageChangeResetsStatus: "Changing stage clears status.",
    pickStatusSubtitle: "Choose status for this stage.",
    viewActivity: "View Activity",
    observations: "Observations",
    noObservations: "No observations yet",
    issues: "Issues",
    add: "Add",
    subScopesHeaderSuffix: "- {count} subscopes",
    qtyInstalledLabel: "QTY Installed",
    unassigned: "Unassigned",
    subcontractorLabel: "Subcontractor",
    subcontractorLoading: "Loading…",
    subcontractorError: "Failed to load",
    subcontractorSearchPlaceholder: "Search subcontractors…",
    subcontractorNoResults: "No subcontractors match",
    stageSheetTitle: "Select Stage",
    stageSheetSubtitle: "Choose the current stage.",
    stageSheetClose: "Close",
    statusSheetTitle: "Select Status",
    statusSheetClose: "Close",
    subScopesTooltip: "Manage sub-scopes",
    subScopesNameRequired: "Name is required",
    subScopesNameUnique: "Names must be unique",
    loadingMoreUnits: "Loading more…",
    loadMoreError: "Could not load more rows. {error}",
    loadMoreRetry: "Try again",
    scopesLoadedProgress: "{loaded, number} of {total, number} rows loaded",
    customSite: {
      sectionTitle: "Custom Locations · Project-wide",
      sectionSubtitle: "Field notes only — no install tracking",
      sectionToggleExpand: "Expand {title}",
      sectionToggleCollapse: "Collapse {title}",
      addAria: "Add custom site location",
      loading: "Loading custom locations…",
      emptyHint: "Add parking lots, loading docks, or other areas not in Location Builder.",
      loadError: "Could not load custom site locations",
    },
  },
  statusPhotoPrompt: {
    title: "Add photos to this update?",
    body: "Would you like to include photos or video?",
    addPhotos: "Add Photos / Video",
    skip: "Save Without Photos",
    cancel: "Cancel Status Change",
    uploading: "Uploading photos…",
    uploadError: "Upload failed.",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={UNIT_MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

const PROJECT_ID = "proj-test-123";

const MOCK_UNITS_RESPONSE = {
  units: [
    {
      id: "row-1",
      building: "A",
      level: "1",
      unit: "101",
      area: "850 SF",
      unitType: "1BR",
      description: "Flooring scope",
      scopeType: { id: "s1", code: "FLR", name: "Flooring" },
      qty: 850,
      uom: { code: "SF", name: "Square Feet" },
      percentComplete: 50,
      installer: { name: "Joe's Crew" },
      unifierSubId: null,
      shipPhase: "P1",
      buildPhase: "B1",
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
      subScopeInstances: [],
      rowIndex: 0,
    },
    {
      id: "row-2",
      building: "A",
      level: "1",
      unit: "101",
      area: "850 SF",
      unitType: "1BR",
      description: "Millwork scope",
      scopeType: { id: "s2", code: "MWK", name: "Millwork" },
      qty: null,
      uom: null,
      percentComplete: 100,
      installer: null,
      unifierSubId: "subcontractor-test-1",
      shipPhase: "",
      buildPhase: "",
      scopeStage: "STAGING",
      scopeStatus: "IN_PROGRESS",
      inspectionStatus: null,
      subScopeInstances: [],
      rowIndex: 1,
    },
    {
      id: "row-3",
      building: "B",
      level: "2",
      unit: "201",
      area: "",
      unitType: "2BR",
      description: "Electrical scope",
      scopeType: { id: "s3", code: "ELC", name: "Electrical" },
      qty: null,
      uom: null,
      percentComplete: 0,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      scopeStage: null,
      scopeStatus: "NOT_STARTED",
      inspectionStatus: null,
      subScopeInstances: [],
      rowIndex: 2,
    },
  ],
  hasMore: false,
  nextCursor: null,
  total: 3,
  totalUnits: 2,
};

/** Units fixture including one scope with 2 sub-scope instances (Cabinetry → Kitchen + Bath). */
const MOCK_UNITS_WITH_SUBSCOPES = {
  units: [
    {
      id: "row-cab",
      building: "A",
      level: "1",
      unit: "101",
      area: "",
      unitType: "2BR",
      description: "Cabinetry scope",
      scopeType: { id: "sc-cab", code: "CAB", name: "Cabinetry" },
      qty: 12,
      uom: { code: "EA", name: "Each" },
      percentComplete: 0,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
      rowIndex: 0,
      subScopeInstances: [
        {
          id: "inst-kitchen",
          subScopeId: "ss-kitchen",
          subScope: { id: "ss-kitchen", name: "Kitchen", displayOrder: 0, unitType: "2BR", scopeTypeId: "sc-cab" },
          qty: 6,
          scopeStage: null,
          scopeStatus: null,
          inspectionStatus: null,
        },
        {
          id: "inst-bath",
          subScopeId: "ss-bath",
          subScope: { id: "ss-bath", name: "Bath", displayOrder: 1, unitType: "2BR", scopeTypeId: "sc-cab" },
          qty: 6,
          scopeStage: null,
          scopeStatus: null,
          inspectionStatus: null,
        },
      ],
    },
    {
      id: "row-carpet",
      building: "A",
      level: "1",
      unit: "101",
      area: "",
      unitType: "2BR",
      description: "Carpet scope",
      scopeType: { id: "sc-carp", code: "CARP", name: "Carpet" },
      qty: 12,
      uom: { code: "SY", name: "Square Yards" },
      percentComplete: 0,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
      subScopeInstances: [],
      rowIndex: 1,
    },
  ],
};

function jsonResponse(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as Response;
}

/** Expand unit 101 scope row — avoids clicking Custom Locations bar (also aria-expanded=false). */
async function expandUnit101Row() {
  await waitFor(() => expect(screen.getByText("101")).toBeDefined());
  const unit101 = screen.getByText("101");
  const rowBtn = unit101.closest('button[aria-expanded="false"]');
  expect(rowBtn).toBeTruthy();
  fireEvent.click(rowBtn!);
}

function stubDefaultProjectFetches(
  unitsBody: unknown = MOCK_UNITS_RESPONSE,
  unitsOk = true,
  projectId: string = PROJECT_ID,
  patchBody: unknown = { patched: true }
) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const base = `/api/projects/${projectId}/units`;
    // List fetch includes ?limit=… and optional search/cursor — match base or ?query.
    const subScopeBase = `/api/projects/${projectId}/sub-scopes/instances`;
    if (url === "/api/unifier/subcontractors") {
      return Promise.resolve(jsonResponse({ subcontractors: [] }, true));
    }
    if (url.includes("/api/inspection-submissions?projectId=")) {
      return Promise.resolve(jsonResponse({ submissions: [] }, true));
    }
    if (url.includes(`/api/projects/${projectId}/custom-site-locations`)) {
      return Promise.resolve(jsonResponse({ locations: [] }, true));
    }
    if (url.includes(`/api/projects/${projectId}/album/coverage`)) {
      return Promise.resolve(jsonResponse({ unitRefs: [] }, true));
    }
    if (url === base || url.startsWith(`${base}?`)) {
      return Promise.resolve(jsonResponse(unitsBody, unitsOk));
    }
    if (url.startsWith(`${base}/`) || url.startsWith(subScopeBase)) {
      return Promise.resolve(jsonResponse(patchBody, true));
    }
    return Promise.resolve(jsonResponse({ error: "not found" }, false));
  });
}

type ViewportController = {
  setLandscape: () => void;
};

/** matchMedia mock with a controllable 767px breakpoint for rotate tests. */
function installViewportMatchMedia(initialMobile = true): ViewportController {
  let mobileMatches = initialMobile;
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();

  const emit = () => {
    const event = { matches: mobileMatches } as MediaQueryListEvent;
    listeners.forEach((cb) => cb(event));
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query.includes("max-width: 767px")
          ? mobileMatches
          : query.includes("min-width: 768px")
            ? !mobileMatches
            : false;
      },
      media: query,
      addEventListener: vi.fn((event: string, cb: (ev: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: (ev: MediaQueryListEvent) => void) => {
        if (event === "change") listeners.delete(cb);
      }),
    })),
  );

  return {
    setLandscape: () => {
      mobileMatches = false;
      emit();
    },
  };
}

describe("UnitCards", () => {
  it("does not return invisible orange-on-orange unit type styling", () => {
    const colors = Array.from({ length: 80 }, (_, i) => unitTypeColor(`type-${i}`));
    expect(colors).toContainEqual({ bg: "var(--warning-100)", text: "var(--warning-700)" });
    expect(colors).not.toContainEqual({ bg: "#ffedd5", text: "#ffedd5" });
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading state while fetching", () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    // Loading uses UnitCardsSkeleton (pulse placeholders), not the loading copy string.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error message when fetch fails", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "fail" }, false))
    );
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/failed to load locations/i)).toBeDefined();
    });
  });

  it("shows zero state when no units returned", async () => {
    stubDefaultProjectFetches({ units: [], hasMore: false, nextCursor: null, total: 0 });
    render(<UnitCards projectId={PROJECT_ID} viewMode="grid" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("locations-zero-state")).toBeDefined();
      expect(screen.getByText("No locations yet")).toBeDefined();
      expect(screen.queryByText(/no locations match your filters/i)).toBeNull();
    });
  });

  it("shows Location Builder CTA in zero state when user can view UPM", async () => {
    stubDefaultProjectFetches({ units: [], hasMore: false, nextCursor: null, total: 0 });
    render(<UnitCards projectId={PROJECT_ID} viewMode="grid" canViewUpm />, { wrapper: Wrapper });
    await waitFor(() => {
      const link = screen.getByRole("link", { name: "Open Location Builder to add locations" });
      expect(link.getAttribute("href")).toBe(`/projects/${PROJECT_ID}/upm`);
    });
  });

  it("shows filtered empty state when search excludes all units", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} search="zzzz-not-found" viewMode="grid" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("No locations match your filters")).toBeDefined();
      expect(screen.queryByTestId("locations-zero-state")).toBeNull();
    });
  });

  it("renders unit rows after successful fetch", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await waitFor(() => {
      // Table view renders unit numbers directly (not "Unit 101")
      expect(screen.getByText("101")).toBeDefined();
      expect(screen.getByText("201")).toBeDefined();
    });
  });

  it("shows API totalUnits in summary when greater than loaded distinct units", async () => {
    stubDefaultProjectFetches({
      ...MOCK_UNITS_RESPONSE,
      totalUnits: 100,
    });
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/2 of 100 locations/i)).toBeDefined();
    });
  });

  it("groups multiple rows for the same unit into one expandable row", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await waitFor(() => {
      // Unit 101 has 2 rows but should appear as one row button (one aria-expanded)
      const unit101Rows = screen.getAllByText("101");
      expect(unit101Rows).toHaveLength(1);
    });
  });

  it("shows unit type badges when unitType is present", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getAllByText("1BR").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2BR").length).toBeGreaterThan(0);
    });
  });

  it("expands a unit row to show scope details when clicked", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
    await expandUnit101Row();

    // After expansion, scope names become visible
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/Flooring|Millwork|Electrical/);
    });
  });

  it("fires PATCH request when Status picker is used (after expanding)", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} canManageStatus={true} />, { wrapper: Wrapper });
    await expandUnit101Row();

    // Wait for the scope rows to appear — row-2 is STAGING+IN_PROGRESS → combined label "In Staging"
    const inStagingTrigger = await waitFor(() => {
      const el = screen.getByText("In Staging");
      expect(el).toBeDefined();
      return el;
    });

    // Click the combined Status picker trigger button to open the dropdown
    const pickerBtn = inStagingTrigger.closest("button") as HTMLButtonElement;
    expect(pickerBtn).not.toBeNull();
    fireEvent.click(pickerBtn);

    // Dropdown opens — pick verified install complete.
    await waitFor(() => {
      const items = screen.getAllByText("Install Complete-Verified");
      expect(items.length).toBeGreaterThan(0);
    });
    const completeItems = screen.getAllByText("Install Complete-Verified");
    fireEvent.click(completeItems[completeItems.length - 1]);

    // StatusUpdatePhotoPrompt appears — skip photos to proceed with the status save
    await waitFor(() => expect(screen.getByText("Save Without Photos")).toBeDefined());
    fireEvent.click(screen.getByText("Save Without Photos"));

    // Verify PATCH was called with the expected body
    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(
        ([url, opts]) =>
          typeof url === "string" &&
          url.includes("/api/projects/") &&
          (opts as RequestInit)?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" });
    });
  });

  it("opens unit detail modal when a grid tile is tapped on mobile viewport", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      stubDefaultProjectFetches();
      render(
        <UnitCards projectId={PROJECT_ID} viewMode="grid" onGridCardSelect={() => {}} />,
        { wrapper: Wrapper }
      );
      // Level sections default to collapsed — expand Level 1 (where unit 101 lives)
      const expandBtn = await screen.findByRole("button", { name: /^Expand Level 1/i });
      fireEvent.click(expandBtn);
      await waitFor(() => expect(screen.getByText("101")).toBeDefined());
      const grid101 = screen.getByRole("button", { name: /location 101/i });
      fireEvent.click(grid101);
      await waitFor(() => {
        expect(screen.getByTestId("unit-detail-modal")).toBeDefined();
        expect(screen.getByRole("dialog")).toBeDefined();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders grid tiles with unit id (no Unit prefix) and scope abbreviation squares", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} viewMode="grid" />, { wrapper: Wrapper });
    // Level sections default to collapsed — expand all level sections
    await waitFor(async () => {
      const expandBtns = screen.getAllByRole("button", { name: /^Expand Level/i });
      expect(expandBtns.length).toBeGreaterThan(0);
      for (const btn of expandBtns) fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.getByText("101")).toBeDefined();
      expect(screen.getByText("201")).toBeDefined();
    });
    expect(screen.getAllByText("FLR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("MWK").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ELC")).toBeDefined();
  });

  it("shows a paperclip on grid unit cards that have album media", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const base = `/api/projects/${PROJECT_ID}/units`;
      if (url.includes("/api/inspection-submissions?projectId=")) {
        return Promise.resolve(jsonResponse({ submissions: [] }, true));
      }
      if (url.includes(`/api/projects/${PROJECT_ID}/custom-site-locations`)) {
        return Promise.resolve(jsonResponse({ locations: [] }, true));
      }
      if (url.includes(`/api/projects/${PROJECT_ID}/album/coverage`)) {
        return Promise.resolve(jsonResponse({ unitRefs: ["A|1|101"] }, true));
      }
      if (url === base || url.startsWith(`${base}?`)) {
        return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE, true));
      }
      return Promise.resolve(jsonResponse({ error: "not found" }, false));
    });

    render(<UnitCards projectId={PROJECT_ID} viewMode="grid" />, { wrapper: Wrapper });
    await waitFor(async () => {
      const expandBtns = screen.getAllByRole("button", { name: /^Expand Level/i });
      for (const btn of expandBtns) fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.getByText("101")).toBeDefined();
    });

    const withMedia = screen.getByRole("button", { name: /location 101.*has media attached/i });
    expect(within(withMedia).getByTestId("unit-grid-media-indicator")).toBeDefined();
    const withoutMedia = screen.getByRole("button", { name: /^location 201\./i });
    expect(within(withoutMedia).queryByTestId("unit-grid-media-indicator")).toBeNull();
  });

  it("fetches from the correct project-scoped API endpoint", async () => {
    stubDefaultProjectFetches({ units: [] }, true, "my-project-42");

    render(<UnitCards projectId="my-project-42" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/projects/my-project-42/units?limit=${FIELD_TRACKER_UNITS_PAGE_LIMIT}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it("loads all rows without limit when grid view is active", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ units: [] }),
    } as Response);

    render(<UnitCards projectId="my-project-42" viewMode="grid" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/projects/my-project-42/units`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it("loads all rows without limit when group by location is active", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ units: [] }),
    } as Response);

    render(<UnitCards projectId="my-project-42" groupByLocation />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/projects/my-project-42/units`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it("uses compact mobile list cards when viewport is narrow", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      stubDefaultProjectFetches();
      render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
      await waitFor(() => {
        expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getAllByText("Flooring").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("unit-row-mobile-progress").length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens a bottom-sheet modal with scope details when a mobile list card is tapped", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      stubDefaultProjectFetches();
      render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

      fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);

      await waitFor(() => {
        expect(screen.getByTestId("unit-detail-modal")).toBeDefined();
        expect(screen.getByRole("dialog")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");
      const dialogText = dialog.textContent ?? "";
      expect(dialogText).toMatch(/Flooring|Millwork/);
      // Inspection status elements are shown inline in scope cards (not with role="status")
      const inspectionLines = within(dialog).queryAllByRole("status").filter((el) =>
        /inspection status/i.test(el.textContent ?? "")
      );
      // If inspection status elements are rendered, verify their content
      if (inspectionLines.length > 0) {
        expect(inspectionLines.some((el) => /not started/i.test(el.textContent ?? ""))).toBe(true);
      }
      expect(within(dialog).queryByRole("button", { name: /start clear inspection/i })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("unit detail modal shows building when list hides it for a single-building project", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      const singleBuildingUnits = {
        units: MOCK_UNITS_RESPONSE.units.filter((u) => u.building === "A"),
      };
      stubDefaultProjectFetches(singleBuildingUnits);
      render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

      fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);

      await waitFor(() => {
        expect(screen.getByTestId("unit-detail-modal")).toBeDefined();
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("A")).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("level chevron opens the section without auto-expanding each unit row", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} groupByLocation />, { wrapper: Wrapper });
    await screen.findByRole("button", { name: /expand level 1/i });
    expect(screen.queryByRole("button", { name: /expand all locations in level 1/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /expand level 1/i }));
    await waitFor(() => expect(screen.getByText("101")).toBeDefined());
    expect(screen.getByRole("button", { name: /expand all locations in level 1/i })).toBeDefined();
    const unit101 = screen.getByText("101");
    const rowBtn = unit101.closest("button");
    expect(rowBtn).toBeTruthy();
    expect(rowBtn?.getAttribute("aria-expanded")).toBe("false");
  });

  it("hides level expand-all control on mobile viewport", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      stubDefaultProjectFetches();
      render(<UnitCards projectId={PROJECT_ID} groupByLocation />, { wrapper: Wrapper });
      fireEvent.click(await screen.findByRole("button", { name: /expand level 1/i }));
      await waitFor(() => expect(screen.getByText("101")).toBeDefined());
      expect(screen.queryByRole("button", { name: /expand all locations in level 1/i })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("expand-all control toggles every unit row in that level", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} groupByLocation />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /expand level 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand all locations in level 1/i }));
    await waitFor(() => {
      const unit101 = screen.getByText("101");
      expect(unit101.closest("button")?.getAttribute("aria-expanded")).toBe("true");
    });
    fireEvent.click(screen.getByRole("button", { name: /collapse all locations in level 1/i }));
    await waitFor(() => {
      const unit101 = screen.getByText("101");
      expect(unit101.closest("button")?.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("summary row shows visible vs total building count", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} viewMode="grid" />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/2 of 2 building/i)).toBeDefined();
    });
  });

  it("groups units by building and level when groupByLocation is true", async () => {
    stubDefaultProjectFetches();
    render(<UnitCards projectId={PROJECT_ID} groupByLocation />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expand level 1/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /expand level 2/i })).toBeDefined();
    });
    // Level sections start collapsed — expand to reveal unit numbers
    fireEvent.click(screen.getByRole("button", { name: /expand level 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand level 2/i }));
    await waitFor(() => {
      expect(screen.getByText("101")).toBeDefined();
      expect(screen.getByText("201")).toBeDefined();
    });
  });

  it("building row control expands and collapses all levels in that building only", async () => {
    const multiLevelBuilding = {
      units: [
        {
          id: "row-n1",
          building: "North",
          level: "1",
          unit: "101",
          area: "",
          unitType: "1BR",
          description: "Scope a",
          scopeType: { id: "s1", code: "FLR", name: "Flooring" },
          qty: null,
          uom: null,
          percentComplete: 0,
          installer: null,
          unifierSubId: null,
          shipPhase: "",
          buildPhase: "",
          scopeStage: null,
          scopeStatus: null,
          inspectionStatus: null,
          rowIndex: 0,
        },
        {
          id: "row-n2",
          building: "North",
          level: "2",
          unit: "102",
          area: "",
          unitType: "1BR",
          description: "Scope b",
          scopeType: { id: "s2", code: "MWK", name: "Millwork" },
          qty: null,
          uom: null,
          percentComplete: 0,
          installer: null,
          unifierSubId: null,
          shipPhase: "",
          buildPhase: "",
          scopeStage: null,
          scopeStatus: null,
          inspectionStatus: null,
          rowIndex: 1,
        },
        {
          id: "row-s1",
          building: "South",
          level: "1",
          unit: "201",
          area: "",
          unitType: "2BR",
          description: "Scope c",
          scopeType: { id: "s3", code: "ELC", name: "Electrical" },
          qty: null,
          uom: null,
          percentComplete: 0,
          installer: null,
          unifierSubId: null,
          shipPhase: "",
          buildPhase: "",
          scopeStage: null,
          scopeStatus: null,
          inspectionStatus: null,
          rowIndex: 2,
        },
      ],
    };
    stubDefaultProjectFetches(multiLevelBuilding);
    render(<UnitCards projectId={PROJECT_ID} groupByLocation />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expand all levels in north/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /expand all levels in south/i })).toBeDefined();
    });
    expect(screen.queryByText("101")).toBeNull();
    expect(screen.queryByText("201")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /expand all levels in north/i }));
    await waitFor(() => {
      expect(screen.getByText("101")).toBeDefined();
      expect(screen.getByText("102")).toBeDefined();
    });
    expect(screen.queryByText("201")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /expand all levels in south/i }));
    await waitFor(() => expect(screen.getByText("201")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /collapse all levels in north/i }));
    await waitFor(() => {
      expect(screen.queryByText("101")).toBeNull();
      expect(screen.queryByText("102")).toBeNull();
    });
    expect(screen.getByText("201")).toBeDefined();
  });

  it("fires PATCH from Status picker inside mobile unit detail modal", async () => {
    const mm = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", mm);
    try {
      stubDefaultProjectFetches();
      const mockFetch = vi.mocked(fetch);

      render(<UnitCards projectId={PROJECT_ID} canManageStatus={true} />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

      fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
      await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

      // row-2 is STAGING+IN_PROGRESS → combined label "In Staging"
      const inStagingTrigger = await waitFor(() => screen.getByText("In Staging"));
      const pickerBtn = inStagingTrigger.closest("button") as HTMLButtonElement;
      expect(pickerBtn).not.toBeNull();
      fireEvent.click(pickerBtn);

      await waitFor(() => {
        const items = screen.getAllByText("Install Complete-Verified");
        expect(items.length).toBeGreaterThan(0);
      });
      const completeItems = screen.getAllByText("Install Complete-Verified");
      fireEvent.click(completeItems[completeItems.length - 1]!);

      // StatusUpdatePhotoPrompt appears — skip photos to proceed with the status save
      await waitFor(() => expect(screen.getByText("Save Without Photos")).toBeDefined());
      fireEvent.click(screen.getByText("Save Without Photos"));

      await waitFor(() => {
        const patchCall = mockFetch.mock.calls.find(
          ([url, opts]) =>
            typeof url === "string" &&
            url.includes("/api/projects/") &&
            (opts as RequestInit)?.method === "PATCH"
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body).toMatchObject({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" });
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("mobile modal — 2-column scope grid", () => {
    function stubMobileMatchMedia() {
      return vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    }

    it("renders plain scopes in scope-grid-card-plain cards inside the modal", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        stubDefaultProjectFetches();
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        const plainCards = within(dialog).getAllByTestId("scope-grid-card-plain");
        expect(plainCards.length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("shows Unassigned for plain scope with no installer", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        // row-2 has installer: null
        stubDefaultProjectFetches();
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        const unassignedLabels = within(dialog).getAllByText("Unassigned");
        expect(unassignedLabels.length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("renders sub-scoped scope as scope-grid-card-subscoped spanning full width", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        stubDefaultProjectFetches(MOCK_UNITS_WITH_SUBSCOPES);
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        const subScopedCard = within(dialog).getByTestId("scope-grid-card-subscoped");
        expect(subScopedCard).toBeDefined();
        // Header shows scope name
        expect(subScopedCard.textContent).toContain("Cabinetry");
        // Header shows subscopes suffix
        expect(subScopedCard.textContent).toContain("subscopes");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("shows sub-scope column names (Kitchen, Bath) inside sub-scoped card", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        stubDefaultProjectFetches(MOCK_UNITS_WITH_SUBSCOPES);
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("Kitchen")).toBeDefined();
        expect(within(dialog).getByText("Bath")).toBeDefined();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("shows QTY Installed line with 0/qty when sub-scope is not yet complete", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        stubDefaultProjectFetches(MOCK_UNITS_WITH_SUBSCOPES);
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        // Both sub-scopes have qty=6, not complete → shows 0/6 each
        const qtyEls = within(dialog).getAllByTestId("sub-scope-qty");
        expect(qtyEls.length).toBe(2);
        qtyEls.forEach((el) => expect(el.textContent).toBe("0/6"));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does not show QTY line when sub-scope instance qty is null", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      const unitsWithNullQty = {
        units: [
          {
            ...MOCK_UNITS_WITH_SUBSCOPES.units[0],
            subScopeInstances: MOCK_UNITS_WITH_SUBSCOPES.units[0]!.subScopeInstances.map((inst) => ({
              ...inst,
              qty: null,
            })),
          },
        ],
      };
      try {
        stubDefaultProjectFetches(unitsWithNullQty);
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        expect(within(dialog).queryAllByTestId("sub-scope-qty").length).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("shows QTY Installed on plain scope card when scope has qty", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      // MOCK_UNITS_WITH_SUBSCOPES row-carpet has qty=12, no sub-scopes
      try {
        stubDefaultProjectFetches(MOCK_UNITS_WITH_SUBSCOPES);
        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() =>
          expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1)
        );
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        const dialog = screen.getByRole("dialog");
        // Carpet card is plain, has qty=12, not complete → 0/12
        const scopeQtyEl = within(dialog).getByTestId("scope-qty");
        expect(scopeQtyEl.textContent).toBe("0/12");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("offline sync event (UnitExpandedContent)", () => {
    function stubMobileMatchMedia() {
      return vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 767px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    }

    it("re-fetches counts when offline-sync-complete event is dispatched", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
          if (url.includes("/observations")) return Promise.resolve(jsonResponse({ observations: [] }));
          if (url.includes("/issues")) return Promise.resolve(jsonResponse({ issues: [] }));
          if (url.startsWith(`/api/projects/${PROJECT_ID}/units`)) return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
          return Promise.resolve(jsonResponse({ error: "not found" }, false));
        });

        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

        // Open modal so UnitExpandedContent mounts and attaches the event listener
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        // Wait for the initial refreshCounts fetch to settle
        await waitFor(() => {
          const obsCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/observations"));
          expect(obsCalls.length).toBeGreaterThanOrEqual(1);
        });
        const obsFetchsBefore = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/observations")).length;

        // Dispatch the event that signals offline mutations were flushed
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));

        // refreshCounts should re-run → another observations fetch
        await waitFor(() => {
          const obsFetchsAfter = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/observations")).length;
          expect(obsFetchsAfter).toBeGreaterThan(obsFetchsBefore);
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("re-fetches unit rows silently when offline-sync-complete fires so status changes made offline appear after sync", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      try {
        let unitFetchCount = 0;
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
          if (url.startsWith(`/api/projects/${PROJECT_ID}/units`)) {
            unitFetchCount++;
            return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
          }
          if (url.includes("/observations")) return Promise.resolve(jsonResponse({ observations: [] }));
          if (url.includes("/issues")) return Promise.resolve(jsonResponse({ issues: [] }));
          return Promise.resolve(jsonResponse({ error: "not found" }, false));
        });

        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

        const unitFetchesBefore = unitFetchCount;

        // Dispatching offline-sync-complete should trigger UnitCards to silently
        // re-fetch unit rows so scope status changes made offline appear immediately
        // after the mutation queue drains, without a full page navigation.
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));

        await waitFor(() => {
          expect(unitFetchCount).toBeGreaterThan(unitFetchesBefore);
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("calls ctrl.abort() in catch so the sibling in-flight request is cancelled when one fetch rejects", async () => {
      vi.stubGlobal("matchMedia", stubMobileMatchMedia());
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");
      try {
        vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
          if (url.startsWith(`/api/projects/${PROJECT_ID}/units`)) {
            return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
          }
          if (url.includes(`/api/projects/${PROJECT_ID}/album/coverage`)) {
            return Promise.resolve(jsonResponse({ unitRefs: [] }, true));
          }
          if (url.includes("/observations")) return Promise.reject(new Error("network error"));
          if (url.includes("/issues") || url.includes("/album?unitRef=")) {
            return new Promise(() => {});
          }
          return Promise.resolve(jsonResponse({}, true));
        });

        render(<UnitCards projectId={PROJECT_ID} />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getAllByTestId("unit-row-mobile-card").length).toBeGreaterThanOrEqual(1));

        const abortCallsBeforeModal = abortSpy.mock.calls.length;
        fireEvent.click(screen.getAllByTestId("unit-row-mobile-card")[0]!);
        await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

        await waitFor(() => {
          expect(abortSpy.mock.calls.length).toBeGreaterThan(abortCallsBeforeModal);
        });
      } finally {
        abortSpy.mockRestore();
        vi.unstubAllGlobals();
      }
    });
  });

  describe("incremental loading", () => {
    let ioCallback: IntersectionObserverCallback | undefined;

    beforeEach(() => {
      ioCallback = undefined;
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(cb: IntersectionObserverCallback) {
            ioCallback = cb;
          }
          observe = vi.fn();
          disconnect = vi.fn();
          unobserve = vi.fn();
          takeRecords = () => [] as IntersectionObserverEntry[];
        } as unknown as typeof IntersectionObserver
      );
    });

    function ScrollRig({ children }: { children: (root: HTMLDivElement) => ReactNode }) {
      const [root, setRoot] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setRoot} style={{ height: 400, overflow: "auto" }} data-testid="units-scroll-rig">
          {root ? children(root) : null}
        </div>
      );
    }

    it("loads second batch via IntersectionObserver and merges two scopes for one unit", async () => {
      const cursor = Buffer.from(JSON.stringify({ rowIndex: 0, id: "p1" }), "utf8").toString("base64url");

      const rowP1 = {
        id: "p1",
        building: "A",
        level: "1",
        unit: "101",
        area: "",
        unitType: "1BR",
        description: "First scope",
        scopeType: { id: "s1", code: "A", name: "Alpha" },
        qty: null,
        uom: null,
        percentComplete: 0,
        installer: null,
        unifierSubId: null,
        shipPhase: "",
        buildPhase: "",
        scopeStage: null,
        scopeStatus: "NOT_STARTED" as const,
        inspectionStatus: null,
        rowIndex: 0,
      };

      const rowP2 = {
        ...rowP1,
        id: "p2",
        description: "Second scope",
        scopeType: { id: "s2", code: "B", name: "Beta" },
        rowIndex: 1,
      };

      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (url === "/api/unifier/subcontractors") {
          return { ok: true, json: async () => ({ subcontractors: [] }) } as Response;
        }
        if (url.includes("cursor=")) {
          return {
            ok: true,
            json: async () => ({
              units: [rowP2],
              hasMore: false,
              nextCursor: null,
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            units: [rowP1],
            hasMore: true,
            nextCursor: cursor,
            total: 2,
          }),
        } as Response;
      });

      render(
        <Wrapper>
          <ScrollRig>
            {(root) => <UnitCards projectId={PROJECT_ID} scrollRootEl={root} />}
          </ScrollRig>
        </Wrapper>
      );

      await waitFor(() => expect(screen.getByText("101")).toBeDefined());

      await waitFor(() => expect(screen.getByTestId("units-load-more-sentinel")).toBeDefined());

      const sentinel = screen.getByTestId("units-load-more-sentinel");
      expect(ioCallback).toBeDefined();
      ioCallback!(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: sentinel.getBoundingClientRect(),
            intersectionRect: sentinel.getBoundingClientRect(),
            rootBounds: null,
            target: sentinel,
            time: Date.now(),
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );

      await waitFor(() => {
        const withCursor = vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes("cursor="));
        expect(withCursor.length).toBeGreaterThanOrEqual(1);
      });

      await waitFor(() => {
        expect(screen.getAllByText("101")).toHaveLength(1);
      });

      await expandUnit101Row();

      await waitFor(() => {
        const text = document.body.textContent ?? "";
        // UI shows scope type name (Alpha/Beta), not row description, when both exist
        expect(text).toMatch(/Alpha/);
        expect(text).toMatch(/Beta/);
      });
    });

    it("calls onFilterOptionsLoaded after each loaded batch", async () => {
      const onFilter = vi.fn();
      const cursor = Buffer.from(JSON.stringify({ rowIndex: 0, id: "row-1" }), "utf8").toString("base64url");
      const row = MOCK_UNITS_RESPONSE.units[0]!;

      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        if (url.includes("cursor=")) {
          return {
            ok: true,
            json: async () => ({
              units: [MOCK_UNITS_RESPONSE.units[1]!],
              hasMore: false,
              nextCursor: null,
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            units: [row],
            hasMore: true,
            nextCursor: cursor,
            total: 2,
          }),
        } as Response;
      });

      render(
        <Wrapper>
          <ScrollRig>
            {(root) => (
              <UnitCards projectId={PROJECT_ID} scrollRootEl={root} onFilterOptionsLoaded={onFilter} />
            )}
          </ScrollRig>
        </Wrapper>
      );

      await waitFor(() => expect(onFilter).toHaveBeenCalled());
      const callsAfterFirst = onFilter.mock.calls.length;

      await waitFor(() => expect(screen.getByTestId("units-load-more-sentinel")).toBeDefined());
      expect(ioCallback).toBeDefined();
      ioCallback!(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: new DOMRect(),
            intersectionRect: new DOMRect(),
            rootBounds: null,
            target: screen.getByTestId("units-load-more-sentinel"),
            time: Date.now(),
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );

      await waitFor(() => expect(onFilter.mock.calls.length).toBeGreaterThan(callsAfterFirst));
    });
  });

  // ── useScopePatch try-first + enqueue behavior ────────────────────────────
  describe("useScopePatch (try-first + offline queue)", () => {
    async function expandAndPatch() {
      render(<UnitCards projectId={PROJECT_ID} canManageStatus={true} />, { wrapper: Wrapper });
      await expandUnit101Row();
      const inStagingTrigger = await waitFor(() => screen.getByText("In Staging"));
      fireEvent.click(inStagingTrigger.closest("button")!);
      await waitFor(() => expect(screen.getAllByText("Install Complete-Verified").length).toBeGreaterThan(0));
      fireEvent.click(screen.getAllByText("Install Complete-Verified").at(-1)!);
      // StatusUpdatePhotoPrompt appears — skip photos to proceed with the status save
      await waitFor(() => expect(screen.getByText("Save Without Photos")).toBeDefined());
      fireEvent.click(screen.getByText("Save Without Photos"));
    }

    it("fires PATCH and then refreshes the units cache when the request succeeds", async () => {
      const fetchCalls: string[] = [];
      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        fetchCalls.push(url);
        const base = `/api/projects/${PROJECT_ID}/units`;
        if (url.includes(`/api/projects/${PROJECT_ID}/custom-site-locations`)) {
          return Promise.resolve(jsonResponse({ locations: [] }, true));
        }
        if (url === base || url.startsWith(`${base}?`)) return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
        if (url.startsWith(`${base}/`) && (init as RequestInit)?.method === "PATCH")
          return Promise.resolve(jsonResponse({ patched: true }));
        return Promise.resolve(jsonResponse({ error: "not found" }, false));
      });

      await expandAndPatch();

      await waitFor(() => {
        const patchCall = fetchCalls.find((u) => u.match(/\/units\/row-\d/));
        expect(patchCall).toBeDefined();
        // Cache-refresh GET for the units list should follow after a success
        const refreshCall = fetchCalls.find((u) => u.includes(`/units?limit=${FIELD_TRACKER_UNITS_PAGE_LIMIT}`));
        expect(refreshCall).toBeDefined();
      });
    });

    it("enqueues the mutation when the PATCH network request fails (offline path)", async () => {
      const enqueueMock = vi.fn().mockResolvedValue(undefined);
      vi.doMock("@/lib/offline/mutation-queue", () => ({ enqueueMutation: enqueueMock }));

      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        const base = `/api/projects/${PROJECT_ID}/units`;
        if (url.includes(`/api/projects/${PROJECT_ID}/custom-site-locations`)) {
          return Promise.resolve(jsonResponse({ locations: [] }, true));
        }
        if (url === base || url.startsWith(`${base}?`)) return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
        // Simulate network failure for the PATCH
        if (url.startsWith(`${base}/`) && (init as RequestInit)?.method === "PATCH")
          return Promise.reject(new TypeError("Failed to fetch"));
        return Promise.resolve(jsonResponse({ error: "not found" }, false));
      });

      await expandAndPatch();

      await waitFor(() => {
        expect(enqueueMock).toHaveBeenCalledWith(
          expect.objectContaining({ type: "unit-status", method: "PATCH" })
        );
      });
      vi.doUnmock("@/lib/offline/mutation-queue");
    });

    it("does NOT enqueue when the server responds with a 4xx error", async () => {
      const enqueueMock = vi.fn().mockResolvedValue(undefined);
      vi.doMock("@/lib/offline/mutation-queue", () => ({ enqueueMutation: enqueueMock }));

      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
        const base = `/api/projects/${PROJECT_ID}/units`;
        if (url.includes(`/api/projects/${PROJECT_ID}/custom-site-locations`)) {
          return Promise.resolve(jsonResponse({ locations: [] }, true));
        }
        if (url === base || url.startsWith(`${base}?`)) return Promise.resolve(jsonResponse(MOCK_UNITS_RESPONSE));
        // Server returns 403 Forbidden
        if (url.startsWith(`${base}/`) && (init as RequestInit)?.method === "PATCH")
          return Promise.resolve(jsonResponse({ error: "Forbidden" }, false));
        return Promise.resolve(jsonResponse({ error: "not found" }, false));
      });

      await expandAndPatch();

      // Allow microtasks to settle; enqueueMutation must not be called
      await new Promise((r) => setTimeout(r, 50));
      expect(enqueueMock).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/offline/mutation-queue");
    });
  });

  describe("inspection viewport pin (rotate)", () => {
    beforeEach(() => {
      resetInspectionOverlayChromeForTests();
    });

    afterEach(() => {
      notifyInspectionOverlayClosed();
    });

    it("keeps unit detail modal open on landscape rotate while inspection overlay is open", async () => {
      const viewport = installViewportMatchMedia(true);
      stubDefaultProjectFetches();
      render(
        <UnitCards projectId={PROJECT_ID} viewMode="grid" onGridCardSelect={() => {}} />,
        { wrapper: Wrapper },
      );
      const expandBtn = await screen.findByRole("button", { name: /^Expand Level 1/i });
      fireEvent.click(expandBtn);
      await waitFor(() => expect(screen.getByText("101")).toBeDefined());
      fireEvent.click(screen.getByRole("button", { name: /location 101/i }));
      await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

      act(() => {
        notifyInspectionOverlayOpened();
      });
      act(() => {
        viewport.setLandscape();
      });

      await waitFor(() => {
        expect(screen.getByTestId("unit-detail-modal")).toBeDefined();
        expect(screen.getByRole("dialog")).toBeDefined();
      });
    });

    it("keeps unit detail modal open on landscape rotate while unit modal is open", async () => {
      const viewport = installViewportMatchMedia(true);
      stubDefaultProjectFetches();
      render(
        <UnitCards projectId={PROJECT_ID} viewMode="grid" onGridCardSelect={() => {}} />,
        { wrapper: Wrapper },
      );
      const expandBtn = await screen.findByRole("button", { name: /^Expand Level 1/i });
      fireEvent.click(expandBtn);
      await waitFor(() => expect(screen.getByText("101")).toBeDefined());
      fireEvent.click(screen.getByRole("button", { name: /location 101/i }));
      await waitFor(() => expect(screen.getByTestId("unit-detail-modal")).toBeDefined());

      act(() => {
        viewport.setLandscape();
      });

      await waitFor(() => {
        expect(screen.getByTestId("unit-detail-modal")).toBeDefined();
      });
    });

    it("does not show unit detail modal on landscape when no unit was opened", async () => {
      const viewport = installViewportMatchMedia(true);
      stubDefaultProjectFetches();
      render(
        <UnitCards projectId={PROJECT_ID} viewMode="grid" onGridCardSelect={() => {}} />,
        { wrapper: Wrapper },
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^Expand Level 1/i })).toBeDefined(),
      );

      act(() => {
        viewport.setLandscape();
      });

      expect(screen.queryByTestId("unit-detail-modal")).toBeNull();
    });
  });
});
