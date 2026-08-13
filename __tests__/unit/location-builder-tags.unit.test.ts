import { describe, it, expect } from "vitest";
import {
  collectLocationBuilderTagOptions,
  normalizeLocationBuilderTagInput,
  validateLocationBuilderTags,
  builderTagRequestFields,
  formatProjectLevelBuilderTagDetail,
} from "@/lib/field-notes/location-builder-tags";

describe("collectLocationBuilderTagOptions", () => {
  it("returns distinct sorted build phases and areas, excluding blank and 0", () => {
    const options = collectLocationBuilderTagOptions([
      { buildPhase: "Phase 2", area: "North" },
      { buildPhase: "Phase 1", area: "North" },
      { buildPhase: "0", area: "" },
      { buildPhase: " Phase 1 ", area: "South" },
    ]);
    expect(options.buildPhases).toEqual(["Phase 1", "Phase 2"]);
    expect(options.areas).toEqual(["North", "South"]);
  });
});

describe("normalizeLocationBuilderTagInput", () => {
  it("trims values and converts empty strings to null", () => {
    expect(
      normalizeLocationBuilderTagInput({ buildPhaseTag: "  Phase 1 ", areaTag: "   " }),
    ).toEqual({ buildPhaseTag: "Phase 1", areaTag: null });
  });
});

describe("validateLocationBuilderTags", () => {
  const options = collectLocationBuilderTagOptions([
    { buildPhase: "Phase 1", area: "Lobby" },
  ]);

  it("allows empty tags", () => {
    expect(validateLocationBuilderTags(null, {}, options)).toBeNull();
  });

  it("allows valid tags on project-level unitRef", () => {
    expect(
      validateLocationBuilderTags(null, { buildPhaseTag: "Phase 1", areaTag: "Lobby" }, options),
    ).toBeNull();
  });

  it("rejects tags on location-scoped unitRef", () => {
    expect(
      validateLocationBuilderTags("Tower|1|101", { buildPhaseTag: "Phase 1" }, options),
    ).toMatch(/project-level/i);
  });

  it("rejects unknown build phase", () => {
    expect(
      validateLocationBuilderTags(null, { buildPhaseTag: "Phase 99" }, options),
    ).toMatch(/build phase/i);
  });

  it("rejects unknown area when project areas are defined", () => {
    expect(
      validateLocationBuilderTags(null, { areaTag: "Roof" }, options),
    ).toMatch(/area/i);
  });

  it("allows a manual area reference when no project areas are defined", () => {
    expect(
      validateLocationBuilderTags(
        null,
        { areaTag: "GC staging" },
        { buildPhases: ["Phase 1"], areas: [] },
      ),
    ).toBeNull();
  });
});

describe("builderTagRequestFields", () => {
  it("omits empty tag fields from request body", () => {
    expect(builderTagRequestFields({ buildPhaseTag: "Phase 1", areaTag: "" })).toEqual({
      buildPhaseTag: "Phase 1",
    });
  });
});

describe("formatProjectLevelBuilderTagDetail", () => {
  it("appends phase and area labels to project level detail", () => {
    const detail = formatProjectLevelBuilderTagDetail(
      "Project level",
      { buildPhaseTag: "Phase 1", areaTag: "Lobby" },
      {
        buildPhase: (v) => `Phase: ${v}`,
        area: (v) => `Area: ${v}`,
      },
    );
    expect(detail).toBe("Project level · Phase: Phase 1 · Area: Lobby");
  });
});
