import { describe, expect, it } from "vitest";
import {
  buildFieldNotesLocationMatrix,
  buildFieldNotesUnitRef,
  normalizeFieldNotesUnitRef,
  parseFieldNotesLocation,
} from "@/lib/field-notes-location-ref";

describe("parseFieldNotesLocation()", () => {
  it("returns project level for null, empty, and ||", () => {
    for (const ref of [null, "", "||"]) {
      expect(parseFieldNotesLocation(ref)).toMatchObject({
        level: "project",
        building: "",
        floorLevel: "",
        unit: "",
        isCustomSite: false,
      });
    }
  });

  it("parses building, level, and unit refs", () => {
    expect(parseFieldNotesLocation("North||")).toMatchObject({
      level: "building",
      building: "North",
    });
    expect(parseFieldNotesLocation("North|L0|")).toMatchObject({
      level: "level",
      building: "North",
      floorLevel: "L0",
    });
    expect(parseFieldNotesLocation("North|L0|N010")).toMatchObject({
      level: "unit",
      building: "North",
      floorLevel: "L0",
      unit: "N010",
    });
  });

  it("flags custom site refs as read-only", () => {
    expect(parseFieldNotesLocation("@custom|abc|Dock")).toMatchObject({
      isCustomSite: true,
    });
  });
});

describe("buildFieldNotesUnitRef()", () => {
  it("round-trips parsed locations", () => {
    const cases = [
      { level: "project" as const, building: "", floorLevel: "", unit: "" },
      { level: "building" as const, building: "A", floorLevel: "", unit: "" },
      { level: "level" as const, building: "A", floorLevel: "2", unit: "" },
      { level: "unit" as const, building: "A", floorLevel: "2", unit: "101" },
    ];
    for (const c of cases) {
      const ref = buildFieldNotesUnitRef(c);
      expect(parseFieldNotesLocation(ref).level).toBe(c.level);
    }
  });
});

describe("normalizeFieldNotesUnitRef()", () => {
  it("maps project sentinels to null", () => {
    expect(normalizeFieldNotesUnitRef("||")).toBeNull();
    expect(normalizeFieldNotesUnitRef("")).toBeNull();
    expect(normalizeFieldNotesUnitRef(null)).toBeNull();
  });

  it("preserves concrete unit refs", () => {
    expect(normalizeFieldNotesUnitRef("A|1|U1")).toBe("A|1|U1");
  });
});

describe("buildFieldNotesLocationMatrix()", () => {
  it("dedupes and sorts hierarchy", () => {
    const matrix = buildFieldNotesLocationMatrix([
      { building: "B", level: "2", unit: "U2" },
      { building: "A", level: "1", unit: "U1" },
      { building: "A", level: "1", unit: "U1" },
    ]);
    expect(matrix.buildings).toEqual(["A", "B"]);
    expect(matrix.levelsByBuilding.A).toEqual(["1"]);
    expect(matrix.unitsByBuildingLevel["A|1"]).toEqual(["U1"]);
  });
});
