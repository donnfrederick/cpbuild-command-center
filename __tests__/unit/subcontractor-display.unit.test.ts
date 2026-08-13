import { describe, expect, it } from "vitest";
import {
  UNKNOWN_SUBCONTRACTOR_LABEL,
  isOpaqueSubcontractorId,
  resolveSubcontractorLabelFromLookup,
} from "@/lib/subcontractor-display";

describe("subcontractor-display", () => {
  it("isOpaqueSubcontractorId flags numeric Unifier ids", () => {
    expect(isOpaqueSubcontractorId("7")).toBe(true);
    expect(isOpaqueSubcontractorId("MOCK-SUB-001")).toBe(false);
    expect(isOpaqueSubcontractorId(UNKNOWN_SUBCONTRACTOR_LABEL)).toBe(true);
  });

  it("resolveSubcontractorLabelFromLookup returns name when present", () => {
    const lookup = new Map([["7", "CABIU"]]);
    expect(resolveSubcontractorLabelFromLookup("7", lookup)).toBe("CABIU");
  });

  it("resolveSubcontractorLabelFromLookup never returns a raw id", () => {
    const lookup = new Map<string, string>();
    expect(resolveSubcontractorLabelFromLookup("7", lookup)).toBe(UNKNOWN_SUBCONTRACTOR_LABEL);
  });
});
