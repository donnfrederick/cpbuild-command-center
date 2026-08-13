import { describe, it, expect } from "vitest";
import {
  FLOORING_CANONICAL_SCOPE_CODES,
  isFlooringCanonicalCode,
  resolveScopeCanonicalCode,
  unitHasFlooringScope,
} from "@/lib/inspections/flooring-scope-eligibility";

function scopeWithCode(code: string, canonical = true) {
  return canonical
    ? { scopeType: { canonicalScopeType: { code }, code: "LEGACY" } }
    : { scopeType: { code } };
}

describe("flooring-scope-eligibility", () => {
  it("exports all nine floor-covering canonical codes", () => {
    expect(FLOORING_CANONICAL_SCOPE_CODES).toEqual([
      "CPB", "CPT", "HDW", "LVT", "RAF", "RBF", "TIL", "VCT", "VYL",
    ]);
  });

  it("resolveScopeCanonicalCode prefers canonical over legacy code", () => {
    expect(resolveScopeCanonicalCode(scopeWithCode("TIL"))).toBe("TIL");
    expect(resolveScopeCanonicalCode({ scopeType: { code: "TILE" } })).toBe("TILE");
  });

  it("unitHasFlooringScope is true when any scope is floor-covering", () => {
    expect(
      unitHasFlooringScope([
        scopeWithCode("CAB"),
        scopeWithCode("TIL"),
      ]),
    ).toBe(true);
  });

  it("unitHasFlooringScope is false for non-flooring-only units", () => {
    expect(
      unitHasFlooringScope([
        scopeWithCode("CAB"),
        scopeWithCode("TOP"),
      ]),
    ).toBe(false);
  });

  it("isFlooringCanonicalCode matches each floor-covering code", () => {
    for (const code of FLOORING_CANONICAL_SCOPE_CODES) {
      expect(isFlooringCanonicalCode(code)).toBe(true);
    }
    expect(isFlooringCanonicalCode("CAB")).toBe(false);
  });
});
