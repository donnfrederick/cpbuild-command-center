import { describe, it, expect } from "vitest";
import {
  isPublishedUnitLevelGypcreteForm,
  normalizeGypcreteFormSetup,
} from "@/lib/inspections/gypcrete-form-rules";

describe("gypcrete-form-rules", () => {
  it("normalizeGypcreteFormSetup forces unit level and clears scope tags", () => {
    expect(
      normalizeGypcreteFormSetup({
        category: "GYPCRETE_MOISTURE_TEST",
        level: "scope",
        scopeTypeCodes: ["TIL"],
      }),
    ).toEqual({
      category: "GYPCRETE_MOISTURE_TEST",
      level: "unit",
      scopeTypeCodes: [],
    });
  });

  it("normalizeGypcreteFormSetup leaves non-Gypcrete forms unchanged", () => {
    const input = {
      category: "CLEAR_INSPECTION",
      level: "scope" as const,
      scopeTypeCodes: ["CAB"],
    };
    expect(normalizeGypcreteFormSetup(input)).toEqual(input);
  });

  it("isPublishedUnitLevelGypcreteForm rejects scope-level Gypcrete", () => {
    expect(
      isPublishedUnitLevelGypcreteForm({
        id: "f1",
        status: "published",
        level: "scope",
        category: "GYPCRETE_MOISTURE_TEST",
      }),
    ).toBe(false);
  });

  it("isPublishedUnitLevelGypcreteForm accepts published unit-level Gypcrete", () => {
    expect(
      isPublishedUnitLevelGypcreteForm({
        id: "f1",
        status: "published",
        level: "unit",
        category: "GYPCRETE_MOISTURE_TEST",
      }),
    ).toBe(true);
  });
});
