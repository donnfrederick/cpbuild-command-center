import { describe, expect, it } from "vitest";
import { resolveObservationTypeBadgeMeta, resolveObservationTypeDisplayName } from "@/lib/observations/observationDisplay";

describe("resolveObservationTypeDisplayName", () => {
  it("falls back to OTHER when observationType is null or empty", () => {
    expect(resolveObservationTypeDisplayName(null)).toBe("Other");
    expect(resolveObservationTypeDisplayName(undefined)).toBe("Other");
    expect(resolveObservationTypeDisplayName("")).toBe("Other");
    expect(resolveObservationTypeDisplayName("   ")).toBe("Other");
  });
});

describe("resolveObservationTypeBadgeMeta", () => {
  it("does not throw when observationType is missing", () => {
    expect(resolveObservationTypeBadgeMeta(null).label).toBe("Other");
    expect(resolveObservationTypeBadgeMeta(undefined).label).toBe("Other");
  });
});
