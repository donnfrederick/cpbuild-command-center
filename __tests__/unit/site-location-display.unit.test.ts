import { describe, it, expect } from "vitest";
import { formatUnifierSiteLocation } from "@/lib/unifier/site-location-display";

describe("formatUnifierSiteLocation()", () => {
  it("returns address only when state is empty", () => {
    expect(formatUnifierSiteLocation("123 Main St", null)).toBe("123 Main St");
    expect(formatUnifierSiteLocation("123 Main St", "")).toBe("123 Main St");
    expect(formatUnifierSiteLocation("123 Main St", "   ")).toBe("123 Main St");
  });

  it("returns state only when address is empty", () => {
    expect(formatUnifierSiteLocation(null, "TX")).toBe("TX");
    expect(formatUnifierSiteLocation("", "TX")).toBe("TX");
  });

  it("appends state after address with comma", () => {
    expect(formatUnifierSiteLocation("100 Main St", "TX")).toBe("100 Main St, TX");
  });

  it("does not duplicate state when address already ends with same token", () => {
    expect(formatUnifierSiteLocation("100 Main St, TX", "TX")).toBe("100 Main St, TX");
    expect(formatUnifierSiteLocation("100 Main St,tx", "TX")).toBe("100 Main St,tx");
  });

  it("trims inputs", () => {
    expect(formatUnifierSiteLocation("  100 Main St  ", "  TX  ")).toBe("100 Main St, TX");
  });
});
