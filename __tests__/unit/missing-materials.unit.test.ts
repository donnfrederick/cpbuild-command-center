import { describe, expect, it } from "vitest";
import {
  formatMissingMaterialQuantityDisplay,
  missingMaterialsFieldsComplete,
  parseMissingMaterialQuantity,
  resolveSelectedScopeUom,
  validateMissingMaterialsForIssueType,
} from "@/lib/issues/missing-materials";

describe("missing-materials helpers", () => {
  it("parseMissingMaterialQuantity accepts positive decimals and rejects invalid input", () => {
    expect(parseMissingMaterialQuantity("12")).toBe(12);
    expect(parseMissingMaterialQuantity("12.5")).toBe(12.5);
    expect(parseMissingMaterialQuantity("0")).toBeNull();
    expect(parseMissingMaterialQuantity("-3")).toBeNull();
    expect(parseMissingMaterialQuantity("abc")).toBeNull();
    expect(parseMissingMaterialQuantity("")).toBeNull();
  });

  it("resolveSelectedScopeUom prefers selected scopes and falls back to a single scope", () => {
    const scopes = [
      { id: "row-1", uom: { code: "SF", name: "Square Feet" } },
      { id: "row-2", uom: { code: "EA", name: "Each" } },
    ];
    expect(resolveSelectedScopeUom(scopes, ["row-2"])).toEqual({ code: "EA", name: "Each" });
    expect(resolveSelectedScopeUom([scopes[0]], [])).toEqual({ code: "SF", name: "Square Feet" });
    expect(resolveSelectedScopeUom(scopes, [])).toBeNull();
  });

  it("missingMaterialsFieldsComplete requires description and quantity only for MISSING_MATERIALS", () => {
    expect(missingMaterialsFieldsComplete("OTHER", "", "")).toBe(true);
    expect(missingMaterialsFieldsComplete("MISSING_MATERIALS", "", "")).toBe(false);
    expect(missingMaterialsFieldsComplete("MISSING_MATERIALS", "Quartz slab", "2")).toBe(true);
  });

  it("validateMissingMaterialsForIssueType enforces required fields for MISSING_MATERIALS", () => {
    expect(validateMissingMaterialsForIssueType("OTHER", {})).toBeNull();
    expect(
      validateMissingMaterialsForIssueType("MISSING_MATERIALS", {
        missingMaterialDescription: "",
        missingMaterialQuantity: 1,
      }),
    ).toBe("Missing material description is required");
    expect(
      validateMissingMaterialsForIssueType("MISSING_MATERIALS", {
        missingMaterialDescription: "LVP cartons",
        missingMaterialQuantity: undefined,
      }),
    ).toBe("Missing material quantity must be a positive number");
    expect(
      validateMissingMaterialsForIssueType("MISSING_MATERIALS", {
        missingMaterialDescription: "LVP cartons",
        missingMaterialQuantity: 4,
      }),
    ).toBeNull();
  });

  it("formatMissingMaterialQuantityDisplay appends UOM code when present", () => {
    expect(formatMissingMaterialQuantityDisplay(12, "SF")).toBe("12 SF");
    expect(formatMissingMaterialQuantityDisplay("3.5", null)).toBe("3.5");
    expect(formatMissingMaterialQuantityDisplay(null, "EA")).toBeNull();
  });
});
