/**
 * UnitsPageClient — pins effective view mode while inspection overlay is open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { UnitsPageClient } from "@/components/projects/UnitsPageClient";
import {
  notifyInspectionOverlayClosed,
  notifyInspectionOverlayOpened,
  resetInspectionOverlayChromeForTests,
} from "@/lib/inspections/inspection-overlay-chrome";

let lastUnitCardsViewMode: string | undefined;

vi.mock("@/components/projects/UnitCards", () => ({
  UnitCards: (props: { viewMode: string }) => {
    lastUnitCardsViewMode = props.viewMode;
    return <div data-testid="unit-cards" data-view-mode={props.viewMode} />;
  },
  unitTypeColor: () => ({ bg: "var(--neutral-100)", text: "var(--neutral-700)" }),
}));

vi.mock("@/components/projects/BulkActionsBar", () => ({
  BulkActionsBar: () => null,
}));

vi.mock("@/components/ai/AIInsightsPanel", () => ({
  AIInsightsPanel: () => null,
}));

vi.mock("@/components/ai/AIAnomalyBadge", () => ({
  AIAnomalyBadge: () => null,
}));

vi.mock("@/lib/units-i18n", () => ({
  useUnitsTranslator: () => (key: string) => {
    const labels: Record<string, string> = {
      listView: "List view",
      gridView: "Grid view",
    };
    return labels[key] ?? key;
  },
}));

const MESSAGES = {
  units: {
    searchUnits: "Search locations",
    closeSearch: "Close search",
    searchPlaceholder: "Search locations…",
    listView: "List view",
    gridView: "Grid view",
    groupByLocation: "Group by location",
    groupByLocationTooltip: "Group tooltip",
    groupByLocationLockedInGrid: "Locked in grid",
    expandAll: "Expand all",
    filtersTooltip: "Filters",
    filterUnits: "Filter locations",
    filterTitle: "Filter Locations",
    filterSubtitle: "Subtitle",
    filterClose: "Close filters",
    filterIssues: "Issues",
    filterIssueType: "Issue Type",
    filterResponsibleParty: "Responsible Party",
    filterIssueStatus: "Status",
    filterIssueStatusOpen: "Open",
    filterIssueStatusResolved: "Resolved",
    filterIssueBlockingLabel: "Blocking",
    filterIssueBlocking: "Blocking Work",
    filterIssueNonBlocking: "Non-Blocking",
    hasOpenIssues: "Has open issues",
    filterStage: "Stage",
    filterStageInStaging: "In Staging",
    filterStageInAssembly: "In Assembly",
    filterClearInspection: "Clear Inspection",
    filterInspectionPassed: "Passed",
    filterInspectionFailed: "Failed",
    filterCalibrationInspection: "Calibration",
    filterScope: "Scope",
    filterLocation: "Location",
    filterLocationHint: "Hint",
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

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <UnitsPageClient projectId="proj-viewport-pin" />
    </NextIntlClientProvider>,
  );
}

type ViewportController = {
  setMobilePortrait: () => void;
  setLandscape: () => void;
};

function installViewportMatchMedia(initialMobile = false): ViewportController {
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
        return query.includes("max-width: 767px") ? mobileMatches : false;
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
    setMobilePortrait: () => {
      mobileMatches = true;
      emit();
    },
    setLandscape: () => {
      mobileMatches = false;
      emit();
    },
  };
}

describe("UnitsPageClient inspection viewport pin", () => {
  beforeEach(() => {
    resetInspectionOverlayChromeForTests();
    lastUnitCardsViewMode = undefined;
  });

  afterEach(() => {
    notifyInspectionOverlayClosed();
    vi.unstubAllGlobals();
  });

  it("keeps grid viewMode for UnitCards after landscape rotate while inspection overlay is open", async () => {
    const viewport = installViewportMatchMedia(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "List view", hidden: true }));
    await waitFor(() => expect(lastUnitCardsViewMode).toBe("list"));

    act(() => {
      viewport.setMobilePortrait();
    });
    await waitFor(() => expect(lastUnitCardsViewMode).toBe("grid"));

    act(() => {
      notifyInspectionOverlayOpened();
    });

    act(() => {
      viewport.setLandscape();
    });

    await waitFor(() => {
      expect(lastUnitCardsViewMode).toBe("grid");
      expect(screen.getByTestId("unit-cards")).toHaveAttribute("data-view-mode", "grid");
    });
  });

  it("restores stored list viewMode after landscape rotate when inspection overlay is closed", async () => {
    const viewport = installViewportMatchMedia(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "List view", hidden: true }));
    await waitFor(() => expect(lastUnitCardsViewMode).toBe("list"));

    act(() => {
      viewport.setMobilePortrait();
    });
    await waitFor(() => expect(lastUnitCardsViewMode).toBe("grid"));

    act(() => {
      viewport.setLandscape();
    });

    await waitFor(() => {
      expect(lastUnitCardsViewMode).toBe("list");
    });
  });
});
