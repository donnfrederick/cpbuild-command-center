import { describe, it, expect } from "vitest";
import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";
import {
  activeMediaFilterCount,
  albumSourceMatchesMediaFilters,
  albumSourceToFilterKey,
  EMPTY_MEDIA_FILTERS,
  filterAlbumItemsByMediaFilters,
  filterLocationGroupsForMediaFilters,
  standaloneCustomVisibleForMediaFilters,
  unitRefMatchesMediaFilters,
} from "@/lib/media/media-filters";
import type { MediaBuildingGroup } from "@/lib/media/media-expand-all";

function albumItem(type: AlbumSourceType): AlbumItem {
  return {
    id: type,
    storageUrl: "https://example.com/x.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1,
    caption: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: { type, label: null, entityId: null },
  };
}

const SAMPLE_GROUPS: MediaBuildingGroup[] = [
  {
    buildingKey: "North",
    levels: [
      { levelKey: "1", units: [{ key: "North|1|101" } as never] },
      { levelKey: "2", units: [{ key: "North|2|201" } as never] },
    ],
  },
  {
    buildingKey: "South",
    levels: [{ levelKey: "1", units: [{ key: "South|1|101" } as never] }],
  },
];

describe("media-filters", () => {
  it("maps observation comments to the observation filter group", () => {
    expect(albumSourceToFilterKey("observation_comment")).toBe("observation");
    expect(albumSourceToFilterKey("issue_comment")).toBe("issue");
  });

  it("counts active media filters including source tags", () => {
    expect(activeMediaFilterCount(EMPTY_MEDIA_FILTERS)).toBe(0);
    expect(
      activeMediaFilterCount({
        ...EMPTY_MEDIA_FILTERS,
        buildings: ["North"],
        mediaSourceTypes: ["issue"],
        albumSourceTags: ["observation"],
      }),
    ).toBe(3);
  });

  it("filters unit refs by media source type groups and source tags", () => {
    const sourceTypesByUnitRef = {
      "1|1|101": ["observation" as AlbumSourceType],
      "1|1|102": ["issue" as AlbumSourceType],
    };
    expect(
      unitRefMatchesMediaFilters("1|1|101", sourceTypesByUnitRef, {
        mediaSourceTypes: ["observation"],
        albumSourceTags: [],
      }),
    ).toBe(true);
    expect(
      unitRefMatchesMediaFilters("1|1|101", sourceTypesByUnitRef, {
        mediaSourceTypes: [],
        albumSourceTags: ["observation_comment"],
      }),
    ).toBe(false);
    expect(
      unitRefMatchesMediaFilters("1|1|102", sourceTypesByUnitRef, {
        mediaSourceTypes: ["observation"],
        albumSourceTags: [],
      }),
    ).toBe(false);
  });

  it("requires both media group and source tag when both are selected", () => {
    expect(
      albumSourceMatchesMediaFilters("observation", {
        mediaSourceTypes: ["observation"],
        albumSourceTags: ["observation"],
      }),
    ).toBe(true);
    expect(
      albumSourceMatchesMediaFilters("observation_comment", {
        mediaSourceTypes: ["observation"],
        albumSourceTags: ["observation"],
      }),
    ).toBe(false);
  });

  it("filters album items by selected media filters", () => {
    const items = [albumItem("observation"), albumItem("issue"), albumItem("general")];
    const filtered = filterAlbumItemsByMediaFilters(items, {
      mediaSourceTypes: ["issue", "general"],
      albumSourceTags: [],
    });
    expect(filtered.map((item) => item.source.type)).toEqual(["issue", "general"]);
  });

  it("filters location groups by building and level selections", () => {
    expect(filterLocationGroupsForMediaFilters(SAMPLE_GROUPS, EMPTY_MEDIA_FILTERS)).toEqual(
      SAMPLE_GROUPS,
    );

    const wholeBuilding = filterLocationGroupsForMediaFilters(SAMPLE_GROUPS, {
      ...EMPTY_MEDIA_FILTERS,
      buildings: ["North"],
    });
    expect(wholeBuilding).toHaveLength(1);
    expect(wholeBuilding[0]?.levels).toHaveLength(2);

    const oneLevel = filterLocationGroupsForMediaFilters(SAMPLE_GROUPS, {
      ...EMPTY_MEDIA_FILTERS,
      levels: ["North::2"],
    });
    expect(oneLevel).toHaveLength(1);
    expect(oneLevel[0]?.levels.map((level) => level.levelKey)).toEqual(["2"]);
  });

  it("hides standalone custom locations when building or level filters are active", () => {
    expect(standaloneCustomVisibleForMediaFilters(EMPTY_MEDIA_FILTERS)).toBe(true);
    expect(
      standaloneCustomVisibleForMediaFilters({
        ...EMPTY_MEDIA_FILTERS,
        buildings: ["North"],
      }),
    ).toBe(false);
    expect(
      standaloneCustomVisibleForMediaFilters({
        ...EMPTY_MEDIA_FILTERS,
        levels: ["North::1"],
      }),
    ).toBe(false);
  });
});
