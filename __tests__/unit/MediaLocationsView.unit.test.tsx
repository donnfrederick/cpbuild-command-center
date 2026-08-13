import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MediaLocationsView } from "@/components/projects/MediaLocationsView";
import { fetchUnitsWithGridInspection } from "@/lib/inspections/fetch-units-with-grid-inspection";
import { fetchCustomSiteLocations } from "@/lib/custom-site-locations-api";
import { EMPTY_MEDIA_FILTERS } from "@/lib/media/media-filters";

vi.mock("@/components/projects/MediaFilterPanel", () => ({
  MediaFilterPanel: () => null,
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/lib/inspections/fetch-units-with-grid-inspection", () => ({
  fetchUnitsWithGridInspection: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/lib/custom-site-locations-api", () => ({
  fetchCustomSiteLocations: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/components/projects/UnitMediaViewRow", () => ({
  UnitMediaViewRow: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, values?: { count?: number; name?: string; level?: string; unit?: string; withMedia?: number; total?: number }) => {
    if (ns === "units" && key === "loading") return "Loading locations…";
    if (key === "locationCount" && values?.count != null) return `${values.count} locations`;
    if (key === "toolbarSummary" && values?.withMedia != null && values?.total != null) {
      return `${values.withMedia} with media · ${values.total} locations`;
    }
    if (key === "buildingTitle" && values?.name) return `Building · ${values.name}`;
    if (key === "expandAllMediaGlobalAria") return "Expand all locations with media";
    if (key === "expandAllMediaGlobalLabel") return "Expand all w/media";
    if (key === "expandAllMediaAria") return "Expand all levels with photos in this building";
    if (key === "collapseAllMediaAria") return "Collapse all levels in this building";
    if (key === "collapseAllMediaGlobalAria") return "Collapse all locations";
    if (key === "collapseAllMediaGlobalLabel") return "Collapse all";
    if (key === "hideWithoutMediaAria") return "Hide locations without media";
    if (key === "hideWithoutMediaLabel") return "Hide locations without media";
    if (key === "hideWithoutMediaLabelShort") return "Media only";
    if (key === "showAllLocationsLabel") return "Show all locations";
    if (key === "showAllLocationsAria") return "Show all locations";
    if (key === "sectionTitle") return "Custom Locations · Project-wide";
    if (key === "sectionToggleExpand") return "Expand Custom Locations · Project-wide";
    if (key === "noLocationsWithMedia") return "No locations have photos or videos yet.";
    return key;
  },
}));

const SAMPLE_UNIT = {
  id: "row-1",
  building: "North",
  level: "2",
  unit: "201",
  area: "",
  unitType: "1BR",
  description: "",
  scopeType: { code: "CAB", name: "Cabinetry" },
};

function renderMediaView(
  props: Partial<ComponentProps<typeof MediaLocationsView>> & {
    projectId?: string;
    search?: string;
  } = {},
) {
  return render(
    <MediaLocationsView
      projectId="proj-1"
      search=""
      onSearchChange={vi.fn()}
      filters={EMPTY_MEDIA_FILTERS}
      onFiltersChange={vi.fn()}
      showFilters={false}
      onShowFiltersChange={vi.fn()}
      {...props}
    />,
  );
}

describe("MediaLocationsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows skeleton placeholders while locations load", () => {
    const { container } = renderMediaView();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading locations…")).toBeInTheDocument();
  });

  it("loads unit rows without prefetching all inspection submissions", async () => {
    vi.mocked(fetchUnitsWithGridInspection).mockResolvedValue({
      page: { units: [SAMPLE_UNIT as never] },
      submissions: [],
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([]);

    renderMediaView();

    await waitFor(() => {
      expect(fetchUnitsWithGridInspection).toHaveBeenCalledWith(
        "proj-1",
        "/api/projects/proj-1/units",
        false,
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("defers album coverage until after the location list finishes loading", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/album/coverage")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ unitRefs: ["North|2|201"] }),
        });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(fetchUnitsWithGridInspection).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { page: { units: [SAMPLE_UNIT as never] }, submissions: [] };
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([]);

    renderMediaView();

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/album/coverage"),
      expect.anything(),
    );

    await waitFor(() => {
      expect(screen.getByText("Building · North")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/album/coverage",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("shows global toolbar above custom locations and expand-all opens only media locations", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/album/coverage")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ unitRefs: ["North|2|201"] }),
        });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(fetchUnitsWithGridInspection).mockResolvedValue({
      page: { units: [SAMPLE_UNIT as never] },
      submissions: [],
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([
      {
        id: "custom-1",
        projectId: "proj-1",
        name: "North Utility Room",
        unitRef: "@custom|north-utility",
        building: null,
        level: null,
        placement: "standalone",
      },
    ] as never);

    renderMediaView();

    await waitFor(() => {
      expect(screen.getByText("1 with media · 2 locations")).toBeInTheDocument();
    });

    const expandAllBtn = screen.getByRole("button", { name: "Expand all locations with media" });
    const customSection = screen.getByRole("button", { name: "Expand Custom Locations · Project-wide" });
    expect(
      expandAllBtn.compareDocumentPosition(customSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand all locations with media" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Collapse all locations" })).toBeInTheDocument();
    });
  });

  it("building expand-all expands in place without opening the bulk load dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/album/coverage")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              unitRefs: ["North|2|201", "North|2|202", "North|2|203"],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    vi.mocked(fetchUnitsWithGridInspection).mockResolvedValue({
      page: {
        units: [
          SAMPLE_UNIT as never,
          { ...SAMPLE_UNIT, id: "row-2", unit: "202" } as never,
          { ...SAMPLE_UNIT, id: "row-3", unit: "203" } as never,
        ],
      },
      submissions: [],
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([]);

    renderMediaView();

    await waitFor(() => {
      expect(screen.getByText("3 with media · 3 locations")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Expand all levels with photos in this building" }),
    );

    expect(screen.queryByText("Load photos for multiple locations")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Collapse all levels in this building" }),
      ).toBeInTheDocument();
    });
  });

  it("hides locations without media when the filter toggle is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/album/coverage")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ unitRefs: ["North|2|201"] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    vi.mocked(fetchUnitsWithGridInspection).mockResolvedValue({
      page: { units: [SAMPLE_UNIT as never] },
      submissions: [],
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([
      {
        id: "custom-1",
        projectId: "proj-1",
        name: "North Utility Room",
        unitRef: "@custom|north-utility",
        building: null,
        level: null,
        placement: "standalone",
      },
    ] as never);

    renderMediaView();

    await waitFor(() => {
      expect(screen.getByText("1 with media · 2 locations")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Hide locations without media" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Expand Custom Locations · Project-wide" })).toBeNull();
      expect(screen.getByText("Building · North")).toBeInTheDocument();
    });
  });

  it("hides locations that do not match the selected media source type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/album/coverage")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              unitRefs: ["North|2|201"],
              sourceTypesByUnitRef: { "North|2|201": ["observation"] },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    vi.mocked(fetchUnitsWithGridInspection).mockResolvedValue({
      page: { units: [SAMPLE_UNIT as never] },
      submissions: [],
    });
    vi.mocked(fetchCustomSiteLocations).mockResolvedValue([]);

    renderMediaView({
      filters: { ...EMPTY_MEDIA_FILTERS, mediaSourceTypes: ["issue"] },
    });

    await waitFor(() => {
      expect(screen.getByText("No locations have photos or videos yet.")).toBeInTheDocument();
    });
  });
});
