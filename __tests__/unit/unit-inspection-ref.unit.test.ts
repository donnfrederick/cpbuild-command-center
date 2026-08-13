import { describe, it, expect } from "vitest";
import {
  buildInspectionActivityLocationMetadata,
  isProjectLevelInspectionUnitId,
  isValidUnitInspectionRef,
  parseUnitInspectionRef,
  PROJECT_LEVEL_INSPECTION_UNIT_ID,
  unitInspectionRef,
  validateFormLevelScopeBinding,
} from "@/lib/inspections/unit-inspection-ref";

describe("unitInspectionRef", () => {
  it("joins building, level, and unit with pipes", () => {
    expect(
      unitInspectionRef({ building: "B1", level: "3", unit: "209" }),
    ).toBe("B1|3|209");
  });

  it("uses empty strings for null parts", () => {
    expect(unitInspectionRef({ building: null, level: null, unit: "101" })).toBe("||101");
  });
});

describe("isValidUnitInspectionRef", () => {
  it("accepts refs with a non-empty unit segment", () => {
    expect(isValidUnitInspectionRef("B1|3|209")).toBe(true);
    expect(isValidUnitInspectionRef("||101")).toBe(true);
  });

  it("rejects refs without a unit segment", () => {
    expect(isValidUnitInspectionRef("B1|3|")).toBe(false);
    expect(isValidUnitInspectionRef("B1|3")).toBe(false);
  });
});

describe("parseUnitInspectionRef", () => {
  it("splits building, level, and unit from a location ref", () => {
    expect(parseUnitInspectionRef("North|2|N208")).toEqual({
      building: "North",
      level: "2",
      unit: "N208",
    });
  });

  it("returns null for invalid refs", () => {
    expect(parseUnitInspectionRef("North|2|")).toBeNull();
  });
});

describe("buildInspectionActivityLocationMetadata", () => {
  it("returns unit location without scope for unit-level inspections", () => {
    expect(
      buildInspectionActivityLocationMetadata({
        unitId: "North|2|N208",
      }),
    ).toEqual({
      building: "North",
      level: "2",
      unit: "N208",
    });
  });

  it("includes scope name for scope-level inspections", () => {
    expect(
      buildInspectionActivityLocationMetadata({
        scopeRowId: "row-1",
        scopeRow: {
          building: "North",
          level: "2",
          unit: "N208",
          scopeType: { name: "Cabinetry" },
        },
      }),
    ).toEqual({
      building: "North",
      level: "2",
      unit: "N208",
      scopeRowId: "row-1",
      scopeName: "Cabinetry",
    });
  });

  it("returns empty location for project-level sentinel unitId", () => {
    expect(
      buildInspectionActivityLocationMetadata({
        unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
      }),
    ).toEqual({
      building: "",
      level: "",
      unit: "",
    });
  });

  it("preserves scopeRowId when scope row is not loaded yet", () => {
    expect(
      buildInspectionActivityLocationMetadata({
        scopeRowId: "row-1",
        scopeTypeCode: "Cabinetry",
      }),
    ).toEqual({
      building: "",
      level: "",
      unit: "",
      scopeRowId: "row-1",
      scopeName: "Cabinetry",
    });
  });
});

describe("validateFormLevelScopeBinding", () => {
  it("requires scopeRowId for scope-level forms", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "scope",
        unitId: "row-id",
      }),
    ).toEqual({
      ok: false,
      status: 422,
      error: "Scope-level forms require scopeRowId",
    });
  });

  it("rejects scopeRowId on unit-level forms", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "unit",
        unitId: "B1|3|209",
        scopeRowId: "row-1",
      }),
    ).toEqual({
      ok: false,
      status: 422,
      error: "Unit-level forms cannot include scopeRowId",
    });
  });

  it("accepts unit-level Gypcrete when DB form is mis-tagged as scope-level", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "scope",
        formCategory: "GYPCRETE_MOISTURE_TEST",
        unitId: "B1|3|209",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts unit-level forms with valid unit ref and no scope", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "unit",
        unitId: "B1|3|209",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts project-level forms with sentinel unitId and no scope", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "project",
        unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
      }),
    ).toEqual({ ok: true });
    expect(isProjectLevelInspectionUnitId(PROJECT_LEVEL_INSPECTION_UNIT_ID)).toBe(true);
  });

  it("rejects project-level forms with scopeRowId", () => {
    expect(
      validateFormLevelScopeBinding({
        formLevel: "project",
        unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
        scopeRowId: "row-1",
      }),
    ).toEqual({
      ok: false,
      status: 422,
      error: "Project-level forms cannot include scopeRowId",
    });
  });
});
