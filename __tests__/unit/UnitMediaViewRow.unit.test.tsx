import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { UnitMediaViewRow } from "@/components/projects/UnitMediaViewRow";
import { EMPTY_ISSUE_META, type UnitCard } from "@/components/projects/UnitCards";
import { unitAlbumClientCache, writeUnitAlbumClientCache } from "@/lib/media/unit-album-client-cache";

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));

const mockCard: UnitCard = {
  key: "B|1|101",
  building: "B",
  level: "1",
  unit: "101",
  area: "",
  buildPhase: "",
  unitType: "Studio",
  scopes: [{
    id: "r1",
    scopeType: { id: "st1", code: "CAB", name: "Cabinetry", canonicalScopeType: null },
    description: "Cabinetry",
    qty: null,
    uom: null,
    percentComplete: null,
    installer: null,
    unifierSubId: null,
    shipPhase: "",
    buildPhase: "",
    area: "",
    scopeStage: "INSTALL",
    scopeStatus: "NOT_STARTED",
    inspectionStatus: null,
    subScopeInstances: [],
    clearInspection: null,
  }],
  issueMeta: EMPTY_ISSUE_META,
  locationType: null,
};

const messages = {
  units: {
    album: {
      photo: "Photo",
      empty: "No photos yet for this location.",
      sourceGeneral: "General",
    },
    mediaView: {
      loading: "Loading photos…",
      loadingPhotosForUnit: "Loading photos for {unit}",
      loadError: "Could not load photos for this unit.",
      stripAria: "Unit photo album",
      openUnitDetailAria: "Open location details for {unit}",
      openUnitDetailLabel: "Open",
      expandPhotosAria: "Show photos for {unit}",
      collapsePhotosAria: "Hide photos for {unit}",
      customLocationBadge: "Custom",
      stripAria: "Unit photo album",
    },
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("UnitMediaViewRow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    unitAlbumClientCache.clear();
  });

  it("shows unit type and scope labels on the row", () => {
    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|101"
        unitLabel="101"
        unitType="Studio"
        card={mockCard}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Studio")).toBeDefined();
    expect(screen.getByText("CAB")).toBeDefined();
  });

  it("lazy-fetches album when expanded", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        items: [{
          id: "a1",
          storageUrl: "https://example.com/photo.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: null,
          caption: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          source: { type: "general", label: null, entityId: null },
        }],
      }), { status: 200 }),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|101"
        unitLabel="101"
        card={mockCard}
      />,
      { wrapper: Wrapper },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Show photos for 101/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/album?unitRef=B%7C1%7C101",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("loads album when expanded via controlled prop", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|102"
        unitLabel="102"
        card={{ ...mockCard, key: "B|1|102", unit: "102" }}
        expanded
        onExpandedChange={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/album?unitRef=B%7C1%7C102",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("refetches when a stale empty cache entry exists", async () => {
    writeUnitAlbumClientCache("proj-1", "B|1|103", []);
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        items: [{
          id: "a1",
          storageUrl: "https://example.com/photo.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: null,
          caption: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          source: { type: "general", label: null, entityId: null },
        }],
      }), { status: 200 }),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|103"
        unitLabel="103"
        card={{ ...mockCard, key: "B|1|103", unit: "103" }}
        expanded
        onExpandedChange={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/album?unitRef=B%7C1%7C103",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });

  it("shows a custom location badge when isCustomLocation is set", () => {
    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="@custom|csl-1|Test location"
        unitLabel="Test location"
        card={{ ...mockCard, key: "@custom|csl-1|Test location", unit: "Test location", unitType: "" }}
        isCustomLocation
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Custom")).toBeDefined();
  });

  it("calls onOpenDetail when the open location button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|101"
        unitLabel="101"
        card={mockCard}
        onOpenDetail={onOpenDetail}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Open")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Open location details for 101/i }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it("shows skeleton placeholders while album loads", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => {}),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|104"
        unitLabel="104"
        card={{ ...mockCard, key: "B|1|104", unit: "104" }}
        expanded
        onExpandedChange={() => {}}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading photos for 104");
    expect(screen.queryByText("No photos yet for this location.")).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does not flash empty state before fetch completes", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    items: [{
                      id: "a1",
                      storageUrl: "https://example.com/photo.jpg",
                      mimeType: "image/jpeg",
                      fileSizeBytes: null,
                      caption: null,
                      createdAt: "2026-01-01T00:00:00.000Z",
                      source: { type: "general", label: null, entityId: null },
                    }],
                  }),
                  { status: 200 },
                ),
              ),
            50,
          );
        }),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|106"
        unitLabel="106"
        card={{ ...mockCard, key: "B|1|106", unit: "106" }}
        expanded
        onExpandedChange={() => {}}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText("No photos yet for this location.")).toBeNull();
    expect(screen.getByText("Loading photos for 106")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByRole("list", { name: "Unit photo album" })).toBeDefined();
    });
  });

  it("calls onAlbumFetchSettled when album fetch completes", async () => {
    const onAlbumFetchSettled = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    render(
      <UnitMediaViewRow
        projectId="proj-1"
        unitRef="B|1|105"
        unitLabel="105"
        card={{ ...mockCard, key: "B|1|105", unit: "105" }}
        expanded
        onExpandedChange={() => {}}
        onAlbumFetchSettled={onAlbumFetchSettled}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(onAlbumFetchSettled).toHaveBeenCalledWith("B|1|105");
    });
  });
});
