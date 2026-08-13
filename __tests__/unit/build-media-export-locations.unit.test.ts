import { describe, it, expect } from "vitest";
import { buildMediaExportLocations } from "@/lib/media/build-media-export-locations";
import { EMPTY_MEDIA_FILTERS } from "@/lib/media/media-filters";
import type { UnitCard } from "@/components/projects/UnitCards";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

import type { MediaLocationGroup } from "@/lib/media/media-location-list";

function customLoc(partial: Partial<CustomSiteLocation> & Pick<CustomSiteLocation, "id" | "name" | "unitRef" | "placement">): CustomSiteLocation {
  return {
    projectId: "p1",
    building: partial.building ?? "",
    level: partial.level ?? "",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    createdBy: { id: "u1", name: "Tester" },
    observationCount: 0,
    issueCount: 0,
    ...partial,
  };
}

function unitCard(key: string, unit: string): UnitCard {
  const [building, level] = key.split("|");
  return {
    key,
    building: building ?? "",
    level: level ?? "",
    unit,
    area: "",
    buildPhase: "",
    unitType: "",
    scopes: [],
    issueMeta: { openCount: 0, blockingCount: 0, hasOpen: false },
    locationType: null,
  };
}

describe("buildMediaExportLocations()", () => {
  const alwaysVisible = () => true;
  const buildingDisplayLabel = (key: string) => `B:${key}`;
  const levelDisplayLabel = (key: string) => `L:${key}`;

  it("orders standalone custom, building custom, then units by hierarchy", () => {
    const standaloneCustomLocs: CustomSiteLocation[] = [
      customLoc({
        id: "c1",
        name: "Gate",
        unitRef: "@custom|c1|Gate",
        placement: "standalone",
      }),
    ];

    const locationGroups: MediaLocationGroup[] = [
      {
        buildingKey: "North",
        levels: [
          {
            levelKey: "1",
            units: [unitCard("North|1|101", "101")],
          },
        ],
      },
    ];

    const displayCustomLocations: CustomSiteLocation[] = [
      ...standaloneCustomLocs,
      customLoc({
        id: "c2",
        name: "Lobby",
        unitRef: "@custom|c2|Lobby",
        building: "North",
        level: "",
        placement: "building",
      }),
    ];

    const entries = buildMediaExportLocations({
      standaloneCustomLocs,
      locationGroups,
      displayCustomLocations,
      filters: EMPTY_MEDIA_FILTERS,
      applyMediaVisibility: alwaysVisible,
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    expect(entries.map((e) => e.label)).toEqual(["Gate", "Lobby", "101"]);
    expect(entries[0]?.kind).toBe("standalone_custom");
    expect(entries[1]?.kind).toBe("building_custom");
    expect(entries[2]?.kind).toBe("unit");
    expect(entries[2]?.buildingLabel).toBe("B:North");
    expect(entries[2]?.levelLabel).toBe("L:1");
  });

  it("includes area and build phase from unit cards", () => {
    const card = unitCard("A|1|U1", "U1");
    card.area = "East Wing";
    card.buildPhase = "3";

    const entries = buildMediaExportLocations({
      standaloneCustomLocs: [],
      locationGroups: [
        {
          buildingKey: "A",
          levels: [{ levelKey: "1", units: [card] }],
        },
      ],
      displayCustomLocations: [],
      filters: EMPTY_MEDIA_FILTERS,
      applyMediaVisibility: () => true,
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    expect(entries[0]?.area).toBe("East Wing");
    expect(entries[0]?.buildPhase).toBe("3");
  });

  it("includes only locations with media within the filtered set", () => {
    const locationGroups: MediaLocationGroup[] = [
      {
        buildingKey: "North",
        levels: [
          {
            levelKey: "1",
            units: [
              unitCard("North|1|101", "101"),
              unitCard("North|1|102", "102"),
              unitCard("North|1|103", "103"),
            ],
          },
        ],
      },
      {
        buildingKey: "South",
        levels: [
          {
            levelKey: "2",
            units: [unitCard("South|2|201", "201")],
          },
        ],
      },
    ];

    const mediaRefs = new Set(["North|1|101", "North|1|103"]);

    const entries = buildMediaExportLocations({
      standaloneCustomLocs: [],
      locationGroups,
      displayCustomLocations: [],
      filters: { ...EMPTY_MEDIA_FILTERS, buildings: ["North"] },
      applyMediaVisibility: (ref) => mediaRefs.has(ref),
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    expect(entries.map((e) => e.label)).toEqual(["101", "103"]);
  });

  it("omits filtered locations without media even when applyMediaVisibility would allow all", () => {
    const locationGroups: MediaLocationGroup[] = [
      {
        buildingKey: "A",
        levels: [{ levelKey: "1", units: [unitCard("A|1|U1", "U1"), unitCard("A|1|U2", "U2")] }],
      },
    ];

    const entries = buildMediaExportLocations({
      standaloneCustomLocs: [],
      locationGroups,
      displayCustomLocations: [],
      filters: EMPTY_MEDIA_FILTERS,
      applyMediaVisibility: (ref) => ref.endsWith("U1"),
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("U1");
  });

  it("omits standalone custom when building/level filters are active", () => {
    const standaloneCustomLocs: CustomSiteLocation[] = [
      customLoc({
        id: "c1",
        name: "Gate",
        unitRef: "@custom|c1|Gate",
        placement: "standalone",
      }),
    ];

    const entries = buildMediaExportLocations({
      standaloneCustomLocs,
      locationGroups: [],
      displayCustomLocations: standaloneCustomLocs,
      filters: { ...EMPTY_MEDIA_FILTERS, buildings: ["North"] },
      applyMediaVisibility: alwaysVisible,
      buildingDisplayLabel,
      levelDisplayLabel,
    });

    expect(entries).toHaveLength(0);
  });
});
