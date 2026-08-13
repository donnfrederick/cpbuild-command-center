import { describe, it, expect } from "vitest";
import {
  isPublishedFormEligibleForScopeHub,
  isPublishedGypcreteFormEligibleForUnit,
} from "@/lib/inspections/scope-hub-form-eligibility";
import { resolveInspectionSubmissionBinding } from "@/lib/inspections/inspection-submission-binding";

const UNIT_LEVEL_GYPCRETE = {
  id: "f1",
  name: "Gypcrete",
  description: "",
  status: "published" as const,
  level: "unit" as const,
  category: "GYPCRETE_MOISTURE_TEST" as const,
  scopeTypeCodes: [],
  sections: [],
};

const SCOPE_LEVEL_GYPCRETE = {
  ...UNIT_LEVEL_GYPCRETE,
  level: "scope" as const,
  scopeTypeCodes: ["TIL"],
};

describe("scope-hub-form-eligibility", () => {
  it("shows unit-level Gypcrete on flooring scopes in the status hub", () => {
    expect(isPublishedFormEligibleForScopeHub(UNIT_LEVEL_GYPCRETE, "TIL")).toBe(true);
  });

  it("hides Gypcrete on non-flooring scopes", () => {
    expect(isPublishedFormEligibleForScopeHub(UNIT_LEVEL_GYPCRETE, "CAB")).toBe(false);
  });

  it("does not show scope-level Gypcrete forms in the hub", () => {
    expect(isPublishedFormEligibleForScopeHub(SCOPE_LEVEL_GYPCRETE, "TIL")).toBe(false);
  });
});

describe("isPublishedGypcreteFormEligibleForUnit", () => {
  const tilScope = {
    scopeType: { code: "TIL", canonicalScopeType: { code: "TIL" } },
  };

  it("accepts unit-level published Gypcrete when unit has flooring", () => {
    expect(isPublishedGypcreteFormEligibleForUnit(UNIT_LEVEL_GYPCRETE, [tilScope])).toBe(
      true,
    );
  });

  it("rejects scope-level Gypcrete even when unit has flooring", () => {
    expect(isPublishedGypcreteFormEligibleForUnit(SCOPE_LEVEL_GYPCRETE, [tilScope])).toBe(
      false,
    );
  });
});

describe("inspection-submission-binding", () => {
  it("binds Gypcrete at unit level even when opened from a scope hub", () => {
    expect(
      resolveInspectionSubmissionBinding({
        category: "GYPCRETE_MOISTURE_TEST",
        formLevel: "scope",
        scopeRowId: "row-til",
        scopeTypeCode: "TIL",
      }),
    ).toEqual({
      level: "unit",
      scopeRowId: undefined,
      scopeTypeCode: undefined,
    });
  });
});
