import { describe, it, expect } from "vitest";
import {
  isProjectLevelUnitRef,
  unitContextFromUnitRef,
  PROJECT_LEVEL_UNIT_REF_OR,
  formatFieldNotesLocationDisplay,
  type FieldNotesLocationLabels,
} from "@/lib/field-notes-scope";

const TEST_LABELS: FieldNotesLocationLabels = {
  levelHeading: (level) => `Level ${level}`,
  buildingAndLevel: (building, level) => `${building}, Level ${level}`,
  unknown: "—",
  projectUnitKey: "Project",
};

describe("field-notes-scope", () => {
  it("isProjectLevelUnitRef treats null, empty, and || as project level", () => {
    expect(isProjectLevelUnitRef(null)).toBe(true);
    expect(isProjectLevelUnitRef(undefined)).toBe(true);
    expect(isProjectLevelUnitRef("")).toBe(true);
    expect(isProjectLevelUnitRef("||")).toBe(true);
  });

  it("isProjectLevelUnitRef treats building-scoped refs as not project level", () => {
    expect(isProjectLevelUnitRef("B1||")).toBe(false);
    expect(isProjectLevelUnitRef("B1|2|")).toBe(false);
    expect(isProjectLevelUnitRef("B1|2|U101")).toBe(false);
  });

  it("isProjectLevelUnitRef matches PROJECT_LEVEL_UNIT_REF_OR only (not empty-building refs)", () => {
    // Empty building segment is location-scoped — API projectLevel=true does not return these.
    expect(isProjectLevelUnitRef("|2|U101")).toBe(false);
    expect(isProjectLevelUnitRef("|2|")).toBe(false);
  });

  it("unitContextFromUnitRef returns project context for project-level refs", () => {
    expect(unitContextFromUnitRef(null, TEST_LABELS)).toEqual({
      unitKey: "Project",
      building: "",
      level: "",
      unit: "",
      unitRef: "",
    });
  });

  it("unitContextFromUnitRef parses building-level refs", () => {
    expect(unitContextFromUnitRef("Tower A|3|", TEST_LABELS)).toMatchObject({
      building: "Tower A",
      level: "3",
      unit: "",
    });
  });

  it("unitContextFromUnitRef parses custom site refs", () => {
    expect(
      unitContextFromUnitRef("@custom|loc-1|Parking lot", TEST_LABELS),
    ).toEqual({
      unitKey: "Parking lot",
      building: "",
      level: "",
      unit: "Parking lot",
      unitRef: "@custom|loc-1|Parking lot",
    });
  });

  it("formatFieldNotesLocationDisplay shows custom site name", () => {
    expect(
      formatFieldNotesLocationDisplay(
        "@custom|loc-1|Loading dock",
        "Bing South",
        "Project level",
        TEST_LABELS,
      ),
    ).toEqual({
      headline: "Loading dock",
      detail: null,
    });
  });

  it("PROJECT_LEVEL_UNIT_REF_OR covers the three sentinel values", () => {
    expect(PROJECT_LEVEL_UNIT_REF_OR).toHaveLength(3);
  });
});

describe("formatFieldNotesLocationDisplay", () => {
  it("shows project name and project level label for project-level refs", () => {
    expect(
      formatFieldNotesLocationDisplay(null, "Bing South", "Project level", TEST_LABELS),
    ).toEqual({
      headline: "Bing South",
      detail: "Project level",
    });
  });

  it("shows unit and building/level for scoped refs", () => {
    expect(
      formatFieldNotesLocationDisplay("North|2|N101", "Bing South", "Project level", TEST_LABELS),
    ).toEqual({
      headline: "N101",
      detail: "North, Level 2",
    });
  });

  it("shows building name without pipe artifacts for building-scoped refs", () => {
    expect(
      formatFieldNotesLocationDisplay("Tower A||", "Bing South", "Project level", TEST_LABELS),
    ).toEqual({
      headline: "Tower A",
      detail: null,
    });
  });

  it("shows level headline and building detail for level-scoped refs without unit", () => {
    expect(
      formatFieldNotesLocationDisplay("Tower A|3|", "Bing South", "Project level", TEST_LABELS),
    ).toEqual({
      headline: "Level 3",
      detail: "Tower A",
    });
  });

  it("appends builder tags to project-level detail when labels are provided", () => {
    expect(
      formatFieldNotesLocationDisplay(
        null,
        "Bing South",
        "Project level",
        TEST_LABELS,
        { buildPhaseTag: "Phase 1", areaTag: "Lobby" },
        {
          buildPhase: (v) => `Phase: ${v}`,
          area: (v) => `Area: ${v}`,
        },
      ),
    ).toEqual({
      headline: "Bing South",
      detail: "Project level · Phase: Phase 1 · Area: Lobby",
    });
  });
});
