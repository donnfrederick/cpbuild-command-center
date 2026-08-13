import { describe, it, expect } from "vitest";
import { formatMediaExportLocationDetail } from "@/lib/media/format-media-export-location-detail";
import type { MediaExportLocationEntry } from "@/lib/media/media-export-types";

const labels = {
  area: (area: string) => `Area: ${area}`,
  buildPhase: (phase: string) => `Phase: ${phase}`,
};

describe("formatMediaExportLocationDetail()", () => {
  it("joins building, level, area, and build phase when defined", () => {
    const entry: MediaExportLocationEntry = {
      unitRef: "North|1|S207",
      label: "S207",
      kind: "unit",
      buildingLabel: "North Tower",
      levelLabel: "Level 1",
      area: "Pool Deck",
      buildPhase: "2",
    };

    expect(formatMediaExportLocationDetail(entry, labels)).toBe(
      "North Tower · Level 1 · Area: Pool Deck · Phase: 2",
    );
  });

  it("omits undefined area and build phase", () => {
    const entry: MediaExportLocationEntry = {
      unitRef: "North|1|101",
      label: "101",
      kind: "unit",
      buildingLabel: "North Tower",
      levelLabel: "Level 1",
    };

    expect(formatMediaExportLocationDetail(entry, labels)).toBe("North Tower · Level 1");
  });

  it("includes building only for building-level custom locations", () => {
    const entry: MediaExportLocationEntry = {
      unitRef: "@custom|c1|Lobby",
      label: "Lobby",
      kind: "building_custom",
      buildingLabel: "North Tower",
    };

    expect(formatMediaExportLocationDetail(entry, labels)).toBe("North Tower");
  });
});
