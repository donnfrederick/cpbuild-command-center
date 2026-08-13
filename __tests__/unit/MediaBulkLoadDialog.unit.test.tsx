import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MediaBulkLoadDialog } from "@/components/projects/MediaBulkLoadDialog";
import { EMPTY_MEDIA_FILTERS } from "@/lib/media/media-filters";

const messages = {
  units: {
    album: {
      sourceObservation: "Observation",
      sourceObservationComment: "Obs. comment",
      sourceIssue: "Issue",
      sourceIssueComment: "Issue comment",
      sourceInspection: "Inspection",
      sourceGeneral: "General",
      sourceStatusUpdate: "Status",
    },
    mediaView: {
      bulkLoadDialogTitleConfirm: "Load photos for multiple locations",
      bulkLoadDialogDescConfirm: "Each visible location with media downloads its photo album.",
      bulkLoadFilterHint: "Filter to a smaller set before loading.",
      searchPlaceholder: "Search locations…",
      searchAria: "Search locations",
      hideWithoutMediaLabel: "Hide locations without media",
      hideWithoutMediaLabelShort: "Media only",
      bulkLoadLocationCount: "{count} locations will load photos",
      bulkLoadCancel: "Cancel",
      bulkLoadStart: "Load photos ({count})",
      filterMediaType: "Media type",
      filterMediaTypeObservation: "Observations",
      filterMediaTypeIssue: "Issues",
      filterMediaTypeInspection: "Inspections",
      filterMediaTypeGeneral: "General uploads",
      filterMediaTypeStatusUpdate: "Status updates",
      filterSourceTags: "Source tags",
    },
    filterLocation: "Location",
    buildingNotSet: "Not set",
    levelNotSet: "Level not set",
    filterAllInBuilding: "All in {building}",
    filterBuildingAll: "All levels",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("MediaBulkLoadDialog", () => {
  it("shows confirm filters and calls onStartLoad", () => {
    const onStartLoad = vi.fn();

    render(
      <MediaBulkLoadDialog
        open
        onOpenChange={() => {}}
        phase="confirm"
        completed={0}
        total={5}
        search=""
        onSearchChange={() => {}}
        hideWithoutMedia={false}
        onHideWithoutMediaChange={() => {}}
        filters={EMPTY_MEDIA_FILTERS}
        onFiltersChange={() => {}}
        locationFilterOptions={{
          buildings: ["North"],
          buildingLevels: { North: ["1", "2"] },
        }}
        standaloneMediaCount={0}
        onStartLoad={onStartLoad}
        onCollapseAll={() => {}}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("5 locations will load photos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Media type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source tags" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Location" })).toBeInTheDocument();
    expect(screen.queryByText("Observations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Media type" }));
    expect(screen.getByText("Observations")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load photos (5)" }));
    expect(onStartLoad).toHaveBeenCalledTimes(1);
  });
});
