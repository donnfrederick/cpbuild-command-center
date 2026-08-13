import { describe, it, expect } from "vitest";
import {
  buildSubcontractorActivitySummary,
  subcontractorActivityBadgeKind,
} from "@/lib/activity-subcontractor-summary";

describe("subcontractorActivityBadgeKind()", () => {
  it("returns assigned when setting from empty", () => {
    expect(
      subcontractorActivityBadgeKind({
        fromUnifierSubId: null,
        toUnifierSubId: "sub-1",
      }),
    ).toBe("assigned");
  });

  it("returns cleared when removing subcontractor", () => {
    expect(
      subcontractorActivityBadgeKind({
        fromUnifierSubId: "sub-1",
        toUnifierSubId: null,
      }),
    ).toBe("cleared");
  });

  it("returns updated when changing subcontractor", () => {
    expect(
      subcontractorActivityBadgeKind({
        fromUnifierSubId: "sub-1",
        toUnifierSubId: "sub-2",
      }),
    ).toBe("updated");
  });
});

describe("buildSubcontractorActivitySummary()", () => {
  const locationMetadata = {
    building: "North",
    level: "2",
    unit: "N208",
    scopeName: "Cabinetry",
  };

  it("describes assignment with subcontractor name when scope is not on the chip", () => {
    expect(
      buildSubcontractorActivitySummary({
        scopeName: "Cabinetry",
        subcontractorName: "Acme Install LLC",
        toUnifierSubId: "sub-99",
      }),
    ).toBe('Set Cabinetry subcontractor to "Acme Install LLC"');
  });

  it("omits scope from description when it appears on the location chip", () => {
    expect(
      buildSubcontractorActivitySummary({
        ...locationMetadata,
        subcontractorName: "Acme Install LLC",
        toUnifierSubId: "sub-99",
      }),
    ).toBe('Set subcontractor to "Acme Install LLC"');
  });

  it("describes clearing subcontractor", () => {
    expect(
      buildSubcontractorActivitySummary({
        ...locationMetadata,
        subcontractorName: "Unassigned",
        toUnifierSubId: null,
      }),
    ).toBe("Cleared subcontractor");
  });

  it("describes legacy rows without subcontractor name", () => {
    expect(
      buildSubcontractorActivitySummary({
        ...locationMetadata,
        changedFields: ["unifierSubId"],
      }),
    ).toBe("Set subcontractor");
  });

  it("ignores non-string subcontractorName metadata", () => {
    expect(
      buildSubcontractorActivitySummary({
        ...locationMetadata,
        subcontractorName: { bad: "object" },
        toUnifierSubId: "sub-99",
      }),
    ).toBe("Set subcontractor");
  });
});
