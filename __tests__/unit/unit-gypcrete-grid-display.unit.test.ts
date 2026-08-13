import { describe, it, expect } from "vitest";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  deriveUnitGypcreteGridStatus,
  gypcreteGridDropletFillColor,
  mergeUnitGypcreteOntoCards,
} from "@/lib/inspections/unit-gypcrete-grid-display";

const UNIT_REF = "North|6|N124";

function gypcreteSub(
  partial: Partial<InspectionSubmission> & Pick<InspectionSubmission, "id" | "outcome">,
): InspectionSubmission {
  return {
    formId: "form-gyp",
    formNameSnapshot: "Gypcrete Moisture Test",
    categorySnapshot: "GYPCRETE_MOISTURE_TEST",
    level: "unit",
    projectId: "p1",
    unitId: UNIT_REF,
    submittedAt: "2026-06-01T12:00:00Z",
    submittedBy: "Inspector",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
    ...partial,
  };
}

describe("unit-gypcrete-grid-display", () => {
  it("deriveUnitGypcreteGridStatus ignores scope-level gypcrete rows", () => {
    const subs = [
      gypcreteSub({
        id: "scope-wrong",
        scopeRowId: "row-til",
        outcome: "FAIL",
      }),
      gypcreteSub({
        id: "unit-pass",
        scopeRowId: undefined,
        outcome: "PASS",
        submittedAt: "2026-06-02T12:00:00Z",
      }),
    ];
    expect(deriveUnitGypcreteGridStatus(subs, UNIT_REF)).toBe("PASSED");
  });

  it("mergeUnitGypcreteOntoCards hides droplet when unit has no flooring scope", () => {
    const merged = mergeUnitGypcreteOntoCards(
      [
        {
          key: UNIT_REF,
          scopes: [{ scopeType: { code: "CAB", canonicalScopeType: { code: "CAB" } } }],
        },
      ],
      [gypcreteSub({ id: "u1", outcome: "PASS" })],
    );
    expect(merged[0].gypcreteInspectionStatus).toBeUndefined();
  });

  it("mergeUnitGypcreteOntoCards sets null when flooring unit has no unit-level gypcrete", () => {
    const merged = mergeUnitGypcreteOntoCards(
      [
        {
          key: UNIT_REF,
          scopes: [{ scopeType: { code: "TIL", canonicalScopeType: { code: "TIL" } } }],
        },
      ],
      [],
    );
    expect(merged[0].gypcreteInspectionStatus).toBeNull();
  });

  it("mergeUnitGypcreteOntoCards maps fail outcome to FAILED", () => {
    const merged = mergeUnitGypcreteOntoCards(
      [
        {
          key: UNIT_REF,
          scopes: [{ scopeType: { code: "TIL", canonicalScopeType: { code: "TIL" } } }],
        },
      ],
      [gypcreteSub({ id: "u1", outcome: "FAIL" })],
    );
    expect(merged[0].gypcreteInspectionStatus).toBe("FAILED");
  });

  it("gypcreteGridDropletFillColor uses pass/fail/neutral tokens", () => {
    expect(gypcreteGridDropletFillColor("PASSED")).toBe("var(--green-500)");
    expect(gypcreteGridDropletFillColor("FAILED")).toBe("var(--scope-tile-failed-bg)");
    expect(gypcreteGridDropletFillColor(null)).toBe("var(--neutral-400)");
  });
});
