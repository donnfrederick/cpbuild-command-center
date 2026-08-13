import { describe, expect, it } from "vitest";
import {
  buildFieldLogLocationFilterOptions,
  buildFieldLogLocationUnitRefWhere,
  fieldLogLocationFieldsFromUnitRef,
  fieldLogLocationFilterSummary,
  matchesFieldLogLocationFilter,
} from "@/lib/field-log-location-filter";

describe("field-log-location-filter", () => {
  it("parses unitRef into building and level fields", () => {
    expect(fieldLogLocationFieldsFromUnitRef("||")).toEqual({ building: null, level: null });
    expect(fieldLogLocationFieldsFromUnitRef("A|2|101")).toEqual({
      building: "A",
      level: "2",
    });
    expect(fieldLogLocationFieldsFromUnitRef("A|2")).toEqual({
      building: "A",
      level: "2",
    });
  });

  it("buildFieldLogLocationFilterOptions groups buildings and levels", () => {
    expect(
      buildFieldLogLocationFilterOptions([
        { unitRef: "A|2|101" },
        { unitRef: "A|3|102" },
        { unitRef: "B|1|201" },
      ]),
    ).toEqual({
      buildings: ["A", "B"],
      buildingLevels: {
        A: ["2", "3"],
        B: ["1"],
      },
    });
  });

  it("matchesFieldLogLocationFilter supports whole-building and level-only selection", () => {
    const unit = "A|2|101";
    expect(matchesFieldLogLocationFilter(unit, ["A"], [])).toBe(true);
    expect(matchesFieldLogLocationFilter(unit, [], ["A::2"])).toBe(true);
    expect(matchesFieldLogLocationFilter(unit, [], ["A::3"])).toBe(false);
    expect(matchesFieldLogLocationFilter(unit, ["B"], ["A::2"])).toBe(true);
  });

  it("buildFieldLogLocationUnitRefWhere mirrors client hierarchy filters", () => {
    expect(buildFieldLogLocationUnitRefWhere(["North"])).toEqual({
      OR: [{ unitRef: { startsWith: "North|" } }, { unitRef: "North" }],
    });

    expect(buildFieldLogLocationUnitRefWhere([], ["North::2"])).toEqual({
      OR: [
        { unitRef: "North|2" },
        { unitRef: "North|2|" },
        { unitRef: { startsWith: "North|2|" } },
      ],
    });

    expect(buildFieldLogLocationUnitRefWhere(["project"])).toEqual({
      OR: [{ OR: [{ unitRef: null }, { unitRef: "" }, { unitRef: "||" }] }],
    });
  });

  it("fieldLogLocationFilterSummary describes active location filters", () => {
    expect(fieldLogLocationFilterSummary([], [])).toBeNull();
    expect(fieldLogLocationFilterSummary(["A"], ["A::2"])).toBe("Location: 1 building, 1 level");
  });
});
